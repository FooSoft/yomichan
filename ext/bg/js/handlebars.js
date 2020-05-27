/*
 * Copyright (C) 2016-2020  Yomichan Authors
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
 * Handlebars
 * jp
 */

class HandlebarsRenderer {
    constructor() {
        this._cache = new Map();
    }

    render(template, data) {
        this.handlebarsRegisterHelpers();
        const cache = this._cache;
        let instance = cache.get(template);
        if (typeof instance === 'undefined') {
            instance = Handlebars.compile(template);
            cache.set(template, instance);
        }

        return instance(data).trim();
    }

    handlebarsEscape(text) {
        return Handlebars.Utils.escapeExpression(text);
    }

    handlebarsDumpObject(options) {
        const dump = JSON.stringify(options.fn(this), null, 4);
        return this.handlebarsEscape(dump);
    }

    handlebarsFurigana(options) {
        const definition = options.fn(this);
        const segs = jp.distributeFurigana(definition.expression, definition.reading);

        let result = '';
        for (const seg of segs) {
            if (seg.furigana) {
                result += `<ruby>${seg.text}<rt>${seg.furigana}</rt></ruby>`;
            } else {
                result += seg.text;
            }
        }

        return result;
    }

    handlebarsFuriganaPlain(options) {
        const definition = options.fn(this);
        const segs = jp.distributeFurigana(definition.expression, definition.reading);

        let result = '';
        for (const seg of segs) {
            if (seg.furigana) {
                result += ` ${seg.text}[${seg.furigana}]`;
            } else {
                result += seg.text;
            }
        }

        return result.trimLeft();
    }

    handlebarsKanjiLinks(options) {
        let result = '';
        for (const c of options.fn(this)) {
            if (jp.isCodePointKanji(c.codePointAt(0))) {
                result += `<a href="#" class="kanji-link">${c}</a>`;
            } else {
                result += c;
            }
        }

        return result;
    }

    handlebarsMultiLine(options) {
        return options.fn(this).split('\n').join('<br>');
    }

    handlebarsSanitizeCssClass(options) {
        return options.fn(this).replace(/[^_a-z0-9\u00a0-\uffff]/ig, '_');
    }

    handlebarsRegexReplace(...args) {
        // Usage:
        // {{#regexReplace regex string [flags]}}content{{/regexReplace}}
        // regex: regular expression string
        // string: string to replace
        // flags: optional flags for regular expression
        //   e.g. "i" for case-insensitive, "g" for replace all
        let value = args[args.length - 1].fn(this);
        if (args.length >= 3) {
            try {
                const flags = args.length > 3 ? args[2] : 'g';
                const regex = new RegExp(args[0], flags);
                value = value.replace(regex, args[1]);
            } catch (e) {
                return `${e}`;
            }
        }
        return value;
    }

    handlebarsRegexMatch(...args) {
        // Usage:
        // {{#regexMatch regex [flags]}}content{{/regexMatch}}
        // regex: regular expression string
        // flags: optional flags for regular expression
        //   e.g. "i" for case-insensitive, "g" for match all
        let value = args[args.length - 1].fn(this);
        if (args.length >= 2) {
            try {
                const flags = args.length > 2 ? args[1] : '';
                const regex = new RegExp(args[0], flags);
                const parts = [];
                value.replace(regex, (g0) => parts.push(g0));
                value = parts.join('');
            } catch (e) {
                return `${e}`;
            }
        }
        return value;
    }

    handlebarsMergeTags(object, isGroupMode, isMergeMode) {
        const tagSources = [];
        if (isGroupMode || isMergeMode) {
            for (const definition of object.definitions) {
                tagSources.push(definition.definitionTags);
            }
        } else {
            tagSources.push(object.definitionTags);
        }

        const tags = new Set();
        for (const tagSource of tagSources) {
            for (const tag of tagSource) {
                tags.add(tag.name);
            }
        }

        return [...tags].join(', ');
    }

    handlebarsRegisterHelpers() {
        if (Handlebars.partials !== Handlebars.templates) {
            Handlebars.partials = Handlebars.templates;
            Handlebars.registerHelper('dumpObject', this.handlebarsDumpObject.bind(this));
            Handlebars.registerHelper('furigana', this.handlebarsFurigana.bind(this));
            Handlebars.registerHelper('furiganaPlain', this.handlebarsFuriganaPlain.bind(this));
            Handlebars.registerHelper('kanjiLinks', this.handlebarsKanjiLinks.bind(this));
            Handlebars.registerHelper('multiLine', this.handlebarsMultiLine.bind(this));
            Handlebars.registerHelper('sanitizeCssClass', this.handlebarsSanitizeCssClass.bind(this));
            Handlebars.registerHelper('regexReplace', this.handlebarsRegexReplace.bind(this));
            Handlebars.registerHelper('regexMatch', this.handlebarsRegexMatch.bind(this));
            Handlebars.registerHelper('mergeTags', this.handlebarsMergeTags.bind(this));
        }
    }
}
