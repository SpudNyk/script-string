import util from 'util';
import merge from 'merge-anything';
import { isPlainObject } from 'is-what';
import { iterator, AnyIterable, AnyIterator } from './iterable';
import {
    LanguageReprs,
    LanguageFormat,
    LanguageConsts,
    LanguageDefinition,
    ReprAllTypes,
    ReprContainerType,
    ReprType,
    ReprFunction,
    ReprReturn,
    ReprIterableFunction,
    StackInterface,
    Shrink,
    LanguageInterface
} from './language-types';

const isDate = util.types.isDate;

export const REPR: symbol = Symbol('repr');

const reprObject = async function*(
    object: { [key: string]: any },
    lang: LanguageInterface,
    stack: StackInterface
) {
    if (!lang.format.object) {
        return;
    }
    const format = lang.format.object;
    const formatKey = format.key;
    lang.unsupported(formatKey, `[key] of objects`);
    let { sep, start, end, assign } = format;
    const entries = Object.entries(object);

    yield start;
    stack.push('object');
    for await (const [key, value] of entries) {
        yield `${formatKey(key, lang)}${assign}`;
        yield* lang.pull(value, stack);
        yield sep;
    }
    stack.pop();
    yield end;
};

// convert to language array/list
const reprIterable = async function*(
    iterable: AnyIterable,
    lang: LanguageInterface,
    stack: StackInterface,
    length?: number
): AnyIterable<string> {
    if (!lang.format.iterable) {
        return;
    }
    const { sep, start, end } = lang.format.iterable;
    const iter = iterator(iterable) as AnyIterable & AnyIterator;
    if (start) yield start;
    stack.push('iterable');
    const first = await iter.next();
    if (!first.done) {
        yield* lang.pull(first.value, stack);
    }

    // handle remaining
    for await (const value of iter) {
        yield sep;
        yield* lang.pull(value, stack);
    }

    stack.pop();
    if (end) yield end;
};

// default is double quoted strings
const reprString = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;

const reprBoolean = (value: boolean, lang: LanguageInterface) =>
    value ? lang.consts.true : lang.consts.false;

const reprDate = (date: Date, lang: LanguageInterface, stack: StackInterface) =>
    lang.reprs.string!(date.toISOString(), lang, stack);

const reprBigInt = String;
const reprNumber = String;

const validName = /^[a-zA-Z_]\w+$/;
const formatName = (value: string, lang: LanguageInterface) => {
    lang.invalid(validName.test(value), `${value}`, 'name');
    return value;
};

const validShrink = new Set(Object.values(Shrink));

export const defaults = {
    shrinkBigInt: Shrink.SMALL,
    reprs: {
        string: reprString,
        boolean: reprBoolean,
        number: reprNumber,
        bigint: reprBigInt,
        date: reprDate,
        iterable: reprIterable,
        object: reprObject
    },
    consts: {
        true: 'true',
        false: 'false',
        null: null,
        invalid_date: null,
        nan: null,
        positive_infinity: null,
        negative_infinity: null,
        undefined: null
    },
    format: {
        indent: '  ',
        eol: '\n',
        declare: {
            name: formatName,
            assign: ' = ',
            start: '[',
            end: ']',
            sep: ', '
        },
        // 2 space indentation
        iterable: {
            sep: ', ',
            start: '[',
            end: ']',
            // array of types that are valid
            valid: false,
            // array of types that are invalid
            invalid: false
        },
        object: {
            key: reprString,
            sep: ', ',
            start: '{',
            end: '}',
            assign: ': ',
            // array of types that are valid
            valid: false,
            // array of types that are invalid
            invalid: false
            // break into new
            // into length
        }
    }
};

export class Stack implements StackInterface {
    top?: { type: ReprAllTypes; indent: string };
    stack: { type: ReprAllTypes; indent: string }[];
    constructor() {
        this.top = undefined;
        this.stack = [];
    }

    push(type: ReprAllTypes, indent?: string) {
        const defIndent = (this.top && this.top.indent) || '';
        const item = {
            type,
            indent: indent != null ? indent : defIndent
        };
        this.top = item;
        this.stack.push(item);
        return this.top;
    }

    pop() {
        return (this.top = this.stack.pop());
    }
}

const createStack = (root: ReprContainerType = 'root'): StackInterface => {
    const stack = new Stack();
    stack.push(root);
    return stack;
};

export class Language {
    name: string;
    shrinkBigInt: Shrink;
    reprs: LanguageReprs;
    consts: LanguageConsts;
    format: LanguageFormat;

    static isLanguage(value: any): value is Language {
        return value && value instanceof Language;
    }

    constructor(name: string, config: LanguageDefinition) {
        this.name = name;
        const shrink = config.shrinkBigInt;
        if (shrink === false) {
            this.shrinkBigInt = Shrink.NONE;
        } else if (shrink === true) {
            this.shrinkBigInt = Shrink.ALL;
        } else if (shrink) {
            if (!validShrink.has(shrink)) {
                throw new Error(`${shrink} must be one of ${validShrink}`);
            }
            this.shrinkBigInt = shrink;
        } else {
            this.shrinkBigInt = defaults.shrinkBigInt;
        }

        this.format = merge(defaults.format, config.format);
        this.reprs = merge(defaults.reprs, config.reprs);
        this.consts = merge(defaults.consts, config.consts);
    }

    type(val: any): ReprType {
        let type: ReprType = typeof val;
        if (type === 'number') {
            if (Number.isNaN(val)) {
                type = 'nan';
            } else if (val === Number.NEGATIVE_INFINITY) {
                type = 'negative_infinity';
            } else if (val === Number.POSITIVE_INFINITY) {
                type = 'positive_infinity';
            }
        } else if (type === 'object') {
            if (val === null) {
                type = 'null';
            } else if (REPR in val) {
                // supports the repr protocol
                return 'repr';
            } else if (Symbol.iterator in val || Symbol.asyncIterator in val) {
                type = 'iterable';
            } else if (isDate(val)) {
                type = isNaN((val as unknown) as number)
                    ? 'invalid_date'
                    : 'date';
            } else if (isPlainObject(val)) {
                type = 'object';
            } else {
                type = 'custom';
            }
        }
        return type;
    }

    invalid(condition: any, what: string, type: string): asserts condition {
        throw new Error(`${what} is an invalid ${type} for ${this.name}`);
    }

    unsupported(condition: any, what: string): asserts condition {
        if (!condition) {
            throw new Error(`${what} not supported by ${this.name}`);
        }
    }

    maybeShrink(
        val: bigint,
        bigintRepr: ReprFunction<bigint> | null | undefined,
        stack: StackInterface
    ) {
        // handle bigint
        const shrink = this.shrinkBigInt;
        if (
            shrink === Shrink.ALL ||
            (shrink === Shrink.SMALL &&
                !(
                    val < Number.MIN_SAFE_INTEGER ||
                    val > Number.MAX_SAFE_INTEGER
                ))
        ) {
            // change for error message
            const repr = this.reprs.number;
            this.unsupported(repr, `[number] (from [bigint])`);
            return repr(Number(val), this, stack);
        }
        this.unsupported(bigintRepr, `[bigint]`);
        return bigintRepr(val, this, stack);
    }

    allowedWithin(type: ReprType, parent: ReprType | ReprContainerType) {
        const details = (this.format as { [key: string]: any })[type];
        if (
            details &&
            // black list
            ((details.invalid && details.invalid.indexOf(parent) > 0) ||
                // white list
                (details.valid && details.valid.indexOf(parent) < 0))
        ) {
            return false;
        }
        return true;
    }

    // ensure this type is allowed in it's parent type
    assertAllowed(type: ReprType, stack: StackInterface) {
        const top = stack.top;
        if (top && !this.allowedWithin(type, top.type)) {
            throw new Error(
                `[${type}] not allowed in [${top.type}] for ${this.name}`
            );
        }
    }

    // get language representation of value
    repr(value: any, stack: StackInterface): ReprReturn {
        let type = this.type(value);
        if (type === 'repr') {
            // value supports repr protocol so return
            // return can be a function|promise<string|function>
            // functions will be called repeatedly until not a function is resolved
            // also iterable/asyncIterable<string> can be returnedÎÎ
            return value[REPR];
        }

        const constant = this.consts[type];
        if (constant != null) {
            return constant;
        }
        const repr: ReprFunction<any> = this.reprs[type];
        // handle big int
        if (type === 'bigint') {
            return this.maybeShrink(value, repr, stack);
        }
        this.assertAllowed(type, stack);
        this.unsupported(repr, `[${type}]`);
        if (type === 'iterable') {
            // pass in length
            const length = Array.isArray(value) ? value.length : undefined;
            return (repr as ReprIterableFunction)(value, this, stack, length);
        }
        return repr(value, this, stack);
    }

    async *declare(
        entries: Iterable<[string, any]>,
        stack?: StackInterface | ReprContainerType
    ): AsyncGenerator<string, void> {
        if (!this.format.declare) {
            return;
        }
        if (!stack || typeof stack === 'string') {
            stack = createStack(stack ?? 'declare');
        }
        const { start, end, name, assign } = this.format.declare;
        if (start) {
            yield start;
        }
        for (const [key, value] of entries) {
            yield `${name(key, this)}${assign}`;
            yield* this.pull(value, stack);
        }
        if (end) {
            yield end;
        }
    }

    // ensure a repr return value is correctly used
    async *pull(
        value: any,
        stack?: StackInterface | ReprContainerType
    ): AsyncGenerator<string, void> {
        if (!stack || typeof stack === 'string') {
            stack = createStack(stack);
        }
        let result = await this.repr(await value, stack);
        // pull nested results;
        while (result && typeof result === 'function') {
            result = await result();
        }
        if (!result) {
            return;
        }
        // result should either be a string or iterable
        if (typeof result === 'string') {
            yield result;
        } else if (
            Symbol.iterator in result ||
            Symbol.asyncIterator in result
        ) {
            yield* result;
        } else {
            // unrepresented return value
            yield '';
        }
    }
}
