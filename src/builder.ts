import stream from 'stream';
import { SpawnOptions } from 'child_process';
import { isPlainObject } from 'is-what';
import { Keyed } from './config';
import Params from './params';
import * as iterable from './iterable';
import { Language, LanguageDefinition } from './language';
import Runner, { RunnerConfig, ExecOptions } from './runner';

type StringIterable = iterable.AnyIterable<string>;

export interface BuilderOptions {
    name: string;
    language: Language | LanguageDefinition;
    runner: Runner | RunnerConfig;
    params?: [string, string | any, any?][];
    args?: string;
}

export type BuilderFactory = (
    strings: string[],
    values: any[],
    options?: Partial<BuilderOptions>
) => Builder;

export interface BuilderConstructor {
    new (strings: string[], values: any[], options: BuilderOptions): Builder;
}

interface BuilderPipeOptions extends stream.FinishedOptions {
    end?: boolean;
    chunkSize?: number;
    params?: Keyed;
}
export class Builder {
    static isBuilderClass(cls: any): cls is BuilderConstructor {
        return (
            cls === Builder ||
            (!!cls.prototype && cls.prototype instanceof Builder)
        );
    }

    static isBuilder(instance: any): instance is Builder {
        return instance && instance instanceof Builder;
    }

    name: string;
    _strings: string[];
    _values: any[];
    _language: Language;
    _runner: Runner;
    _params: Params;
    _args?: string;

    constructor(
        strings: string[],
        values: any[],
        { name, language = {}, runner, params = [], args }: BuilderOptions
    ) {
        this.name = name;
        this._strings = strings;
        this._values = values ?? [];
        this._language = Language.isLanguage(language)
            ? language
            : new Language(name, language);
        this._runner = Runner.isRunner(runner)
            ? runner
            : new Runner(name, runner);
        this._params = new Params();
        this._args = args;
        for (const [local, dest, value] of params) {
            this.param(local, dest, value);
        }
    }

    param(name: string, destName: string | any, defaultValue: any) {
        this._params.add(name, destName, defaultValue);
    }

    run(args: any[], options: ExecOptions, spawn?: SpawnOptions) {
        const params: Keyed = {};
        if (this._args) {
            params[this._args] = args;
        }
        return this.exec(params, options, spawn);
    }

    exec(params: Keyed, options: ExecOptions, spawn?: SpawnOptions) {
        return this._runner.exec(this.stream(params), options, spawn);
    }

    stream(params: Keyed, maxSize = 4 * 1024) {
        return stream.Readable.from(this.chunks(params, maxSize), {
            objectMode: false,
            encoding: 'utf8'
        });
    }

    async pipe(destination: stream.Writable, options: BuilderPipeOptions) {
        const { chunkSize = 0, params = {} } = options;
        const source = this.stream(params, chunkSize);
        source.pipe(destination, options);
        return new Promise((resolve, reject) => {
            const cleanup = stream.finished(source, options, err => {
                cleanup();
                try {
                    source.unpipe(destination);
                } catch (e) {
                    // ignore
                }
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async *chunks(params: Keyed, maxSize = 0): StringIterable {
        for await (let chunk of this._content(params)) {
            if (maxSize === 0 || chunk.length < maxSize) {
                yield chunk;
            } else {
                while (chunk.length > maxSize) {
                    yield chunk.slice(0, maxSize);
                    chunk = chunk.slice(maxSize);
                }
            }
        }
    }

    async content(params?: Keyed): Promise<string> {
        const content = [];
        for await (const chunk of this._content(params)) {
            content.push(chunk);
        }
        return content.join('');
    }

    _declare(params?: Keyed) {
        return this._language.declare(this._params.entries(params));
    }

    _content(params?: Keyed): StringIterable {
        return iterable.chain(
            this._head(),
            this._declare(params),
            this._body(),
            this._foot()
        );
    }

    _head(): StringIterable {
        return iterable.empty;
    }

    async *_body(): StringIterable {
        const lang = this._language;
        const values = this._values;
        const strings = this._strings;
        const len = values.length;
        yield strings[0];
        for (let i = 0; i < len; i++) {
            yield* lang.pull(values[i], 'body');
            yield strings[i + 1];
        }
    }

    _foot(): StringIterable {
        return iterable.empty;
    }

    toString() {
        return this.content();
    }
}

export default Builder;
