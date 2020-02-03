class Params {
    _names: [string, string][];
    _defaults: { [key: string]: any };
    constructor() {
        this._names = [];
        this._defaults = {};
    }

    async add(name: string, destName: string|any, defaultValue?: any) {
        if (!defaultValue) {
            defaultValue = destName
            destName = name
        }
        this._names.push([name, destName as string]);
        if (defaultValue !== undefined) {
            this._defaults[name] = defaultValue;
        }
    }

    entries(params: { [key: string]: any } = {}) {
        const defaults = this._defaults;
        const items: [string, any][] = [];
        for (const [name, dest] of this._names) {
            let value = params[name];
            if (value === undefined) {
                value = defaults[name];
            }
            if (value !== undefined) {
                items.push([dest, value]);
            }
        }
        return items;
    }
}

export default Params;
