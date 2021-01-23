/*
 * Copyright (C) 2021  Yomichan Authors
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
 * AudioSystem
 * api
 */

class DisplayAudio {
    constructor(display) {
        this._display = display;
        this._audioPlaying = null;
        this._audioSystem = new AudioSystem();
        this._autoPlayAudioTimer = null;
        this._autoPlayAudioDelay = 400;
        this._eventListeners = new EventListenerCollection();
        this._cache = new Map();
    }

    get autoPlayAudioDelay() {
        return this._autoPlayAudioDelay;
    }

    set autoPlayAudioDelay(value) {
        this._autoPlayAudioDelay = value;
    }

    prepare() {
        this._audioSystem.prepare();
    }

    updateOptions(options) {
        const data = document.documentElement.dataset;
        data.audioEnabled = `${options.audio.enabled && options.audio.sources.length > 0}`;
    }

    cleanupEntries() {
        this._cache.clear();
        this.clearAutoPlayTimer();
        this._eventListeners.removeAllEventListeners();
    }

    setupEntry(entry, definitionIndex) {
        for (const button of entry.querySelectorAll('.action-play-audio')) {
            const expressionIndex = this._getAudioPlayButtonExpressionIndex(button);
            this._eventListeners.addEventListener(button, 'click', this._onAudioPlayButtonClick.bind(this, definitionIndex, expressionIndex), false);
        }
    }

    setupEntriesComplete() {
        const {audio} = this._display.getOptions();
        if (!audio.enabled || !audio.autoPlay) { return; }

        this.clearAutoPlayTimer();

        const definitions = this._display.definitions;
        if (definitions.length === 0) { return; }

        const firstDefinition = definitions[0];
        if (firstDefinition.type === 'kanji') { return; }

        const callback = () => {
            this._autoPlayAudioTimer = null;
            this.playAudio(0, 0);
        };

        if (this._autoPlayAudioDelay > 0) {
            this._autoPlayAudioTimer = setTimeout(callback, this._autoPlayAudioDelay);
        } else {
            callback();
        }
    }

    clearAutoPlayTimer() {
        if (this._autoPlayAudioTimer === null) { return; }
        clearTimeout(this._autoPlayAudioTimer);
        this._autoPlayAudioTimer = null;
    }

    stopAudio() {
        if (this._audioPlaying === null) { return; }
        this._audioPlaying.pause();
        this._audioPlaying = null;
    }

    async playAudio(definitionIndex, expressionIndex) {
        this.stopAudio();
        this.clearAutoPlayTimer();

        const {definitions} = this._display;
        if (definitionIndex < 0 || definitionIndex >= definitions.length) { return; }

        const definition = definitions[definitionIndex];
        if (definition.type === 'kanji') { return; }

        const {expressions} = definition;
        if (expressionIndex < 0 || expressionIndex >= expressions.length) { return; }

        const {expression, reading} = expressions[expressionIndex];
        const {sources, textToSpeechVoice, customSourceUrl, volume} = this._display.getOptions().audio;

        const progressIndicatorVisible = this._display.progressIndicatorVisible;
        const overrideToken = progressIndicatorVisible.setOverride(true);
        try {
            // Create audio
            let audio;
            let title;
            try {
                let source;
                ({audio, source} = await this._createExpressionAudio(sources, expression, reading, {textToSpeechVoice, customSourceUrl}));
                const sourceIndex = sources.indexOf(source);
                title = `From source ${1 + sourceIndex}: ${source}`;
            } catch (e) {
                audio = this._audioSystem.getFallbackAudio();
                title = 'Could not find audio';
            }

            // Stop any currently playing audio
            this.stopAudio();

            // Update details
            for (const button of this._getAudioPlayButtons(definitionIndex, expressionIndex)) {
                const titleDefault = button.dataset.titleDefault || '';
                button.title = `${titleDefault}\n${title}`;
            }

            // Play
            audio.currentTime = 0;
            audio.volume = Number.isFinite(volume) ? Math.max(0.0, Math.min(1.0, volume / 100.0)) : 1.0;

            const playPromise = audio.play();
            this._audioPlaying = audio;

            if (typeof playPromise !== 'undefined') {
                try {
                    await playPromise;
                } catch (e) {
                    // NOP
                }
            }
        } finally {
            progressIndicatorVisible.clearOverride(overrideToken);
        }
    }

    // Private

    _onAudioPlayButtonClick(definitionIndex, expressionIndex, e) {
        e.preventDefault();
        this.playAudio(definitionIndex, expressionIndex);
    }

    _getAudioPlayButtonExpressionIndex(button) {
        const expressionNode = button.closest('.term-expression');
        if (expressionNode !== null) {
            const expressionIndex = parseInt(expressionNode.dataset.index, 10);
            if (Number.isFinite(expressionIndex)) { return expressionIndex; }
        }
        return 0;
    }

    _getAudioPlayButtons(definitionIndex, expressionIndex) {
        const results = [];
        const {definitionNodes} = this._display;
        if (definitionIndex >= 0 && definitionIndex < definitionNodes.length) {
            const node = definitionNodes[definitionIndex];
            const button1 = (expressionIndex === 0 ? node.querySelector('.action-play-audio') : null);
            const button2 = node.querySelector(`.term-expression:nth-of-type(${expressionIndex + 1}) .action-play-audio`);
            if (button1 !== null) { results.push(button1); }
            if (button2 !== null) { results.push(button2); }
        }
        return results;
    }

    async _createExpressionAudio(sources, expression, reading, details) {
        const key = JSON.stringify([expression, reading]);

        let sourceMap = this._cache.get(key);
        if (typeof sourceMap === 'undefined') {
            sourceMap = new Map();
            this._cache.set(key, sourceMap);
        }

        for (let i = 0, ii = sources.length; i < ii; ++i) {
            const source = sources[i];

            let infoListPromise = sourceMap.get(source);
            if (typeof infoListPromise === 'undefined') {
                infoListPromise = this._getExpressionAudioInfoList(source, expression, reading, details);
                sourceMap.set(source, infoListPromise);
            }
            const infoList = await infoListPromise;

            for (let j = 0, jj = infoList.length; j < jj; ++j) {
                const item = infoList[j];

                let {audioPromise} = item;
                if (audioPromise === null) {
                    audioPromise = this._createAudioFromInfo(item.info, source);
                    item.audioPromise = audioPromise;
                }

                let audio;
                try {
                    audio = await audioPromise;
                } catch (e) {
                    continue;
                }

                return {audio, source, infoListIndex: j};
            }
        }

        throw new Error('Could not create audio');
    }

    async _createAudioFromInfo(info, source) {
        switch (info.type) {
            case 'url':
                return await this._audioSystem.createAudio(info.url, source);
            case 'tts':
                return this._audioSystem.createTextToSpeechAudio(info.text, info.voice);
            default:
                throw new Error(`Unsupported type: ${info.type}`);
        }
    }

    async _getExpressionAudioInfoList(source, expression, reading, details) {
        const infoList = await api.getExpressionAudioInfoList(source, expression, reading, details);
        return infoList.map((info) => ({info, audioPromise: null}));
    }
}
