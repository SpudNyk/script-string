const jp = require('fs-jetpack');

const overrideDefaults = {
    scripts: undefined,
    devDependencies: undefined
};

const copyPackage = (sourceDir, destDir, overrides = overrideDefaults) => {
    const sourceFs = jp.cwd(sourceDir);
    const destFs = jp.dir(destDir);
    const source = sourceFs.read('package.json', 'json');
    const dest = {
        ...source,
        ...overrides
    };

    destFs.write('package.json', dest, {
        atomic: true,
        jsonIndent: 2
    });
};

module.exports = {
    copyPackage
};
