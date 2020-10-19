/*
 * Copyright (C) 2017-2020  Yomichan Authors
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
 * SimpleDOMParser
 * jp
 */

class AudioDownloader {
    constructor({requestBuilder}) {
        this._requestBuilder = requestBuilder;
        this._getInfoHandlers = new Map([
            ['jpod101', this._getInfoJpod101.bind(this)],
            ['jpod101-alternate', this._getInfoJpod101Alternate.bind(this)],
            ['jisho', this._getInfoJisho.bind(this)],
            ['text-to-speech', this._getInfoTextToSpeech.bind(this)],
            ['text-to-speech-reading', this._getInfoTextToSpeechReading.bind(this)],
            ['custom', this._getInfoCustom.bind(this)]
        ]);
        this._customUrlFormatPattern = /\{([^}]*)\}/g;
    }

    async getInfo(source, expression, reading, details) {
        const handler = this._getInfoHandlers.get(source);
        if (typeof handler === 'function') {
            try {
                return await handler(expression, reading, details);
            } catch (e) {
                // NOP
            }
        }
        return null;
    }

    async downloadAudio(sources, expression, reading, details) {
        for (const source of sources) {
            const info = await this.getInfo(source, expression, reading, details);
            if (info === null) { continue; }

            switch (info.type) {
                case 'url':
                    try {
                        const {details: {url}} = info;
                        return await this._downloadAudioFromUrl(url);
                    } catch (e) {
                        // NOP
                    }
                    break;
            }
        }

        throw new Error('Could not download audio');
    }

    // Private

    _normalizeUrl(url, baseUrl, basePath) {
        if (url) {
            if (url[0] === '/') {
                if (url.length >= 2 && url[1] === '/') {
                    // Begins with "//"
                    url = baseUrl.substring(0, baseUrl.indexOf(':') + 1) + url;
                } else {
                    // Begins with "/"
                    url = baseUrl + url;
                }
            } else if (!/^[a-z][a-z0-9\-+.]*:/i.test(url)) {
                // No URI scheme => relative path
                url = baseUrl + basePath + url;
            }
        }
        return url;
    }

    async _getInfoJpod101(expression, reading) {
        let kana = reading;
        let kanji = expression;

        if (!kana && jp.isStringEntirelyKana(kanji)) {
            kana = kanji;
            kanji = null;
        }

        const params = [];
        if (kanji) {
            params.push(`kanji=${encodeURIComponent(kanji)}`);
        }
        if (kana) {
            params.push(`kana=${encodeURIComponent(kana)}`);
        }

        const url = `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.join('&')}`;
        return {type: 'url', details: {url}};
    }

    async _getInfoJpod101Alternate(expression, reading) {
        const fetchUrl = 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post';
        const data = `post=dictionary_reference&match_type=exact&search_query=${encodeURIComponent(expression)}&vulgar=true`;
        const response = await this._requestBuilder.fetchAnonymous(fetchUrl, {
            method: 'POST',
            mode: 'cors',
            cache: 'default',
            credentials: 'omit',
            redirect: 'follow',
            referrerPolicy: 'no-referrer',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data
        });
        const responseText = await response.text();

        const dom = new SimpleDOMParser(responseText);
        for (const row of dom.getElementsByClassName('dc-result-row')) {
            try {
                const audio = dom.getElementByTagName('audio', row);
                if (audio === null) { continue; }

                const source = dom.getElementByTagName('source', audio);
                if (source === null) { continue; }

                let url = dom.getAttribute(source, 'src');
                if (url === null) { continue; }

                const htmlReadings = dom.getElementsByClassName('dc-vocab_kana');
                if (htmlReadings.length === 0) { continue; }

                const htmlReading = dom.getTextContent(htmlReadings[0]);
                if (htmlReading && (!reading || reading === htmlReading)) {
                    url = this._normalizeUrl(url, 'https://www.japanesepod101.com', '/learningcenter/reference/');
                    return {type: 'url', details: {url}};
                }
            } catch (e) {
                // NOP
            }
        }

        throw new Error('Failed to find audio URL');
    }

    async _getInfoJisho(expression, reading) {
        const fetchUrl = `https://jisho.org/search/${expression}`;
        const response = await this._requestBuilder.fetchAnonymous(fetchUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'default',
            credentials: 'omit',
            redirect: 'follow',
            referrerPolicy: 'no-referrer'
        });
        const responseText = await response.text();

        const dom = new SimpleDOMParser(responseText);
        try {
            const audio = dom.getElementById(`audio_${expression}:${reading}`);
            if (audio !== null) {
                const source = dom.getElementByTagName('source', audio);
                if (source !== null) {
                    let url = dom.getAttribute(source, 'src');
                    if (url !== null) {
                        url = this._normalizeUrl(url, 'https://jisho.org', '/search/');
                        return {type: 'url', details: {url}};
                    }
                }
            }
        } catch (e) {
            // NOP
        }

        throw new Error('Failed to find audio URL');
    }

    async _getInfoTextToSpeech(expression, reading, {textToSpeechVoice}) {
        if (!textToSpeechVoice) {
            throw new Error('No voice');
        }
        return {type: 'tts', details: {text: expression, voice: textToSpeechVoice}};
    }

    async _getInfoTextToSpeechReading(expression, reading, {textToSpeechVoice}) {
        if (!textToSpeechVoice) {
            throw new Error('No voice');
        }
        return {type: 'tts', details: {text: reading || expression, voice: textToSpeechVoice}};
    }

    async _getInfoCustom(expression, reading, {customSourceUrl}) {
        if (typeof customSourceUrl !== 'string') {
            throw new Error('No custom URL defined');
        }
        const data = {expression, reading};
        const url = customSourceUrl.replace(this._customUrlFormatPattern, (m0, m1) => (hasOwn(data, m1) ? `${data[m1]}` : m0));
        return {type: 'url', details: {url}};
    }

    async _downloadAudioFromUrl(url) {
        const response = await this._requestBuilder.fetchAnonymous(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'default',
            credentials: 'omit',
            redirect: 'follow',
            referrerPolicy: 'no-referrer'
        });

        if (!response.ok) {
            throw new Error(`Invalid response: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (!await this._isAudioBinaryValid(arrayBuffer)) {
            throw new Error('Could not retrieve audio');
        }

        return this._arrayBufferToBase64(arrayBuffer);
    }

    async _isAudioBinaryValid(arrayBuffer) {
        const digest = await this._arrayBufferDigest(arrayBuffer);
        switch (digest) {
            case 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906': // jpod101 invalid audio
                return false;
            default:
                return true;
        }
    }

    async _arrayBufferDigest(arrayBuffer) {
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(arrayBuffer)));
        let digest = '';
        for (const byte of hash) {
            digest += byte.toString(16).padStart(2, '0');
        }
        return digest;
    }

    _arrayBufferToBase64(arrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }
}
