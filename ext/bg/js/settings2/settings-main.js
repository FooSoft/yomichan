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

/* global
 * AudioController
 * GenericSettingController
 * ModalController
 * SettingsController
 * SettingsDisplayController
 * StorageController
 * api
 */

async function setupEnvironmentInfo() {
    const {browser, platform} = await api.getEnvironmentInfo();
    document.documentElement.dataset.browser = browser;
    document.documentElement.dataset.os = platform.os;
}

async function setupGenericSettingsController(genericSettingController) {
    await genericSettingController.prepare();
    await genericSettingController.refresh();
}

(async () => {
    try {
        document.querySelector('#content-scroll-focus').focus();

        api.forwardLogsToBackend();
        await yomichan.prepare();

        setupEnvironmentInfo();

        const optionsFull = await api.optionsGetFull();

        const preparePromises = [];

        const modalController = new ModalController();
        modalController.prepare();

        const settingsController = new SettingsController(optionsFull.profileCurrent);
        settingsController.prepare();

        const storageController = new StorageController();
        storageController.prepare();

        const genericSettingController = new GenericSettingController(settingsController);
        preparePromises.push(setupGenericSettingsController(genericSettingController));

        const audioController = new AudioController(settingsController);
        audioController.prepare();

        await Promise.all(preparePromises);

        document.documentElement.dataset.loaded = 'true';

        const settingsDisplayController = new SettingsDisplayController(settingsController, modalController);
        settingsDisplayController.prepare();
    } catch (e) {
        yomichan.logError(e);
    }
})();
