import { create as createTag, FactoryWithTools } from './tag';
import Builder, {
    BuilderFactory,
    BuilderConstructor,
    BuilderOptions
} from './builder';
import { Keyed } from './config';

//type UnnamedBuilderOptions = Omit<BuilderOptions, 'name'>
interface UnnamedBuilderOptions extends Omit<BuilderOptions, 'name'> {
    name?: string;
}
const resolve = (
    factory: BuilderFactory | BuilderConstructor
): BuilderFactory => {
    if (Builder.isBuilderClass(factory)) {
        return (
            strings: string[],
            values: any[],
            options?: Partial<BuilderOptions>
        ): Builder => {
            if (!options) {
                throw new Error('Options not supplied for builder');
            }
            if (options.name && options.language && options.runner) {
                throw new Error('Options not supplied for builder');
            }
            return new factory(strings, values, options as BuilderOptions);
        };
    } else {
        return factory;
    }
};

interface TypeEntry {
    name: string;
    defaults?: BuilderOptions;
    factory: BuilderFactory;
}

export const types: Keyed<TypeEntry> = {
    _default_: {
        name: '_default_',
        factory: () => {
            throw new Error('No _default_ tag factory registered');
        }
    }
};

// defines the type and returns the template tag function
export const define = (
    names: string | string[],
    factory: BuilderFactory | BuilderConstructor,
    defaults?: UnnamedBuilderOptions
): FactoryWithTools => {
    if (typeof names === 'string') {
        names = [names];
    }
    // get name from defaults or use first name (name may not be in the list)
    const defaultName = (defaults && defaults.name) || names[0] || '<unknown>';
    const defaultOptions: BuilderOptions | undefined = defaults
        ? {
              name: defaultName,
              ...defaults
          }
        : undefined;
    const type: TypeEntry = {
        name: defaultName,
        defaults: defaultOptions,
        factory: resolve(factory)
    };
    for (const name of names) {
        types[name] = type;
    }
    return createTag(type.name, type.factory, type.defaults);
};

export default define;
