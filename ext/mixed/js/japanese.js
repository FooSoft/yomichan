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

const JapaneseUtil = (() => {
    const ITERATION_MARK_CODE_POINT = 0x3005;
    const HIRAGANA_SMALL_TSU_CODE_POINT = 0x3063;
    const KATAKANA_SMALL_TSU_CODE_POINT = 0x30c3;
    const KATAKANA_SMALL_KA_CODE_POINT = 0x30f5;
    const KATAKANA_SMALL_KE_CODE_POINT = 0x30f6;
    const KANA_PROLONGED_SOUND_MARK_CODE_POINT = 0x30fc;

    const HIRAGANA_RANGE = [0x3040, 0x309f];
    const KATAKANA_RANGE = [0x30a0, 0x30ff];

    const HIRAGANA_CONVERSION_RANGE = [0x3041, 0x3096];
    const KATAKANA_CONVERSION_RANGE = [0x30a1, 0x30f6];

    const KANA_RANGES = [HIRAGANA_RANGE, KATAKANA_RANGE];

    const CJK_UNIFIED_IDEOGRAPHS_RANGE = [0x4e00, 0x9fff];
    const CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A_RANGE = [0x3400, 0x4dbf];
    const CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B_RANGE = [0x20000, 0x2a6df];
    const CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C_RANGE = [0x2a700, 0x2b73f];
    const CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D_RANGE = [0x2b740, 0x2b81f];
    const CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E_RANGE = [0x2b820, 0x2ceaf];
    const CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F_RANGE = [0x2ceb0, 0x2ebef];
    const CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT_RANGE = [0x2f800, 0x2fa1f];
    const CJK_UNIFIED_IDEOGRAPHS_RANGES = [
        CJK_UNIFIED_IDEOGRAPHS_RANGE,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A_RANGE,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B_RANGE,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_C_RANGE,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_D_RANGE,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_E_RANGE,
        CJK_UNIFIED_IDEOGRAPHS_EXTENSION_F_RANGE,
        CJK_COMPATIBILITY_IDEOGRAPHS_SUPPLEMENT_RANGE
    ];

    // Japanese character ranges, roughly ordered in order of expected frequency
    const JAPANESE_RANGES = [
        HIRAGANA_RANGE,
        KATAKANA_RANGE,

        ...CJK_UNIFIED_IDEOGRAPHS_RANGES,

        [0xff66, 0xff9f], // Halfwidth katakana

        [0x30fb, 0x30fc], // Katakana punctuation
        [0xff61, 0xff65], // Kana punctuation
        [0x3000, 0x303f], // CJK punctuation

        [0xff10, 0xff19], // Fullwidth numbers
        [0xff21, 0xff3a], // Fullwidth upper case Latin letters
        [0xff41, 0xff5a], // Fullwidth lower case Latin letters

        [0xff01, 0xff0f], // Fullwidth punctuation 1
        [0xff1a, 0xff1f], // Fullwidth punctuation 2
        [0xff3b, 0xff3f], // Fullwidth punctuation 3
        [0xff5b, 0xff60], // Fullwidth punctuation 4
        [0xffe0, 0xffee]  // Currency markers
    ];

    const SMALL_KANA_SET = new Set(Array.from('ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ'));

    const HALFWIDTH_KATAKANA_MAPPING = new Map([
        ['ｦ', 'ヲヺ-'],
        ['ｧ', 'ァ--'],
        ['ｨ', 'ィ--'],
        ['ｩ', 'ゥ--'],
        ['ｪ', 'ェ--'],
        ['ｫ', 'ォ--'],
        ['ｬ', 'ャ--'],
        ['ｭ', 'ュ--'],
        ['ｮ', 'ョ--'],
        ['ｯ', 'ッ--'],
        ['ｰ', 'ー--'],
        ['ｱ', 'ア--'],
        ['ｲ', 'イ--'],
        ['ｳ', 'ウヴ-'],
        ['ｴ', 'エ--'],
        ['ｵ', 'オ--'],
        ['ｶ', 'カガ-'],
        ['ｷ', 'キギ-'],
        ['ｸ', 'クグ-'],
        ['ｹ', 'ケゲ-'],
        ['ｺ', 'コゴ-'],
        ['ｻ', 'サザ-'],
        ['ｼ', 'シジ-'],
        ['ｽ', 'スズ-'],
        ['ｾ', 'セゼ-'],
        ['ｿ', 'ソゾ-'],
        ['ﾀ', 'タダ-'],
        ['ﾁ', 'チヂ-'],
        ['ﾂ', 'ツヅ-'],
        ['ﾃ', 'テデ-'],
        ['ﾄ', 'トド-'],
        ['ﾅ', 'ナ--'],
        ['ﾆ', 'ニ--'],
        ['ﾇ', 'ヌ--'],
        ['ﾈ', 'ネ--'],
        ['ﾉ', 'ノ--'],
        ['ﾊ', 'ハバパ'],
        ['ﾋ', 'ヒビピ'],
        ['ﾌ', 'フブプ'],
        ['ﾍ', 'ヘベペ'],
        ['ﾎ', 'ホボポ'],
        ['ﾏ', 'マ--'],
        ['ﾐ', 'ミ--'],
        ['ﾑ', 'ム--'],
        ['ﾒ', 'メ--'],
        ['ﾓ', 'モ--'],
        ['ﾔ', 'ヤ--'],
        ['ﾕ', 'ユ--'],
        ['ﾖ', 'ヨ--'],
        ['ﾗ', 'ラ--'],
        ['ﾘ', 'リ--'],
        ['ﾙ', 'ル--'],
        ['ﾚ', 'レ--'],
        ['ﾛ', 'ロ--'],
        ['ﾜ', 'ワ--'],
        ['ﾝ', 'ン--']
    ]);

    const VOWEL_TO_KANA_MAPPING = new Map([
        ['a', 'ぁあかがさざただなはばぱまゃやらゎわヵァアカガサザタダナハバパマャヤラヮワヵヷ'],
        ['i', 'ぃいきぎしじちぢにひびぴみりゐィイキギシジチヂニヒビピミリヰヸ'],
        ['u', 'ぅうくぐすずっつづぬふぶぷむゅゆるゥウクグスズッツヅヌフブプムュユルヴ'],
        ['e', 'ぇえけげせぜてでねへべぺめれゑヶェエケゲセゼテデネヘベペメレヱヶヹ'],
        ['o', 'ぉおこごそぞとどのほぼぽもょよろをォオコゴソゾトドノホボポモョヨロヲヺ'],
        ['', 'のノ']
    ]);

    const KANA_TO_VOWEL_MAPPING = (() => {
        const map = new Map();
        for (const [vowel, characters] of VOWEL_TO_KANA_MAPPING) {
            for (const character of characters) {
                map.set(character, vowel);
            }
        }
        return map;
    })();


    function isCodePointInRange(codePoint, [min, max]) {
        return (codePoint >= min && codePoint <= max);
    }

    function isCodePointInRanges(codePoint, ranges) {
        for (const [min, max] of ranges) {
            if (codePoint >= min && codePoint <= max) {
                return true;
            }
        }
        return false;
    }

    function getProlongedHiragana(previousCharacter) {
        switch (KANA_TO_VOWEL_MAPPING.get(previousCharacter)) {
            case 'a': return 'あ';
            case 'i': return 'い';
            case 'u': return 'う';
            case 'e': return 'え';
            case 'o': return 'う';
            default: return null;
        }
    }


    // eslint-disable-next-line no-shadow
    class JapaneseUtil {
        constructor(wanakana=null) {
            this._wanakana = wanakana;
        }

        // Character code testing functions

        isCodePointKanji(codePoint) {
            return isCodePointInRanges(codePoint, CJK_UNIFIED_IDEOGRAPHS_RANGES);
        }

        isCodePointKana(codePoint) {
            return isCodePointInRanges(codePoint, KANA_RANGES);
        }

        isCodePointJapanese(codePoint) {
            return isCodePointInRanges(codePoint, JAPANESE_RANGES);
        }

        // String testing functions

        isStringEntirelyKana(str) {
            if (str.length === 0) { return false; }
            for (const c of str) {
                if (!isCodePointInRanges(c.codePointAt(0), KANA_RANGES)) {
                    return false;
                }
            }
            return true;
        }

        isStringPartiallyJapanese(str) {
            if (str.length === 0) { return false; }
            for (const c of str) {
                if (isCodePointInRanges(c.codePointAt(0), JAPANESE_RANGES)) {
                    return true;
                }
            }
            return false;
        }

        // Mora functions

        isMoraPitchHigh(moraIndex, pitchAccentPosition) {
            switch (pitchAccentPosition) {
                case 0: return (moraIndex > 0);
                case 1: return (moraIndex < 1);
                default: return (moraIndex > 0 && moraIndex < pitchAccentPosition);
            }
        }

        getKanaMorae(text) {
            const morae = [];
            let i;
            for (const c of text) {
                if (SMALL_KANA_SET.has(c) && (i = morae.length) > 0) {
                    morae[i - 1] += c;
                } else {
                    morae.push(c);
                }
            }
            return morae;
        }

        // Conversion functions

        convertToKana(text) {
            return this._getWanakana().toKana(text);
        }

        convertKatakanaToHiragana(text) {
            let result = '';
            const offset = (HIRAGANA_CONVERSION_RANGE[0] - KATAKANA_CONVERSION_RANGE[0]);
            for (let char of text) {
                const codePoint = char.codePointAt(0);
                if (codePoint === KATAKANA_SMALL_KA_CODE_POINT || codePoint === KATAKANA_SMALL_KE_CODE_POINT) {
                    // No change
                } else if (codePoint === KANA_PROLONGED_SOUND_MARK_CODE_POINT) {
                    if (result.length > 0) {
                        const char2 = getProlongedHiragana(result[result.length - 1]);
                        if (char2 !== null) { char = char2; }
                    }
                } else if (isCodePointInRange(codePoint, KATAKANA_CONVERSION_RANGE)) {
                    char = String.fromCodePoint(codePoint + offset);
                }
                result += char;
            }
            return result;
        }

        convertHiraganaToKatakana(text) {
            let result = '';
            const offset = (KATAKANA_CONVERSION_RANGE[0] - HIRAGANA_CONVERSION_RANGE[0]);
            for (let char of text) {
                const codePoint = char.codePointAt(0);
                if (isCodePointInRange(codePoint, HIRAGANA_CONVERSION_RANGE)) {
                    char = String.fromCodePoint(codePoint + offset);
                }
                result += char;
            }
            return result;
        }

        convertToRomaji(text) {
            const wanakana = this._getWanakana();
            return wanakana.toRomaji(text);
        }

        convertReading(expression, reading, readingMode) {
            switch (readingMode) {
                case 'hiragana':
                    return this.convertKatakanaToHiragana(reading);
                case 'katakana':
                    return this.convertHiraganaToKatakana(reading);
                case 'romaji':
                    if (reading) {
                        return this.convertToRomaji(reading);
                    } else {
                        if (this.isStringEntirelyKana(expression)) {
                            return this.convertToRomaji(expression);
                        }
                    }
                    return reading;
                case 'none':
                    return '';
                default:
                    return reading;
            }
        }

        convertNumericToFullWidth(text) {
            let result = '';
            for (const char of text) {
                let c = char.codePointAt(0);
                if (c >= 0x30 && c <= 0x39) { // ['0', '9']
                    c += 0xff10 - 0x30; // 0xff10 = '0' full width
                    result += String.fromCodePoint(c);
                } else {
                    result += char;
                }
            }
            return result;
        }

        convertHalfWidthKanaToFullWidth(text, sourceMap=null) {
            let result = '';

            // This function is safe to use charCodeAt instead of codePointAt, since all
            // the relevant characters are represented with a single UTF-16 character code.
            for (let i = 0, ii = text.length; i < ii; ++i) {
                const c = text[i];
                const mapping = HALFWIDTH_KATAKANA_MAPPING.get(c);
                if (typeof mapping !== 'string') {
                    result += c;
                    continue;
                }

                let index = 0;
                switch (text.charCodeAt(i + 1)) {
                    case 0xff9e: // dakuten
                        index = 1;
                        break;
                    case 0xff9f: // handakuten
                        index = 2;
                        break;
                }

                let c2 = mapping[index];
                if (index > 0) {
                    if (c2 === '-') { // invalid
                        index = 0;
                        c2 = mapping[0];
                    } else {
                        ++i;
                    }
                }

                if (sourceMap !== null && index > 0) {
                    sourceMap.combine(result.length, 1);
                }
                result += c2;
            }

            return result;
        }

        convertAlphabeticToKana(text, sourceMap=null) {
            let part = '';
            let result = '';

            for (const char of text) {
                // Note: 0x61 is the character code for 'a'
                let c = char.codePointAt(0);
                if (c >= 0x41 && c <= 0x5a) { // ['A', 'Z']
                    c += (0x61 - 0x41);
                } else if (c >= 0x61 && c <= 0x7a) { // ['a', 'z']
                    // NOP; c += (0x61 - 0x61);
                } else if (c >= 0xff21 && c <= 0xff3a) { // ['A', 'Z'] fullwidth
                    c += (0x61 - 0xff21);
                } else if (c >= 0xff41 && c <= 0xff5a) { // ['a', 'z'] fullwidth
                    c += (0x61 - 0xff41);
                } else if (c === 0x2d || c === 0xff0d) { // '-' or fullwidth dash
                    c = 0x2d; // '-'
                } else {
                    if (part.length > 0) {
                        result += this._convertAlphabeticPartToKana(part, sourceMap, result.length);
                        part = '';
                    }
                    result += char;
                    continue;
                }
                part += String.fromCodePoint(c);
            }

            if (part.length > 0) {
                result += this._convertAlphabeticPartToKana(part, sourceMap, result.length);
            }
            return result;
        }

        // Furigana distribution

        distributeFurigana(expression, reading) {
            if (!reading || reading === expression) {
                // Same
                return [this._createFuriganaSegment(expression, '')];
            }

            const segmentize = (reading2, reading2Normalized, groups, groupsStart) => {
                const groupCount = groups.length - groupsStart;
                if (groupCount <= 0) {
                    return [];
                }

                const group = groups[groupsStart];
                const {isKana, text} = group;
                const textLength = text.length;
                if (isKana) {
                    const {textNormalized} = group;
                    if (reading2Normalized.startsWith(textNormalized)) {
                        const segments = segmentize(
                            reading2.substring(textLength),
                            reading2Normalized.substring(textLength),
                            groups,
                            groupsStart + 1
                        );
                        if (segments !== null) {
                            const furigana = reading2.startsWith(text) ? '' : reading2.substring(0, textLength);
                            segments.unshift(this._createFuriganaSegment(text, furigana));
                            return segments;
                        }
                    }
                    return null;
                } else {
                    let result = null;
                    for (let i = reading2.length; i >= textLength; --i) {
                        const readingUsed = reading2.substring(0, i);
                        const segments = segmentize(
                            reading2.substring(i),
                            reading2Normalized.substring(i),
                            groups,
                            groupsStart + 1
                        );
                        if (segments !== null) {
                            if (result !== null) {
                                // more than one way to segmentize the tail, mark as ambiguous
                                return null;
                            }
                            segments.unshift(this._createFuriganaSegment(text, readingUsed));
                            result = segments;
                        }
                        // there is only one way to segmentize the last non-kana group
                        if (groupCount === 1) {
                            break;
                        }
                    }
                    return result;
                }
            };

            const groups = [];
            let groupPre = null;
            let isKanaPre = null;
            for (const c of expression) {
                const codePoint = c.codePointAt(0);
                const isKana = !(this.isCodePointKanji(codePoint) || codePoint === ITERATION_MARK_CODE_POINT);
                if (isKana === isKanaPre) {
                    groupPre.text += c;
                } else {
                    groupPre = {isKana, text: c, textNormalized: null};
                    groups.push(groupPre);
                    isKanaPre = isKana;
                }
            }
            for (const group of groups) {
                if (group.isKana) {
                    group.textNormalized = this.convertKatakanaToHiragana(group.text);
                }
            }

            const readingNormalized = this.convertKatakanaToHiragana(reading);
            const segments = segmentize(reading, readingNormalized, groups, 0);
            if (segments !== null) {
                return segments;
            }

            // Fallback
            return [this._createFuriganaSegment(expression, reading)];
        }

        distributeFuriganaInflected(expression, reading, source) {
            const output = [];

            let stemLength = 0;
            const shortest = Math.min(source.length, expression.length);
            const sourceHiragana = this.convertKatakanaToHiragana(source);
            const expressionHiragana = this.convertKatakanaToHiragana(expression);
            while (stemLength < shortest && sourceHiragana[stemLength] === expressionHiragana[stemLength]) {
                ++stemLength;
            }
            const offset = source.length - stemLength;

            const stemExpression = source.substring(0, source.length - offset);
            const stemReading = reading.substring(
                0,
                offset === 0 ? reading.length : reading.length - expression.length + stemLength
            );
            for (const segment of this.distributeFurigana(stemExpression, stemReading)) {
                output.push(segment);
            }

            if (stemLength !== source.length) {
                output.push({text: source.substring(stemLength), furigana: ''});
            }

            return output;
        }

        // Miscellaneous

        collapseEmphaticSequences(text, fullCollapse, sourceMap=null) {
            let result = '';
            let collapseCodePoint = -1;
            const hasSourceMap = (sourceMap !== null);
            for (const char of text) {
                const c = char.codePointAt(0);
                if (
                    c === HIRAGANA_SMALL_TSU_CODE_POINT ||
                    c === KATAKANA_SMALL_TSU_CODE_POINT ||
                    c === KANA_PROLONGED_SOUND_MARK_CODE_POINT
                ) {
                    if (collapseCodePoint !== c) {
                        collapseCodePoint = c;
                        if (!fullCollapse) {
                            result += char;
                            continue;
                        }
                    }
                } else {
                    collapseCodePoint = -1;
                    result += char;
                    continue;
                }

                if (hasSourceMap) {
                    sourceMap.combine(Math.max(0, result.length - 1), 1);
                }
            }
            return result;
        }

        // Private

        _createFuriganaSegment(text, furigana) {
            return {text, furigana};
        }

        _getWanakana() {
            const wanakana = this._wanakana;
            if (wanakana === null) { throw new Error('Functions which use WanaKana are not supported in this context'); }
            return wanakana;
        }

        _convertAlphabeticPartToKana(text, sourceMap, sourceMapStart) {
            const wanakana = this._getWanakana();
            const result = wanakana.toHiragana(text);

            // Generate source mapping
            if (sourceMap !== null) {
                let i = 0;
                let resultPos = 0;
                const ii = text.length;
                while (i < ii) {
                    // Find smallest matching substring
                    let iNext = i + 1;
                    let resultPosNext = result.length;
                    while (iNext < ii) {
                        const t = wanakana.toHiragana(text.substring(0, iNext));
                        if (t === result.substring(0, t.length)) {
                            resultPosNext = t.length;
                            break;
                        }
                        ++iNext;
                    }

                    // Merge characters
                    const removals = iNext - i - 1;
                    if (removals > 0) {
                        sourceMap.combine(sourceMapStart, removals);
                    }
                    ++sourceMapStart;

                    // Empty elements
                    const additions = resultPosNext - resultPos - 1;
                    for (let j = 0; j < additions; ++j) {
                        sourceMap.insert(sourceMapStart, 0);
                        ++sourceMapStart;
                    }

                    i = iNext;
                    resultPos = resultPosNext;
                }
            }

            return result;
        }
    }


    return JapaneseUtil;
})();
