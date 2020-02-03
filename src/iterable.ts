export interface FixedIterable<T = any, TReturn = any, TNext = unknown> {
    [Symbol.iterator](): Iterator<T, TReturn, TNext>;
}
export interface FixedAsyncIterable<T = any, TReturn = any, TNext = unknown> {
    [Symbol.asyncIterator](): AsyncIterator<T, TReturn, TNext>;
}

export type AnyIterable<T = any, TReturn = any, TNext = unknown> =
    | FixedIterable<T, TReturn, TNext>
    | FixedAsyncIterable<T, TReturn, TNext>;
export type AnyIterator<T = any, TReturn = any, TNext = unknown> =
    | Iterator<T, TReturn, TNext>
    | AsyncIterator<T, TReturn, TNext>;

const emptyAsync: AsyncIterator<any, any, unknown> &
    FixedIterable<any> &
    FixedAsyncIterable<any> = {
    next(): Promise<IteratorReturnResult<any>> {
        return Promise.resolve({
            value: undefined,
            done: true
        });
    },
    [Symbol.iterator]: () => empty,
    [Symbol.asyncIterator]: () => emptyAsync
};
export const empty: Iterator<any, any, unknown> &
    FixedIterable<any> &
    FixedAsyncIterable<any> = {
    next(): IteratorReturnResult<any> {
        return {
            value: undefined,
            done: true
        };
    },
    [Symbol.iterator]: () => empty,
    [Symbol.asyncIterator]: () => emptyAsync
};

export const chain = async function*(
    ...iterables: AnyIterable<any>[]
): AsyncGenerator<any> {
    for await (const iterable of iterables) {
        yield* iterable;
    }
};

export const iterator = <T>(iterable: AnyIterable<T>): AnyIterator<T> => {
    const get =
        (iterable as FixedAsyncIterable<T>)[Symbol.asyncIterator] ||
        (iterable as FixedIterable<T>)[Symbol.iterator];
    if (!get) throw new Error('Not an iterable');
    return get.call(iterable);
};
