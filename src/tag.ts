import fs from 'fs';
import Builder, { BuilderFactory, BuilderOptions } from './builder';
import { REPR } from './language';
import { ReprReturn } from './language-types';
import { Keyed } from './config';

import { types } from './types';

/**
 * Bypass the type translation and return the raw value to the
 * Builder stream.
 * @param value Value to pass
 */
export const raw = (value: ReprReturn) => ({ [REPR]: value });

type IncludeOpts = Parameters<typeof fs.createReadStream>[1];
/**
 * Include a file's content into the stream.
 * This is a wrapper around
 * {@link https://nodejs.org/dist/latest/docs/api/fs.html#fs_fs_createreadstream_path_options fs.createReadStream}
 *  refer to the node documentation for argument descriptions.
 *
 * @param filepath
 * @param options
 */
export const include = (filepath: fs.PathLike, options?: IncludeOpts) => {
    const opts: Keyed | undefined =
        typeof options === 'string'
            ? {
                  encoding: options
              }
            : options;

    return {
        // lazy create stream
        [REPR]: () =>
            fs.createReadStream(filepath, {
                encoding: 'utf8',
                ...opts
            })
    };
};

export interface FactoryWithTools extends BuilderFactory {
    raw: typeof raw;
    include: typeof include;
}

export const applyTools = (dest: BuilderFactory): FactoryWithTools => {
    return Object.assign(dest, {
        raw,
        include
    });
};

export type ParserType = (string: string) => Keyed | undefined;

const optionsParser = (string: string): Keyed | undefined => {
    if (!string) {
        return;
    }
    try {
        return JSON.parse(string);
    } catch (e) {
        // warn about not parsing
    }
    return;
};

const shebang = /^#!(?:(?:\/(?:usr\/(?:local\/)?)?)?bin\/(?:env[ \t]+)?(\w+))?[ \t]*({.*})?[ \t]*\r?\n/;
const parseHeader = (
    head: string,
    parser: ParserType = optionsParser
): [string, string?, Keyed?] => {
    if (!head) {
        return ['', undefined, undefined];
    }
    let start = 0;
    if (head.startsWith('\n')) {
        start = 1;
    } else if (head.startsWith('\r\n')) {
        start = 2;
    }
    // remove starting line break
    let remain = start > 0 ? head.slice(start) : head;
    let type;
    let options;
    let match = remain.match(shebang);

    if (match) {
        start = match[0].length;
        type = match[1];
        options = parser(match[2]);
        // remove leader line
        remain = remain.slice(start);
    }
    // return new header, type and options
    return [remain, type, options];
};

const processStrings = (strings: string[]): [string[], string?, Keyed?] => {
    const [remain, type, options] = parseHeader(strings[0]);
    return [[remain].concat(strings.slice(1)), type, options];
};

// return a template function but don't add to types
export const create = (
    name: string,
    factory: BuilderFactory,
    defaults?: BuilderOptions
) => {
    return applyTools(
        (strings: string[], ...values: any[]): Builder => {
            const [cleaned, , options] = processStrings(strings);
            return factory(cleaned, values, {
                name,
                ...defaults,
                ...options
            });
        }
    );
};

// generic template handler maps to self
export const script = applyTools(
    (strings: string[], ...values: any): Builder => {
        const [cleaned, name, options] = processStrings(strings);
        const type = (name && types[name]) || types._default_;
        return type.factory(cleaned, values, {
            name: type.name,
            ...type.defaults,
            ...options
        });
    }
);
