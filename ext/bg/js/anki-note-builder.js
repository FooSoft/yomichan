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
 * DictionaryDataUtil
 * TemplateRendererProxy
 */

class AnkiNoteBuilder {
    constructor(enabled) {
        this._markerPattern = /\{([\w-]+)\}/g;
        this._templateRenderer = enabled ? new TemplateRendererProxy() : null;
    }

    async createNote({
        definition,
        mode,
        context,
        templates,
        deckName,
        modelName,
        fields,
        tags=[],
        checkForDuplicates=true,
        duplicateScope='collection',
        resultOutputMode='split',
        glossaryLayoutMode='default',
        compactTags=false,
        errors=null
    }) {
        let duplicateScopeDeckName = null;
        let duplicateScopeCheckChildren = false;
        if (duplicateScope === 'deck-root') {
            duplicateScope = 'deck';
            duplicateScopeDeckName = this.getRootDeckName(deckName);
            duplicateScopeCheckChildren = true;
        }

        const noteFields = {};
        const note = {
            fields: noteFields,
            tags,
            deckName,
            modelName,
            options: {
                allowDuplicate: !checkForDuplicates,
                duplicateScope,
                duplicateScopeOptions: {
                    deckName: duplicateScopeDeckName,
                    checkChildren: duplicateScopeCheckChildren
                }
            }
        };

        const data = this._createNoteData(definition, mode, context, resultOutputMode, glossaryLayoutMode, compactTags);
        const formattedFieldValuePromises = [];
        for (const [, fieldValue] of fields) {
            const formattedFieldValuePromise = this._formatField(fieldValue, data, templates, errors);
            formattedFieldValuePromises.push(formattedFieldValuePromise);
        }

        const formattedFieldValues = await Promise.all(formattedFieldValuePromises);
        for (let i = 0, ii = fields.length; i < ii; ++i) {
            const fieldName = fields[i][0];
            const formattedFieldValue = formattedFieldValues[i];
            noteFields[fieldName] = formattedFieldValue;
        }

        return note;
    }

    containsMarker(fields, marker) {
        marker = `{${marker}}`;
        for (const [, fieldValue] of fields) {
            if (fieldValue.includes(marker)) {
                return true;
            }
        }
        return false;
    }

    containsAnyMarker(field) {
        const result = this._markerPattern.test(field);
        this._markerPattern.lastIndex = 0;
        return result;
    }

    getRootDeckName(deckName) {
        const index = deckName.indexOf('::');
        return index >= 0 ? deckName.substring(0, index) : deckName;
    }

    // Private

    _createNoteData(definition, mode, context, resultOutputMode, glossaryLayoutMode, compactTags) {
        const pitches = DictionaryDataUtil.getPitchAccentInfos(definition);
        const pitchCount = pitches.reduce((i, v) => i + v.pitches.length, 0);
        const uniqueExpressions = new Set();
        const uniqueReadings = new Set();
        if (definition.type !== 'kanji') {
            for (const {expression, reading} of definition.expressions) {
                uniqueExpressions.add(expression);
                uniqueReadings.add(reading);
            }
        }
        return {
            marker: null,
            definition,
            uniqueExpressions: [...uniqueExpressions],
            uniqueReadings: [...uniqueReadings],
            pitches,
            pitchCount,
            group: resultOutputMode === 'group',
            merge: resultOutputMode === 'merge',
            modeTermKanji: mode === 'term-kanji',
            modeTermKana: mode === 'term-kana',
            modeKanji: mode === 'kanji',
            compactGlossaries: (glossaryLayoutMode === 'compact'),
            glossaryLayoutMode,
            compactTags,
            context
        };
    }

    async _formatField(field, data, templates, errors=null) {
        return await this._stringReplaceAsync(field, this._markerPattern, async (g0, marker) => {
            try {
                return await this._renderTemplate(templates, data, marker);
            } catch (e) {
                if (errors) { errors.push(e); }
                return `{${marker}-render-error}`;
            }
        });
    }

    _stringReplaceAsync(str, regex, replacer) {
        let match;
        let index = 0;
        const parts = [];
        while ((match = regex.exec(str)) !== null) {
            parts.push(str.substring(index, match.index), replacer(...match, match.index, str));
            index = regex.lastIndex;
        }
        if (parts.length === 0) {
            return Promise.resolve(str);
        }
        parts.push(str.substring(index));
        return Promise.all(parts).then((v) => v.join(''));
    }

    async _renderTemplate(template, data, marker) {
        return await this._templateRenderer.render(template, data, marker);
    }
}
