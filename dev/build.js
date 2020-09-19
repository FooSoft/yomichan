/*
 * Copyright (C) 2020  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const childProcess = require('child_process');
const util = require('./util');
const {getAllFiles, getDefaultManifestAndVariants, createManifestString} = util;


function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function createZip(directory, outputFileName, sevenZipExes=[], onUpdate=null) {
    for (const exe of sevenZipExes) {
        try {
            childProcess.execFileSync(
                exe,
                [
                    'a',
                    outputFileName,
                    '.'
                ],
                {
                    cwd: directory
                }
            );
            return;
        } catch (e) {
            // NOP
        }
    }
    return await createJSZip(directory, outputFileName, onUpdate);
}

async function createJSZip(directory, outputFileName, onUpdate) {
    const JSZip = util.JSZip;
    const files = getAllFiles(directory, directory);
    const zip = new JSZip();
    for (const fileName of files) {
        zip.file(
            fileName.replace(/\\/g, '/'),
            fs.readFileSync(path.join(directory, fileName), {encoding: null, flag: 'r'}),
            {}
        );
    }

    if (typeof onUpdate !== 'function') {
        onUpdate = () => {}; // NOP
    }

    const data = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {level: 9}
    }, onUpdate);
    process.stdout.write('\n');

    fs.writeFileSync(outputFileName, data, {encoding: null, flag: 'w'});
}

function applyModifications(manifest, modifications) {
    if (Array.isArray(modifications)) {
        for (const modification of modifications) {
            const {action, path: path2} = modification;
            switch (action) {
                case 'set':
                    {
                        const {value: newValue} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length - 1);
                        const last = path2[path2.length - 1];
                        value[last] = clone(newValue);
                    }
                    break;
                case 'replace':
                    {
                        const {pattern, patternFlags, replacement} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length - 1);
                        const regex = new RegExp(pattern, patternFlags);
                        const last = path2[path2.length - 1];
                        let value2 = value[last];
                        value2 = `${value2}`.replace(regex, replacement);
                        value[last] = value2;
                    }
                    break;
                case 'delete':
                    {
                        const value = getObjectProperties(manifest, path2, path2.length - 1);
                        const last = path2[path2.length - 1];
                        delete value[last];
                    }
                    break;
                case 'remove':
                    {
                        const {item} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length);
                        const index = value.indexOf(item);
                        if (index >= 0) { value.splice(index, 1); }
                    }
                    break;
                case 'splice':
                    {
                        const {start, deleteCount, items} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length);
                        const itemsNew = items.map((v) => clone(v));
                        value.splice(start, deleteCount, ...itemsNew);
                    }
                    break;
            }
        }
    }

    return manifest;
}

function getObjectProperties(object, path2, count) {
    for (let i = 0; i < count; ++i) {
        object = object[path2[i]];
    }
    return object;
}

function getInheritanceChain(variant, variantMap) {
    const visited = new Set();
    const inheritance = [];
    while (true) {
        const {name, inherit} = variant;
        if (visited.has(name)) { break; }

        visited.add(name);
        inheritance.unshift(variant);

        if (typeof inherit !== 'string') { break; }

        const nextVariant = variantMap.get(inherit);
        if (typeof nextVariant === 'undefined') { break; }

        variant = nextVariant;
    }
    return inheritance;
}

function createVariantManifest(manifest, variant, variantMap) {
    let modifiedManifest = clone(manifest);
    for (const {modifications} of getInheritanceChain(variant, variantMap)) {
        modifiedManifest = applyModifications(modifiedManifest, modifications);
    }
    return modifiedManifest;
}

async function build(manifest, buildDir, extDir, manifestPath, variantMap, variantNames) {
    const sevenZipExes = ['7za', '7z'];

    // Create build directory
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, {recursive: true});
    }

    const onUpdate = (metadata) => {
        let message = `Progress: ${metadata.percent.toFixed(2)}%`;
        if (metadata.currentFile) {
            message += ` (${metadata.currentFile})`;
        }

        readline.clearLine(process.stdout);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(message);
    };

    for (const variantName of variantNames) {
        const variant = variantMap.get(variantName);
        if (typeof variant === 'undefined') { continue; }

        const {name, fileName, fileCopies} = variant;
        process.stdout.write(`Building ${name}...\n`);

        const modifiedManifest = createVariantManifest(manifest, variant, variantMap);

        const fileNameSafe = path.basename(fileName);
        const fullFileName = path.join(buildDir, fileNameSafe);
        fs.writeFileSync(manifestPath, createManifestString(modifiedManifest));
        await createZip(extDir, fullFileName, sevenZipExes, onUpdate);

        if (Array.isArray(fileCopies)) {
            for (const fileName2 of fileCopies) {
                const fileName2Safe = path.basename(fileName2);
                fs.copyFileSync(fullFileName, path.join(buildDir, fileName2Safe));
            }
        }

        process.stdout.write('\n');
    }
}

function getArs(args, argMap) {
    let key = null;
    let canKey = true;
    let onKey = false;
    for (const arg of args) {
        onKey = false;

        if (canKey && arg.startsWith('--')) {
            if (arg.length === 2) {
                canKey = false;
                key = null;
                onKey = false;
            } else {
                key = arg.substring(2);
                onKey = true;
            }
        }

        const target = argMap.get(key);
        if (typeof target === 'boolean') {
            argMap.set(key, true);
            key = null;
        } else if (typeof target === 'number') {
            argMap.set(key, target + 1);
            key = null;
        } else if (target === null || typeof target === 'string') {
            if (!onKey) {
                argMap.set(key, arg);
                key = null;
            }
        } else if (Array.isArray(target)) {
            if (!onKey) {
                target.push(arg);
                key = null;
            }
        } else {
            console.error(`Unknown argument: ${arg}`);
            key = null;
        }
    }

    return argMap;
}


async function main() {
    const argv = process.argv.slice(2);
    const args = getArs(argv, new Map([
        ['all', false],
        ['default', false],
        ['manifest', null],
        [null, []]
    ]));

    const {manifest, variants} = getDefaultManifestAndVariants();

    const rootDir = path.join(__dirname, '..');
    const extDir = path.join(rootDir, 'ext');
    const buildDir = path.join(rootDir, 'builds');
    const manifestPath = path.join(extDir, 'manifest.json');

    const variantMap = new Map();
    for (const variant of variants) {
        variantMap.set(variant.name, variant);
    }

    try {
        const variantNames = (argv.length === 0 || args.get('all') ? variants.map(({name}) => name) : args.get(null));
        await build(manifest, buildDir, extDir, manifestPath, variantMap, variantNames);
    } finally {
        // Restore manifest
        let restoreManifest = manifest;
        if (!args.get('default') && args.get('manifest') !== null) {
            const variant = variantMap.get(args.get('manifest'));
            if (typeof variant !== 'undefined') {
                restoreManifest = createVariantManifest(manifest, variant, variantMap);
            }
        }
        process.stdout.write('Restoring manifest...\n');
        fs.writeFileSync(manifestPath, createManifestString(restoreManifest));
    }
}


if (require.main === module) { main(); }
