/*
 * Copyright (C) 2020-2021  Yomichan Authors
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

/* global
 * JSZip
 * JsonSchema
 * MediaUtil
 */

class DictionaryImporter {
    constructor() {
        this._schemas = new Map();
    }

    async importDictionary(dictionaryDatabase, archiveSource, details, onProgress) {
        if (!dictionaryDatabase) {
            throw new Error('Invalid database');
        }
        if (!dictionaryDatabase.isPrepared()) {
            throw new Error('Database is not ready');
        }

        const hasOnProgress = (typeof onProgress === 'function');

        // Read archive
        const archive = await JSZip.loadAsync(archiveSource);

        // Read and validate index
        const indexFileName = 'index.json';
        const indexFile = archive.files[indexFileName];
        if (!indexFile) {
            throw new Error('No dictionary index found in archive');
        }

        const index = JSON.parse(await indexFile.async('string'));

        const indexSchema = await this._getSchema('/data/schemas/dictionary-index-schema.json');
        this._validateJsonSchema(index, indexSchema, indexFileName);

        const dictionaryTitle = index.title;
        const version = index.format || index.version;

        if (!dictionaryTitle || !index.revision) {
            throw new Error('Unrecognized dictionary format');
        }

        // Verify database is not already imported
        if (await dictionaryDatabase.dictionaryExists(dictionaryTitle)) {
            throw new Error('Dictionary is already imported');
        }

        // Data format converters
        const convertTermBankEntry = (entry) => {
            if (version === 1) {
                const [expression, reading, definitionTags, rules, score, ...glossary] = entry;
                return {expression, reading, definitionTags, rules, score, glossary};
            } else {
                const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = entry;
                return {expression, reading, definitionTags, rules, score, glossary, sequence, termTags};
            }
        };

        const convertTermMetaBankEntry = (entry) => {
            const [expression, mode, data] = entry;
            return {expression, mode, data};
        };

        const convertKanjiBankEntry = (entry) => {
            if (version === 1) {
                const [character, onyomi, kunyomi, tags, ...meanings] = entry;
                return {character, onyomi, kunyomi, tags, meanings};
            } else {
                const [character, onyomi, kunyomi, tags, meanings, stats] = entry;
                return {character, onyomi, kunyomi, tags, meanings, stats};
            }
        };

        const convertKanjiMetaBankEntry = (entry) => {
            const [character, mode, data] = entry;
            return {character, mode, data};
        };

        const convertTagBankEntry = (entry) => {
            const [name, category, order, notes, score] = entry;
            return {name, category, order, notes, score};
        };

        // Archive file reading
        const readFileSequence = async (fileNameFormat, convertEntry, schema) => {
            const results = [];
            for (let i = 1; true; ++i) {
                const fileName = fileNameFormat.replace(/\?/, `${i}`);
                const file = archive.files[fileName];
                if (!file) { break; }

                const entries = JSON.parse(await file.async('string'));
                this._validateJsonSchema(entries, schema, fileName);

                for (let entry of entries) {
                    entry = convertEntry(entry);
                    entry.dictionary = dictionaryTitle;
                    results.push(entry);
                }
            }
            return results;
        };

        // Load schemas
        const dataBankSchemaPaths = this._getDataBankSchemaPaths(version);
        const dataBankSchemas = await Promise.all(dataBankSchemaPaths.map((path) => this._getSchema(path)));

        // Load data
        const termList      = await readFileSequence('term_bank_?.json',       convertTermBankEntry,      dataBankSchemas[0]);
        const termMetaList  = await readFileSequence('term_meta_bank_?.json',  convertTermMetaBankEntry,  dataBankSchemas[1]);
        const kanjiList     = await readFileSequence('kanji_bank_?.json',      convertKanjiBankEntry,     dataBankSchemas[2]);
        const kanjiMetaList = await readFileSequence('kanji_meta_bank_?.json', convertKanjiMetaBankEntry, dataBankSchemas[3]);
        const tagList       = await readFileSequence('tag_bank_?.json',        convertTagBankEntry,       dataBankSchemas[4]);

        // Old tags
        const indexTagMeta = index.tagMeta;
        if (typeof indexTagMeta === 'object' && indexTagMeta !== null) {
            for (const name of Object.keys(indexTagMeta)) {
                const {category, order, notes, score} = indexTagMeta[name];
                tagList.push({name, category, order, notes, score});
            }
        }

        // Prefix wildcard support
        const prefixWildcardsSupported = !!details.prefixWildcardsSupported;
        if (prefixWildcardsSupported) {
            for (const entry of termList) {
                entry.expressionReverse = stringReverse(entry.expression);
                entry.readingReverse = stringReverse(entry.reading);
            }
        }

        // Extended data support
        const extendedDataContext = {
            archive,
            media: new Map()
        };
        for (const entry of termList) {
            const glossaryList = entry.glossary;
            for (let i = 0, ii = glossaryList.length; i < ii; ++i) {
                const glossary = glossaryList[i];
                if (typeof glossary !== 'object' || glossary === null) { continue; }
                glossaryList[i] = await this._formatDictionaryTermGlossaryObject(glossary, extendedDataContext, entry);
            }
        }

        const media = [...extendedDataContext.media.values()];

        // Add dictionary
        const summary = this._createSummary(dictionaryTitle, version, index, {prefixWildcardsSupported});

        dictionaryDatabase.bulkAdd('dictionaries', [summary], 0, 1);

        // Add data
        const errors = [];
        const total = (
            termList.length +
            termMetaList.length +
            kanjiList.length +
            kanjiMetaList.length +
            tagList.length
        );
        let loadedCount = 0;
        const maxTransactionLength = 1000;

        const bulkAdd = async (objectStoreName, entries) => {
            const ii = entries.length;
            for (let i = 0; i < ii; i += maxTransactionLength) {
                const count = Math.min(maxTransactionLength, ii - i);

                try {
                    await dictionaryDatabase.bulkAdd(objectStoreName, entries, i, count);
                } catch (e) {
                    errors.push(e);
                }

                loadedCount += count;
                if (hasOnProgress) {
                    onProgress(total, loadedCount);
                }
            }
        };

        await bulkAdd('terms', termList);
        await bulkAdd('termMeta', termMetaList);
        await bulkAdd('kanji', kanjiList);
        await bulkAdd('kanjiMeta', kanjiMetaList);
        await bulkAdd('tagMeta', tagList);
        await bulkAdd('media', media);

        return {result: summary, errors};
    }

    _createSummary(dictionaryTitle, version, index, details) {
        const summary = {
            title: dictionaryTitle,
            revision: index.revision,
            sequenced: index.sequenced,
            version
        };

        const {author, url, description, attribution} = index;
        if (typeof author === 'string') { summary.author = author; }
        if (typeof url === 'string') { summary.url = url; }
        if (typeof description === 'string') { summary.description = description; }
        if (typeof attribution === 'string') { summary.attribution = attribution; }

        Object.assign(summary, details);

        return summary;
    }

    async _getSchema(fileName) {
        let schemaPromise = this._schemas.get(fileName);
        if (typeof schemaPromise !== 'undefined') {
            return schemaPromise;
        }

        schemaPromise = this._createSchema(fileName);
        this._schemas.set(fileName, schemaPromise);
        return schemaPromise;
    }

    async _createSchema(fileName) {
        const schema = await this._fetchJsonAsset(fileName);
        return new JsonSchema(schema);
    }

    _validateJsonSchema(value, schema, fileName) {
        try {
            schema.validate(value);
        } catch (e) {
            throw this._formatSchemaError(e, fileName);
        }
    }

    _formatSchemaError(e, fileName) {
        const valuePathString = this._getSchemaErrorPathString(e.valueStack, 'dictionary');
        const schemaPathString = this._getSchemaErrorPathString(e.schemaStack, 'schema');

        const e2 = new Error(`Dictionary has invalid data in '${fileName}' for value '${valuePathString}', validated against '${schemaPathString}': ${e.message}`);
        e2.data = e;

        return e2;
    }

    _getSchemaErrorPathString(infoList, base='') {
        let result = base;
        for (const {path} of infoList) {
            const pathArray = Array.isArray(path) ? path : [path];
            for (const pathPart of pathArray) {
                if (pathPart === null) {
                    result = base;
                } else {
                    switch (typeof pathPart) {
                        case 'string':
                            if (result.length > 0) {
                                result += '.';
                            }
                            result += pathPart;
                            break;
                        case 'number':
                            result += `[${pathPart}]`;
                            break;
                    }
                }
            }
        }
        return result;
    }

    _getDataBankSchemaPaths(version) {
        const termBank = (
            version === 1 ?
            '/data/schemas/dictionary-term-bank-v1-schema.json' :
            '/data/schemas/dictionary-term-bank-v3-schema.json'
        );
        const termMetaBank = '/data/schemas/dictionary-term-meta-bank-v3-schema.json';
        const kanjiBank = (
            version === 1 ?
            '/data/schemas/dictionary-kanji-bank-v1-schema.json' :
            '/data/schemas/dictionary-kanji-bank-v3-schema.json'
        );
        const kanjiMetaBank = '/data/schemas/dictionary-kanji-meta-bank-v3-schema.json';
        const tagBank = '/data/schemas/dictionary-tag-bank-v3-schema.json';

        return [termBank, termMetaBank, kanjiBank, kanjiMetaBank, tagBank];
    }

    async _formatDictionaryTermGlossaryObject(data, context, entry) {
        switch (data.type) {
            case 'text':
                return data.text;
            case 'image':
                return await this._formatDictionaryTermGlossaryImage(data, context, entry);
            case 'structured-content':
                return await this._formatStructuredContent(data, context, entry);
            default:
                throw new Error(`Unhandled data type: ${data.type}`);
        }
    }

    async _formatDictionaryTermGlossaryImage(data, context, entry) {
        return await this._createImageData(data, context, entry, {type: 'image'});
    }

    async _formatStructuredContent(data, context, entry) {
        const content = await this._prepareStructuredContent(data.content, context, entry);
        return {
            type: 'structured-content',
            content
        };
    }

    async _prepareStructuredContent(content, context, entry) {
        if (typeof content === 'string' || !(typeof content === 'object' && content !== null)) {
            return content;
        }
        if (Array.isArray(content)) {
            for (let i = 0, ii = content.length; i < ii; ++i) {
                content[i] = await this._prepareStructuredContent(content[i], context, entry);
            }
            return content;
        }
        const {tag} = content;
        switch (tag) {
            case 'img':
                return await this._prepareStructuredContentImage(content, context, entry);
        }
        const childContent = content.content;
        if (typeof childContent !== 'undefined') {
            content.content = await this._prepareStructuredContent(childContent, context, entry);
        }
        return content;
    }

    async _prepareStructuredContentImage(content, context, entry) {
        const {verticalAlign, sizeUnits} = content;
        const result = await this._createImageData(content, context, entry, {tag: 'img'});
        if (typeof verticalAlign === 'string') { result.verticalAlign = verticalAlign; }
        if (typeof sizeUnits === 'string') { result.sizeUnits = sizeUnits; }
        return result;
    }

    async _createImageData(data, context, entry, attributes) {
        const {
            path,
            width: preferredWidth,
            height: preferredHeight,
            title,
            description,
            pixelated,
            imageRendering,
            appearance,
            background,
            collapsed,
            collapsible
        } = data;
        const {width, height} = await this._getImageMedia(path, context, entry);
        const newData = Object.assign({}, attributes, {path, width, height});
        if (typeof preferredWidth === 'number') { newData.preferredWidth = preferredWidth; }
        if (typeof preferredHeight === 'number') { newData.preferredHeight = preferredHeight; }
        if (typeof title === 'string') { newData.title = title; }
        if (typeof description === 'string') { newData.description = description; }
        if (typeof pixelated === 'boolean') { newData.pixelated = pixelated; }
        if (typeof imageRendering === 'string') { newData.imageRendering = imageRendering; }
        if (typeof appearance === 'string') { newData.appearance = appearance; }
        if (typeof background === 'boolean') { newData.background = background; }
        if (typeof collapsed === 'boolean') { newData.collapsed = collapsed; }
        if (typeof collapsible === 'boolean') { newData.collapsible = collapsible; }
        return newData;
    }

    async _getImageMedia(path, context, entry) {
        const {media} = context;
        const {dictionary, reading} = entry;

        let errorSource = entry.expression;
        if (reading.length > 0) {
            errorSource += ` (${reading})`;
        }
        errorSource += dictionary;

        const createError = (message) => new Error(`${message} at path ${JSON.stringify(path)} for ${errorSource}`);

        // Check if already added
        let mediaData = media.get(path);
        if (typeof mediaData !== 'undefined') {
            if (MediaUtil.getFileExtensionFromImageMediaType(mediaData.mediaType) === null) {
                throw createError('Media file is not a valid image');
            }
            return mediaData;
        }

        // Find file in archive
        const file = context.archive.file(path);
        if (file === null) {
            throw createError('Could not find image');
        }

        // Load file content
        const content = await file.async('base64');
        const mediaType = MediaUtil.getImageMediaTypeFromFileName(path);
        if (mediaType === null) {
            throw createError('Could not determine media type for image');
        }

        // Load image data
        let image;
        try {
            image = await this._loadImageBase64(mediaType, content);
        } catch (e) {
            throw createError('Could not load image');
        }

        // Create image data
        mediaData = {
            dictionary,
            path,
            mediaType,
            width: image.naturalWidth,
            height: image.naturalHeight,
            content
        };
        media.set(path, mediaData);

        return mediaData;
    }

    async _fetchJsonAsset(url) {
        const response = await fetch(chrome.runtime.getURL(url), {
            method: 'GET',
            mode: 'no-cors',
            cache: 'default',
            credentials: 'omit',
            redirect: 'follow',
            referrerPolicy: 'no-referrer'
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Attempts to load an image using a base64 encoded content and a media type.
     * @param mediaType The media type for the image content.
     * @param content The binary content for the image, encoded in base64.
     * @returns A Promise which resolves with an HTMLImageElement instance on
     *   successful load, otherwise an error is thrown.
     */
    _loadImageBase64(mediaType, content) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const eventListeners = new EventListenerCollection();
            eventListeners.addEventListener(image, 'load', () => {
                URL.revokeObjectURL(url);
                eventListeners.removeAllEventListeners();
                resolve(image);
            }, false);
            eventListeners.addEventListener(image, 'error', () => {
                URL.revokeObjectURL(url);
                eventListeners.removeAllEventListeners();
                reject(new Error('Image failed to load'));
            }, false);
            const blob = MediaUtil.createBlobFromBase64Content(content, mediaType);
            const url = URL.createObjectURL(blob);
            image.src = url;
        });
    }
}
