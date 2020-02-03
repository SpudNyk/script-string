#!/usr/bin/env node
const yargs = require('yargs');
const { copyPackage } = require('./lib/package');

const main = argv => {
    const { source, destination } = argv;
    console.log(`Updating ${source} with ${destination}`);
    copyPackage(source, destination);
};

yargs.command(
    '* <source> <destination>',
    'copy package file for publishing stripping unnecessary attributes.',
    () => {},
    main
).argv;
