import { AnyIterable } from './iterable';
import { Config } from './config';

export type ReprType =
    | 'string'
    | 'boolean'
    | 'bigint'
    | 'number'
    | 'nan'
    | 'negative_infinity'
    | 'positive_infinity'
    | 'null'
    | 'repr'
    | 'undefined'
    | 'iterable'
    | 'invalid_date'
    | 'date'
    | 'object'
    | 'custom'
    | 'function'
    | 'symbol';

export type ReprContainerType =
    | 'iterable'
    | 'object'
    | 'root'
    | 'head'
    | 'declare'
    | 'body'
    | 'foot';

export type ReprAllTypes = ReprContainerType | ReprType;

export type ReprResult = string | AnyIterable<string>;
export interface ReprFuncResult {
    (): ReprFuncResult | ReprResult;
}

export type ReprReturn =
    | ReprFuncResult
    | ReprResult
    | Promise<ReprFuncResult | ReprResult>;
export interface ReprFunction<T> {
    (value: T, lang: LanguageInterface, stack: StackInterface): ReprReturn;
}

export interface ReprIterableFunction extends ReprFunction<AnyIterable> {
    (
        value: AnyIterable,
        lang: LanguageInterface,
        stack: StackInterface,
        length?: number
    ): ReprReturn;
}

type ReprEntry<T> = ReprFunction<T> | null;
export interface LanguageReprs extends Config {
    string?: ReprEntry<string>;
    boolean?: ReprEntry<boolean>;
    number?: ReprEntry<number>;
    bigint?: ReprEntry<bigint>;
    date?: ReprEntry<Date>;
    iterable?: ReprIterableFunction;
    object?: ReprEntry<{
        [key: string]: any;
    }>;
}

export interface StackInterface {
    top?: {
        type: ReprAllTypes;
        indent: string;
    };
    push(
        type: ReprAllTypes,
        indent?: string
    ): {
        type: ReprAllTypes;
        indent: string;
    };
    pop():
        | {
              type: ReprAllTypes;
              indent: string;
          }
        | undefined;
}

export enum Shrink {
    NONE = 'none',
    ALL = 'all',
    SMALL = 'small'
}
type StringFunc = (value: string, lang: LanguageInterface) => string;

/**
 * Restrict the containers this type can appear in
 */
export interface LanguageFormatContainerRestriction {
    /**
     * An array of {@link ReprContainerType container types} types that this can be in
     */
    valid: false | ReprContainerType[];
    /**
     * An array of {@link ReprContainerType container types} types that this cannot be in
     */
    invalid: false | ReprContainerType[];
}

export interface LanguageFormatList {
    start: string;
    end: string;
    sep: string;
}

export interface LanguageFormatDeclare extends LanguageFormatList {
    name: StringFunc;
    assign: string;
}

export type LanguageFormatIterable = LanguageFormatList &
    LanguageFormatContainerRestriction;

export interface LanguageFormatObject extends LanguageFormatIterable {
    key: StringFunc;
    assign: string;
}

export interface LanguageFormat extends Config {
    /**
     * Indentation - TBD
     */
    indent: string;
    /**
     * End of line separator
     */
    eol: string;
    declare?: LanguageFormatDeclare;
    iterable?: LanguageFormatIterable;
    object?: LanguageFormatObject;
}

/**
 * string representations of language
 * constants 'null' or undefined for unsupported
 */
export interface LanguageConsts extends Config {
    true?: string | null;
    false?: string | null;
    null?: string | null;
    invalid_date?: string | null;
    nan?: string | null;
    positive_infinity?: string | null;
    negative_infinity?: string | null;
    undefined?: string | null;
}

/**
 * The definition of how javascript values map to the language.
 */
export interface LanguageDefinition extends Config {
    /**
     * Whether to shrink bigints or not
     * @default Shrink.small
     */
    shrinkBigInt?: Shrink | boolean;
    /**
     * String constants (or null/undefined to not support)
     * types are attempted to be resolved here first
     */
    consts?: LanguageConsts;
    /**
     * Representations of javscript types in the target language
     */
    reprs?: LanguageReprs;
    /**
     * Formatting for language features
     * e.g. Hash Tables, Arrays, Assignment etc.
     */
    format?: LanguageFormat;
}

export interface LanguageInterface {
    name: string;
    shrinkBigInt: Shrink;
    reprs: LanguageReprs;
    consts: LanguageConsts;
    format: LanguageFormat;
    type(val: any): ReprType;
    invalid(condition: any, what: string, type: string): asserts condition;
    unsupported(condition: any, what: string): asserts condition;
    allowedWithin(
        type: ReprType,
        parent: 'iterable' | 'object' | string
    ): boolean;
    assertAllowed(type: ReprType, stack: StackInterface): void;
    repr(value: any, stack: StackInterface): ReprReturn;
    declare(
        entries: Iterable<[string, any]>,
        stack?: StackInterface | ReprContainerType
    ): AsyncGenerator<string, void>;
    pull(
        value: any,
        stack?: StackInterface | ReprContainerType
    ): AsyncGenerator<string, void>;
}
