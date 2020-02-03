export type Keyed<T = any> = { [key: string]: T };

export interface Config extends Keyed {}

export type EntryResolver<T> = T | (() => T);
export type EntryResolverAsync<T> = EntryResolver<T> | Promise<T> | (() => Promise<T> | T);

export function resolveEntry(entry?: any) {
    if (!entry) return;
    if (typeof entry === 'function') {
        return entry();
    }
    return entry;
}
