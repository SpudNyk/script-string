import fs from 'fs';
import cp from 'child_process';
import util from 'util';
import stream from 'stream';
import tmp from 'tmp-promise';
import { Config, EntryResolverAsync, resolveEntry } from './config';

const pipeline = util.promisify(stream.pipeline);
/**
 * Returns a promise that resolves to the exit code of a child process.
 * @param child the child process to get the exit code for
 * @return a promices that resolves when the child has finished with it's
 * exit code.
 */
const exitCode = (child: cp.ChildProcess): Promise<number | null> => {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            child.off('error', onError);
            child.off('exit', onExit);
        };
        const onExit = (code: number | null) => {
            cleanup();
            resolve(code);
        };
        const onError = (err: Error) => {
            cleanup();
            reject(err);
        };
        child.on('error', onError);
        child.on('exit', onExit);
    });
};

export interface ExecOptions extends CommandOptions {
    stderr?: 'ignore' | 'pipe' | 'inherit';
    stdout?: 'ignore' | 'pipe' | 'inherit';
}

interface CommandConfig {
    bin: EntryResolverAsync<string>;
    common?: EntryResolverAsync<string[]>;
    stdin?: EntryResolverAsync<string[]>;
    file?: EntryResolverAsync<string[]>;
}

interface CommandOptions extends Partial<CommandConfig> {
    execStdin?: boolean;
    execFile?: EntryResolverAsync<string>;
    args?: EntryResolverAsync<string[]>;
}

export interface RunnerConfig extends Config {
    command: CommandConfig;
    extension?: string | null;
    encoding?: string;
    useStdIn?: boolean;
}

export interface ExecResult {
    /**
     * This promise will resolve when the process has finished with the
     * resulting exit code
     */
    exit: Promise<number | null>;
    /**
     * This depends on execoptions stdout
     * if 'pipe' was used them the process stdout can be accessed here.
     */
    stdout: stream.Readable | null;
    /**
     * This depends on execoptions stderr
     * if 'pipe' was used then the process stderr can be accessed here.
     */
    stderr: stream.Readable | null;
}

const defaults: RunnerConfig = {
    // command support stdin
    extension: null,
    useStdIn: true,
    encoding: 'utf8',
    command: {
        bin: 'sh'
    }
};

const concat = <T>(array: T[], extend?: T[]) =>
    extend ? array.concat(extend) : array;

class Runner {
    name: string;
    useStdIn: boolean;
    encoding: string;
    _extension?: string | null;
    _command: CommandConfig;

    static isRunner(value: any): value is Runner {
        return value && value instanceof Runner;
    }

    constructor(name: string, options: RunnerConfig) {
        const opts = {
            ...defaults,
            ...options
        };
        this.name = name;
        this.useStdIn = opts.useStdIn !== false;
        this.encoding = opts.encoding!;
        this._extension = opts.extension;
        this._command = options.command;
    }

    setCommand(command: CommandConfig) {
        this._command = command;
    }

    async _arguments(options: CommandOptions): Promise<string[]> {
        // could override in a child class to find the executable or calculate args
        const command = {
            ...this._command,
            ...options
        };
        let args: string[] = concat(
            [await resolveEntry(command.bin)],
            await resolveEntry(options.common)
        );
        if (command.execStdin) {
            args = concat(args, await resolveEntry(command.stdin));
        } else if (command.execFile) {
            args = concat(concat(args, await resolveEntry(command.file)), [
                await resolveEntry(command.execFile)
            ]);
        }
        return concat(args, await resolveEntry(command.args));
    }

    async _execUsingStdIn(
        stream: stream.Readable,
        options: ExecOptions,
        spawn?: cp.SpawnOptions
    ): Promise<ExecResult> {
        const { stdout = 'pipe', stderr = 'pipe' } = options;
        const [cmd, ...args] = await this._arguments({
            execStdin: true,
            ...options
        });
        const child = cp.spawn(cmd, args, {
            detached: false,
            ...spawn,
            stdio: ['pipe', stdout, stderr]
        });
        const exit = exitCode(child);
        const stdin = child.stdin!;
        stdin.setDefaultEncoding(this.encoding);
        try {
            await pipeline(stream, stdin);
        } finally {
            stdin.end();
        }
        return {
            exit,
            stdout: child.stdout,
            stderr: child.stderr
        };
    }

    async _execUsingFile(
        stream: stream.Readable,
        options: ExecOptions,
        spawn?: cp.SpawnOptions
    ): Promise<ExecResult> {
        const tmpOpts = this._extension
            ? { postfix: this._extension }
            : undefined;
        const { path, fd, cleanup } = await tmp.file(tmpOpts);
        try {
            const { stdout = 'pipe', stderr = 'pipe' } = options;
            // start resolving command
            const [cmd, ...args] = await this._arguments({
                execFile: path,
                ...options
            });
            const dest = fs.createWriteStream(path, {
                fd: fd,
                encoding: this.encoding
            });
            try {
                await pipeline(stream, dest);
            } finally {
                dest.close();
            }
            // path
            const child = cp.spawn(cmd, args, {
                detached: false,
                ...spawn,
                stdio: ['ignore', stdout, stderr]
            });
            const complete = exitCode(child);
            complete.finally(() => cleanup());
            return {
                exit: complete,
                stdout: child.stdout,
                stderr: child.stderr
            };
        } catch (e) {
            // if an error occurs ensure the cleanup is called;
            cleanup();
            throw e;
        }
    }

    exec(
        stream: stream.Readable,
        options: ExecOptions = {},
        spawn?: cp.SpawnOptions
    ): Promise<ExecResult> {
        if (this.useStdIn && options.execStdin !== false) {
            return this._execUsingStdIn(stream, options, spawn);
        } else {
            return this._execUsingFile(stream, options, spawn);
        }
    }
}

export default Runner;
