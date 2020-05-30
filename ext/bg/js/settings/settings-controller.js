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
 * api
 * utilBackend
 * utilBackgroundIsolate
 */

class SettingsController extends EventDispatcher {
    constructor(profileIndex=0) {
        super();
        this._profileIndex = profileIndex;
        this._source = yomichan.generateId(16);
    }

    get profileIndex() {
        return this._profileIndex;
    }

    set profileIndex(value) {
        if (this._profileIndex === value) { return; }
        this._profileIndex = value;
        this.trigger('optionsContextChanged');
        this._onOptionsUpdatedInternal();
    }

    prepare() {
        yomichan.on('optionsUpdated', this._onOptionsUpdated.bind(this));
    }

    async save() {
        await api.optionsSave(this._source);
    }

    async getOptions() {
        const optionsContext = this.getOptionsContext();
        return await api.optionsGet(optionsContext);
    }

    async getOptionsFull() {
        return await api.optionsGetFull();
    }

    async getOptionsMutable() {
        const optionsContext = this.getOptionsContext();
        return utilBackend().getOptions(utilBackgroundIsolate(optionsContext));
    }

    async getOptionsFullMutable() {
        return utilBackend().getFullOptions();
    }

    async setOptionsFull(optionsFull) {
        utilBackend().setFullOptions(utilBackgroundIsolate(optionsFull));
        await this.save();
    }

    getOptionsContext() {
        return {index: this._profileIndex};
    }

    // Private

    _onOptionsUpdated({source}) {
        if (source === this._source) { return; }
        this._onOptionsUpdatedInternal();
    }

    async _onOptionsUpdatedInternal() {
        const optionsContext = this.getOptionsContext();
        const options = await this.getOptions();
        this.trigger('optionsChanged', {options, optionsContext});
    }
}
