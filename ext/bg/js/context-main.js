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
 * api
 */

class DisplayController {
    constructor() {
    }

    async prepare() {
        const manifest = chrome.runtime.getManifest();

        this._showExtensionInfo(manifest);
        this._setupEnvironment();
        this._setupOptions();
        this._setupButtonEvents('.action-open-search', 'search', chrome.runtime.getURL('/bg/search.html'));
        this._setupButtonEvents('.action-open-options', 'options', chrome.runtime.getURL(manifest.options_ui.page));
        this._setupButtonEvents('.action-open-help', 'help', 'https://foosoft.net/projects/yomichan/');
    }

    // Private

    _showExtensionInfo(manifest) {
        const node = document.getElementById('extension-info');
        if (node === null) { return; }

        node.textContent = `${manifest.name} v${manifest.version}`;
    }

    _setupButtonEvents(selector, command, url) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
            node.addEventListener('click', (e) => {
                if (e.button !== 0) { return; }
                api.commandExec(command, {mode: e.ctrlKey ? 'newTab' : 'existingOrNewTab'});
                e.preventDefault();
            }, false);
            node.addEventListener('auxclick', (e) => {
                if (e.button !== 1) { return; }
                api.commandExec(command, {mode: 'newTab'});
                e.preventDefault();
            }, false);

            if (typeof url === 'string') {
                node.href = url;
                node.target = '_blank';
                node.rel = 'noopener';
            }
        }
    }

    async _setupEnvironment() {
        // Firefox mobile opens this page as a full webpage.
        const {browser} = await api.getEnvironmentInfo();
        document.documentElement.dataset.mode = (browser === 'firefox-mobile' ? 'full' : 'mini');
    }

    async _setupOptions() {
        const optionsContext = {
            depth: 0,
            url: window.location.href
        };
        const options = await api.optionsGet(optionsContext);

        const extensionEnabled = options.general.enable;
        const onToggleChanged = () => api.commandExec('toggle');
        for (const toggle of document.querySelectorAll('#enable-search,#enable-search2')) {
            toggle.checked = extensionEnabled;
            toggle.addEventListener('change', onToggleChanged, false);
        }

        setTimeout(() => {
            document.body.dataset.loaded = 'true';
        }, 10);
    }
}

(async () => {
    api.forwardLogsToBackend();
    await yomichan.backendReady();

    api.logIndicatorClear();

    const displayController = new DisplayController();
    displayController.prepare();

    yomichan.ready();
})();
