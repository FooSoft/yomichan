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

class TranslationTextReplacementsController {
    constructor(settingsController) {
        this._settingsController = settingsController;
        this._entryContainer = null;
        this._entries = [];
    }

    async prepare() {
        this._entryContainer = document.querySelector('#translation-text-replacement-list');
        const addButton = document.querySelector('#translation-text-replacement-add');

        addButton.addEventListener('click', this._onAdd.bind(this), false);
        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));

        await this._updateOptions();
    }


    async addGroup() {
        const options = await this._settingsController.getOptions();
        const {groups} = options.translation.textReplacements;
        const newEntry = this._createNewEntry();
        const target = (
            (groups.length === 0) ?
            {
                action: 'splice',
                path: 'translation.textReplacements.groups',
                start: 0,
                deleteCount: 0,
                items: [[newEntry]]
            } :
            {
                action: 'splice',
                path: 'translation.textReplacements.groups[0]',
                start: groups[0].length,
                deleteCount: 0,
                items: [newEntry]
            }
        );

        await this._settingsController.modifyProfileSettings([target]);
        await this._updateOptions();
    }

    async deleteGroup(index) {
        const options = await this._settingsController.getOptions();
        const {groups} = options.translation.textReplacements;
        if (groups.length === 0) { return false; }

        const group0 = groups[0];
        if (index < 0 || index >= group0.length) { return false; }

        const target = (
            (group0.length > 1) ?
            {
                action: 'splice',
                path: 'translation.textReplacements.groups[0]',
                start: index,
                deleteCount: 1,
                items: []
            } :
            {
                action: 'splice',
                path: 'translation.textReplacements.groups',
                start: 0,
                deleteCount: group0.length,
                items: []
            }
        );

        await this._settingsController.modifyProfileSettings([target]);
        await this._updateOptions();
        return true;
    }

    // Private

    _onOptionsChanged({options}) {
        for (const entry of this._entries) {
            entry.cleanup();
        }
        this._entries = [];

        const {groups} = options.translation.textReplacements;
        if (groups.length > 0) {
            const group0 = groups[0];
            for (let i = 0, ii = group0.length; i < ii; ++i) {
                const data = group0[i];
                const node = this._settingsController.instantiateTemplate('translation-text-replacement-entry');
                this._entryContainer.appendChild(node);
                const entry = new TranslationTextReplacementsEntry(this, node, i, data);
                this._entries.push(entry);
                entry.prepare();
            }
        }
    }

    _onAdd() {
        this.addGroup();
    }

    async _updateOptions() {
        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options});
    }

    _createNewEntry() {
        return {pattern: '', ignoreCase: false, replacement: ''};
    }
}

class TranslationTextReplacementsEntry {
    constructor(parent, node, index) {
        this._parent = parent;
        this._node = node;
        this._index = index;
        this._eventListeners = new EventListenerCollection();
        this._patternInput = null;
    }

    prepare() {
        const patternInput = this._node.querySelector('.translation-text-replacement-pattern');
        const replacementInput = this._node.querySelector('.translation-text-replacement-replacement');
        const ignoreCaseToggle = this._node.querySelector('.translation-text-replacement-pattern-ignore-case');
        const menuButton = this._node.querySelector('.translation-text-replacement-button');

        this._patternInput = patternInput;

        const pathBase = `translation.textReplacements.groups[0][${this._index}]`;
        patternInput.dataset.setting = `${pathBase}.pattern`;
        replacementInput.dataset.setting = `${pathBase}.replacement`;
        ignoreCaseToggle.dataset.setting = `${pathBase}.ignoreCase`;

        this._eventListeners.addEventListener(menuButton, 'menuClosed', this._onMenuClosed.bind(this), false);
        this._eventListeners.addEventListener(patternInput, 'settingChanged', this._onPatternChanged.bind(this), false);
    }

    cleanup() {
        this._eventListeners.removeAllEventListeners();
        if (this._node.parentNode !== null) {
            this._node.parentNode.removeChild(this._node);
        }
    }

    // Private

    _onMenuClosed({detail: {action}}) {
        switch (action) {
            case 'remove':
                this._parent.deleteGroup(this._index);
                break;
        }
    }

    _onPatternChanged({detail: {value}}) {
        this._validatePattern(value);
    }

    _validatePattern(value) {
        let okay = false;
        try {
            new RegExp(value, 'g');
            okay = true;
        } catch (e) {
            // NOP
        }

        this._patternInput.dataset.invalid = `${!okay}`;
    }
}
