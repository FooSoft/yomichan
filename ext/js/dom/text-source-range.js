/*
 * Copyright (C) 2016-2022  Yomichan Authors
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
 * DOMTextScanner
 * DocumentUtil
 */

class TextSourceRange {
    constructor(range, content, imposterElement, imposterSourceElement) {
        this._range = range;
        this._rangeStartOffset = range.startOffset;
        this._content = content;
        this._imposterElement = imposterElement;
        this._imposterSourceElement = imposterSourceElement;
    }

    get type() {
        return 'range';
    }

    get range() {
        return this._range;
    }

    get rangeStartOffset() {
        return this._rangeStartOffset;
    }

    get imposterSourceElement() {
        return this._imposterSourceElement;
    }

    get isConnected() {
        return (
            this._range.startContainer.isConnected &&
            this._range.endContainer.isConnected
        );
    }

    clone() {
        return new TextSourceRange(this._range.cloneRange(), this._content, this._imposterElement, this._imposterSourceElement);
    }

    cleanup() {
        if (this._imposterElement !== null && this._imposterElement.parentNode !== null) {
            this._imposterElement.parentNode.removeChild(this._imposterElement);
        }
    }

    text() {
        return this._content;
    }

    setEndOffset(length, fromEnd, layoutAwareScan) {
        let node;
        let offset;
        if (fromEnd) {
            node = this._range.endContainer;
            offset = this._range.endOffset;
        } else {
            node = this._range.startContainer;
            offset = this._range.startOffset;
        }
        const state = new DOMTextScanner(node, offset, !layoutAwareScan, layoutAwareScan).seek(length);
        this._range.setEnd(state.node, state.offset);
        this._content = (fromEnd ? this._content + state.content : state.content);
        return length - state.remainder;
    }

    setStartOffset(length, layoutAwareScan) {
        const state = new DOMTextScanner(this._range.startContainer, this._range.startOffset, !layoutAwareScan, layoutAwareScan).seek(-length);
        this._range.setStart(state.node, state.offset);
        this._rangeStartOffset = this._range.startOffset;
        this._content = state.content + this._content;
        return length - state.remainder;
    }

    getRect() {
        return DocumentUtil.convertRectZoomCoordinates(this._range.getBoundingClientRect(), this._range.startContainer);
    }

    getRects() {
        return DocumentUtil.convertMultipleRectZoomCoordinates(this._range.getClientRects(), this._range.startContainer);
    }

    getWritingMode() {
        const node = this._range.startContainer;
        return DocumentUtil.getElementWritingMode(node !== null ? node.parentElement : null);
    }

    select() {
        if (this._imposterElement !== null) { return; }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this._range);
    }

    deselect() {
        if (this._imposterElement !== null) { return; }
        const selection = window.getSelection();
        selection.removeAllRanges();
    }

    hasSameStart(other) {
        if (!(
            typeof other === 'object' &&
            other !== null &&
            other instanceof TextSourceRange
        )) {
            return false;
        }
        if (this._imposterSourceElement !== null) {
            return (
                this._imposterSourceElement === other.imposterSourceElement &&
                this._rangeStartOffset === other.rangeStartOffset
            );
        } else {
            try {
                return this._range.compareBoundaryPoints(Range.START_TO_START, other.range) === 0;
            } catch (e) {
                if (e.name === 'WrongDocumentError') {
                    // This can happen with shadow DOMs if the ranges are in different documents.
                    return false;
                }
                throw e;
            }
        }
    }

    getNodesInRange() {
        return DocumentUtil.getNodesInRange(this._range);
    }

    static create(range) {
        return new TextSourceRange(range, range.toString(), null, null);
    }

    static createFromImposter(range, imposterElement, imposterSourceElement) {
        return new TextSourceRange(range, range.toString(), imposterElement, imposterSourceElement);
    }
}
