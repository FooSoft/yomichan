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
 * AnkiNoteDataCreator
 * CssStyleApplier
 * JapaneseUtil
 * TemplateRenderer
 */

class AnkiTemplateRenderer {
    constructor() {
        this._cssStyleApplier = new CssStyleApplier('/data/structured-content-style.json');
        this._japaneseUtil = new JapaneseUtil(null);
        this._templateRenderer = new TemplateRenderer(this._japaneseUtil, this._cssStyleApplier);
        this._ankiNoteDataCreator = new AnkiNoteDataCreator(this._japaneseUtil);
    }

    get templateRenderer() {
        return this._templateRenderer;
    }

    async prepare() {
        this._templateRenderer.registerDataType('ankiNote', {
            modifier: ({marker, commonData}) => this._ankiNoteDataCreator.create(marker, commonData),
            composeData: (marker, commonData) => ({marker, commonData})
        });
        await this._cssStyleApplier.prepare();
    }
}
