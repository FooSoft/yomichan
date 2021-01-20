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
 * AnkiNoteBuilder
 * api
 */

class AnkiTemplatesController {
    constructor(settingsController, modalController, ankiController) {
        this._settingsController = settingsController;
        this._modalController = modalController;
        this._ankiController = ankiController;
        this._cachedDefinitionValue = null;
        this._cachedDefinitionText = null;
        this._defaultFieldTemplates = null;
        this._fieldTemplatesTextarea = null;
        this._compileResultInfo = null;
        this._renderFieldInput = null;
        this._renderResult = null;
        this._fieldTemplateResetModal = null;
        this._ankiNoteBuilder = new AnkiNoteBuilder(true);
    }

    async prepare() {
        this._defaultFieldTemplates = await api.getDefaultAnkiFieldTemplates();

        this._fieldTemplatesTextarea = document.querySelector('#anki-card-templates-textarea');
        this._compileResultInfo = document.querySelector('#anki-card-templates-compile-result');
        this._renderFieldInput = document.querySelector('#anki-card-templates-test-field-input');
        this._renderTextInput = document.querySelector('#anki-card-templates-test-text-input');
        this._renderResult = document.querySelector('#anki-card-templates-render-result');
        const menuButton = document.querySelector('#anki-card-templates-test-field-menu-button');
        const testRenderButton = document.querySelector('#anki-card-templates-test-render-button');
        const resetButton = document.querySelector('#anki-card-templates-reset-button');
        const resetConfirmButton = document.querySelector('#anki-card-templates-reset-button-confirm');
        const fieldList = document.querySelector('#anki-card-templates-field-list');
        this._fieldTemplateResetModal = this._modalController.getModal('anki-card-templates-reset');

        const markers = new Set([
            ...this._ankiController.getFieldMarkers('terms'),
            ...this._ankiController.getFieldMarkers('kanji')
        ]);

        if (fieldList !== null) {
            const fragment = this._ankiController.getFieldMarkersHtml(markers);
            fieldList.appendChild(fragment);
            for (const node of fieldList.querySelectorAll('.marker-link')) {
                node.addEventListener('click', this._onMarkerClicked.bind(this), false);
            }
        }

        this._fieldTemplatesTextarea.addEventListener('change', this._onChanged.bind(this), false);
        testRenderButton.addEventListener('click', this._onRender.bind(this), false);
        resetButton.addEventListener('click', this._onReset.bind(this), false);
        resetConfirmButton.addEventListener('click', this._onResetConfirm.bind(this), false);
        if (menuButton !== null) {
            menuButton.addEventListener('menuClose', this._onFieldMenuClose.bind(this), false);
        }

        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));

        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options});
    }

    // Private

    _onOptionsChanged({options}) {
        let templates = options.anki.fieldTemplates;
        if (typeof templates !== 'string') { templates = this._defaultFieldTemplates; }
        this._fieldTemplatesTextarea.value = templates;

        this._onValidateCompile();
    }

    _onReset(e) {
        e.preventDefault();
        this._fieldTemplateResetModal.setVisible(true);
    }

    _onResetConfirm(e) {
        e.preventDefault();

        this._fieldTemplateResetModal.setVisible(false);

        const value = this._defaultFieldTemplates;

        this._fieldTemplatesTextarea.value = value;
        this._fieldTemplatesTextarea.dispatchEvent(new Event('change'));
    }

    async _onChanged(e) {
        // Get value
        let templates = e.currentTarget.value;
        if (templates === this._defaultFieldTemplates) {
            // Default
            templates = null;
        }

        // Overwrite
        await this._settingsController.setProfileSetting('anki.fieldTemplates', templates);

        // Compile
        this._onValidateCompile();
    }

    _onValidateCompile() {
        this._validate(this._compileResultInfo, '{expression}', 'term-kanji', false, true);
    }

    _onMarkerClicked(e) {
        e.preventDefault();
        this._renderFieldInput.value = `{${e.target.textContent}}`;
    }

    _onRender(e) {
        e.preventDefault();

        const field = this._renderFieldInput.value;
        const infoNode = this._renderResult;
        infoNode.hidden = true;
        this._cachedDefinitionText = null;
        this._validate(infoNode, field, 'term-kanji', true, false);
    }

    _onFieldMenuClose({currentTarget: node, detail: {action, item}}) {
        switch (action) {
            case 'setFieldMarker':
                this._setFieldMarker(node, item.dataset.marker);
                break;
        }
    }

    _setFieldMarker(element, marker) {
        const input = this._renderFieldInput;
        input.value = `{${marker}}`;
        input.dispatchEvent(new Event('change'));
    }

    async _getDefinition(text, optionsContext) {
        if (this._cachedDefinitionText !== text) {
            const {definitions} = await api.termsFind(text, {}, optionsContext);
            if (definitions.length === 0) { return null; }

            this._cachedDefinitionValue = definitions[0];
            this._cachedDefinitionText = text;
        }
        return this._cachedDefinitionValue;
    }

    async _validate(infoNode, field, mode, showSuccessResult, invalidateInput) {
        const text = this._renderTextInput.value || '';
        const exceptions = [];
        let result = `No definition found for ${text}`;
        try {
            const optionsContext = this._settingsController.getOptionsContext();
            const definition = await this._getDefinition(text, optionsContext);
            if (definition !== null) {
                const options = await this._settingsController.getOptions();
                const context = {
                    url: window.location.href,
                    sentence: {text: definition.rawSource, offset: 0},
                    documentTitle: document.title
                };
                let templates = options.anki.fieldTemplates;
                if (typeof templates !== 'string') { templates = this._defaultFieldTemplates; }
                const {general: {resultOutputMode, glossaryLayoutMode, compactTags}} = options;
                const note = await this._ankiNoteBuilder.createNote({
                    definition,
                    mode,
                    context,
                    templates,
                    deckName: '',
                    modelName: '',
                    fields: [
                        ['field', field]
                    ],
                    resultOutputMode,
                    glossaryLayoutMode,
                    compactTags,
                    errors: exceptions
                });
                result = note.fields.field;
            }
        } catch (e) {
            exceptions.push(e);
        }

        const hasException = exceptions.length > 0;
        infoNode.hidden = !(showSuccessResult || hasException);
        infoNode.textContent = hasException ? exceptions.map((e) => `${e}`).join('\n') : (showSuccessResult ? result : '');
        infoNode.classList.toggle('text-danger', hasException);
        if (invalidateInput) {
            this._fieldTemplatesTextarea.dataset.invalid = `${hasException}`;
        }
    }
}
