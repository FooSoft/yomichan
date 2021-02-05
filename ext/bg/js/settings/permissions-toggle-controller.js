/*
 * Copyright (C) 2020-2021  Yomichan Authors
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
 * ObjectPropertyAccessor
 */

class PermissionsToggleController {
    constructor(settingsController) {
        this._settingsController = settingsController;
        this._toggles = null;
    }

    async prepare() {
        this._toggles = document.querySelectorAll('.permissions-toggle');

        for (const toggle of this._toggles) {
            toggle.addEventListener('change', this._onPermissionsToggleChange.bind(this), false);
        }
        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));
        this._settingsController.on('permissionsChanged', this._onPermissionsChanged.bind(this));

        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options});
    }

    // Private

    _onOptionsChanged({options}) {
        const accessor = new ObjectPropertyAccessor(options);
        for (const toggle of this._toggles) {
            const path = ObjectPropertyAccessor.getPathArray(toggle.dataset.clipboardSetting);
            let value;
            try {
                value = accessor.get(path, path.length);
            } catch (e) {
                continue;
            }
            toggle.checked = !!value;
        }
        this._updateValidity();
    }

    async _onPermissionsToggleChange(e) {
        const toggle = e.currentTarget;
        let value = toggle.checked;

        if (value) {
            toggle.checked = false;
            value = await this._settingsController.setPermissionsGranted(this._getRequiredPermissions(toggle), true);
            toggle.checked = value;
        }

        this._setToggleValid(toggle, true);

        await this._settingsController.setProfileSetting(toggle.dataset.clipboardSetting, value);
    }

    _onPermissionsChanged({permissions: {permissions}}) {
        const permissionsSet = new Set(permissions);
        for (const toggle of this._toggles) {
            const valid = !toggle.checked || this._hasAll(permissionsSet, this._getRequiredPermissions(toggle));
            this._setToggleValid(toggle, valid);
        }
    }

    _setToggleValid(toggle, valid) {
        const relative = toggle.closest('.settings-item');
        if (relative === null) { return; }
        relative.dataset.invalid = `${!valid}`;
    }

    async _updateValidity() {
        const permissions = await this._settingsController.getAllPermissions();
        this._onPermissionsChanged({permissions});
    }

    _hasAll(set, values) {
        for (const value of values) {
            if (!set.has(value)) { return false; }
        }
        return true;
    }

    _getRequiredPermissions(toggle) {
        const requiredPermissions = toggle.dataset.requiredPermissions;
        return (typeof requiredPermissions === 'string' && requiredPermissions.length > 0 ? requiredPermissions.split(' ') : []);
    }
}
