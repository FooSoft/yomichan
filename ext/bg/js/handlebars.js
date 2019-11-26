/*
 * Copyright (C) 2016-2017  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


function handlebarsEscape(text) {
    return Handlebars.Utils.escapeExpression(text);
}

function handlebarsDumpObject(options) {
    const dump = JSON.stringify(options.fn(this), null, 4);
    return handlebarsEscape(dump);
}

function handlebarsFurigana(options) {
    const definition = options.fn(this);
    const segs = jpDistributeFurigana(definition.expression, definition.reading);

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

function handlebarsFuriganaPlain(options) {
    const definition = options.fn(this);
    const segs = jpDistributeFurigana(definition.expression, definition.reading);

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

function handlebarsKanjiLinks(options) {
    let result = '';
    for (const c of options.fn(this)) {
        if (jpIsKanji(c)) {
            result += `<a href="#" class="kanji-link">${c}</a>`;
        } else {
            result += c;
        }
    }

    return result;
}

function handlebarsMultiLine(options) {
    return options.fn(this).split('\n').join('<br>');
}

function handlebarsSanitizeCssClass(options) {
    return options.fn(this).replace(/[^_a-z0-9\u00a0-\uffff]/ig, '_');
}

function handlebarsRegexReplace(...args) {
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

function handlebarsRegexMatch(...args) {
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

function handlebarsRegisterHelpers() {
    if (Handlebars.partials !== Handlebars.templates) {
        Handlebars.partials = Handlebars.templates;
        Handlebars.registerHelper('dumpObject', handlebarsDumpObject);
        Handlebars.registerHelper('furigana', handlebarsFurigana);
        Handlebars.registerHelper('furiganaPlain', handlebarsFuriganaPlain);
        Handlebars.registerHelper('kanjiLinks', handlebarsKanjiLinks);
        Handlebars.registerHelper('multiLine', handlebarsMultiLine);
        Handlebars.registerHelper('sanitizeCssClass', handlebarsSanitizeCssClass);
        Handlebars.registerHelper('regexReplace', handlebarsRegexReplace);
        Handlebars.registerHelper('regexMatch', handlebarsRegexMatch);
    }
}

function handlebarsRenderStatic(name, data) {
    handlebarsRegisterHelpers();
    return Handlebars.templates[name](data).trim();
}

function handlebarsRenderDynamic(template, data) {
    handlebarsRegisterHelpers();

    Handlebars.yomichan_cache = Handlebars.yomichan_cache || {};
    let instance = Handlebars.yomichan_cache[template];
    if (!instance) {
        instance = Handlebars.yomichan_cache[template] = Handlebars.compile(template);
    }

    return instance(data).trim();
}
