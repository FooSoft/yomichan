/*
 * Copyright (C) 2019-2020  Yomichan Authors
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

class StorageController {
    constructor() {
        this._mostRecentStorageEstimate = null;
        this._storageEstimateFailed = false;
        this._isUpdating = false;
        this._persistentStorageCheckbox = false;
    }

    prepare() {
        this._persistentStorageCheckbox = document.querySelector('#persistent-storage-checkbox');
        this._preparePersistentStorage();
        this.updateStats();
        this._persistentStorageCheckbox.addEventListener('change', this._onPersistentStorageCheckboxChange.bind(this), false);
        document.querySelector('#storage-refresh').addEventListener('click', this.updateStats.bind(this), false);
    }

    async updateStats() {
        try {
            this._isUpdating = true;

            const estimate = await this._storageEstimate();
            const valid = (estimate !== null);

            if (valid) {
                // Firefox reports usage as 0 when persistent storage is enabled.
                const finite = (estimate.usage > 0 || !(await this._isStoragePeristent()));
                if (finite) {
                    document.querySelector('#storage-usage').textContent = this._bytesToLabeledString(estimate.usage);
                    document.querySelector('#storage-quota').textContent = this._bytesToLabeledString(estimate.quota);
                }
                document.querySelector('#storage-use-finite').hidden = !finite;
                document.querySelector('#storage-use-infinite').hidden = finite;
                document.querySelector('#storage-use-undefined').hidden = true;
            }

            const useContainer = document.querySelector('#storage-use');
            const errorContainer = document.querySelector('#storage-error');
            if (useContainer) { useContainer.hidden = !valid; }
            if (errorContainer) { errorContainer.hidden = valid; }

            return valid;
        } finally {
            this._isUpdating = false;
        }
    }

    // Private

    async _preparePersistentStorage() {
        if (!(navigator.storage && navigator.storage.persist)) {
            // Not supported
            return;
        }

        const info = document.querySelector('#storage-persist-info');
        if (info !== null) { info.hidden = false; }

        const isStoragePeristent = await this._isStoragePeristent();
        this._updateCheckbox(isStoragePeristent);

        const button = document.querySelector('#storage-persist-button');
        if (button !== null) {
            button.hidden = false;
            button.addEventListener('click', this._onPersistStorageButtonClick.bind(this), false);
        }
    }

    _onPersistentStorageCheckboxChange(e) {
        const node = e.currentTarget;
        if (!node.checked) {
            node.checked = true;
            return;
        }
        this._attemptPersistStorage();
    }

    _onPersistStorageButtonClick() {
        const {checked} = this._persistentStorageCheckbox;
        if (checked) { return; }
        this._persistentStorageCheckbox.checked = !checked;
        this._persistentStorageCheckbox.dispatchEvent(new Event('change'));
    }

    async _attemptPersistStorage() {
        if (await this._isStoragePeristent()) { return; }

        let isStoragePeristent = false;
        try {
            isStoragePeristent = await navigator.storage.persist();
        } catch (e) {
            // NOP
        }

        this._updateCheckbox(isStoragePeristent);

        if (isStoragePeristent) {
            this.updateStats();
        } else {
            const node = document.querySelector('#storage-persist-fail-warning');
            if (node !== null) { node.hidden = false; }
        }
    }

    async _storageEstimate() {
        if (this._storageEstimateFailed && this._mostRecentStorageEstimate === null) {
            return null;
        }
        try {
            const value = await navigator.storage.estimate();
            this._mostRecentStorageEstimate = value;
            return value;
        } catch (e) {
            this._storageEstimateFailed = true;
        }
        return null;
    }

    _bytesToLabeledString(size) {
        const base = 1000;
        const labels = [' bytes', 'KB', 'MB', 'GB'];
        let labelIndex = 0;
        while (size >= base) {
            size /= base;
            ++labelIndex;
        }
        const label = labelIndex === 0 ? `${size}` : size.toFixed(1);
        return `${label}${labels[labelIndex]}`;
    }

    async _isStoragePeristent() {
        try {
            return await navigator.storage.persisted();
        } catch (e) {
            // NOP
        }
        return false;
    }

    _updateCheckbox(isStoragePeristent) {
        const checkbox = this._persistentStorageCheckbox;
        checkbox.checked = isStoragePeristent;
        checkbox.readOnly = isStoragePeristent;
    }
}
