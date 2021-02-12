/*
 * Copyright (C) 2019-2021  Yomichan Authors
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
 * Display
 * DisplaySearch
 * DocumentFocusController
 * HotkeyHandler
 * JapaneseUtil
 * api
 * wanakana
 */

(async () => {
    try {
        const documentFocusController = new DocumentFocusController();
        documentFocusController.prepare();

        api.forwardLogsToBackend();
        await yomichan.backendReady();

        const {tabId, frameId} = await api.frameInformationGet();

        const japaneseUtil = new JapaneseUtil(wanakana);

        const hotkeyHandler = new HotkeyHandler();
        hotkeyHandler.prepare();

        const display = new Display(tabId, frameId, 'search', japaneseUtil, documentFocusController, hotkeyHandler);
        await display.prepare();

        const displaySearch = new DisplaySearch(tabId, frameId, display, japaneseUtil);
        await displaySearch.prepare();

        display.initializeState();

        document.documentElement.dataset.loaded = 'true';

        yomichan.ready();
    } catch (e) {
        yomichan.logError(e);
    }
})();
