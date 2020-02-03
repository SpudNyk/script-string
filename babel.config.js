module.exports = api => {
    const isTest = api.env('test');

    return {
        presets: ['@babel/typescript'],
        ignore: isTest
            ? undefined
            : [
                  '**/__tests__', // ignore the whole test directory
                  '**/*.test.js' // ignore test files only
              ],
        env: {
            test: {
                plugins: ['@babel/transform-modules-commonjs']
            },
            cjs: {
                presets: [
                    [
                        '@babel/preset-env',
                        {
                            modules: 'commonjs',
                            targets: {
                                node: '10'
                            }
                        }
                    ]
                ]
            },
            esm: {
                plugins: [
                    ['@babel/plugin-transform-runtime', { useESModules: true }]
                ],
                presets: [
                    [
                        '@babel/preset-env',
                        {
                            modules: false,
                            targets: {
                                esmodules: true
                            }
                        }
                    ]
                ]
            },
            es: {

            }
        }
    };
};
