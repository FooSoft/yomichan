/*
 * Copyright (C) 2016-2020  Yomichan Authors
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
 * DOM
 * FrameOffsetForwarder
 * PopupProxy
 * TextScanner
 * api
 * docSentenceExtract
 */

class Frontend {
    constructor(frameId, popupFactory, frontendInitializationData) {
        this._id = yomichan.generateId(16);
        this._popup = null;
        this._disabledOverride = false;
        this._options = null;
        this._pageZoomFactor = 1.0;
        this._contentScale = 1.0;
        this._orphaned = false;
        this._lastShowPromise = Promise.resolve();
        this._enabledEventListeners = new EventListenerCollection();
        this._activeModifiers = new Set();
        this._optionsUpdatePending = false;
        this._textScanner = new TextScanner({
            node: window,
            ignoreElements: this._ignoreElements.bind(this),
            ignorePoint: this._ignorePoint.bind(this),
            search: this._search.bind(this)
        });

        const {
            depth=0,
            id: proxyPopupId,
            parentFrameId,
            proxy: useProxyPopup=false,
            isSearchPage=false,
            allowRootFramePopupProxy=true
        } = frontendInitializationData;
        this._proxyPopupId = proxyPopupId;
        this._parentFrameId = parentFrameId;
        this._useProxyPopup = useProxyPopup;
        this._isSearchPage = isSearchPage;
        this._depth = depth;
        this._frameId = frameId;
        this._frameOffsetForwarder = new FrameOffsetForwarder();
        this._popupFactory = popupFactory;
        this._allowRootFramePopupProxy = allowRootFramePopupProxy;
        this._popupCache = new Map();
        this._updatePopupToken = null;

        this._windowMessageHandlers = new Map([
            ['popupClose', this._onMessagePopupClose.bind(this)],
            ['selectionCopy', this._onMessageSelectionCopy.bind()]
        ]);

        this._runtimeMessageHandlers = new Map([
            ['popupSetVisibleOverride', this._onMessagePopupSetVisibleOverride.bind(this)],
            ['rootPopupRequestInformationBroadcast', this._onMessageRootPopupRequestInformationBroadcast.bind(this)],
            ['requestDocumentInformationBroadcast', this._onMessageRequestDocumentInformationBroadcast.bind(this)]
        ]);
    }

    get canClearSelection() {
        return this._textScanner.canClearSelection;
    }

    set canClearSelection(value) {
        this._textScanner.canClearSelection = value;
    }

    get popup() {
        return this._popup;
    }

    async prepare() {
        await this.updateOptions();
        try {
            const {zoomFactor} = await api.getZoom();
            this._pageZoomFactor = zoomFactor;
        } catch (e) {
            // Ignore exceptions which may occur due to being on an unsupported page (e.g. about:blank)
        }

        this._textScanner.prepare();

        window.addEventListener('resize', this._onResize.bind(this), false);
        DOM.addFullscreenChangeEventListener(this._updatePopup.bind(this));

        const visualViewport = window.visualViewport;
        if (visualViewport !== null && typeof visualViewport === 'object') {
            window.visualViewport.addEventListener('scroll', this._onVisualViewportScroll.bind(this));
            window.visualViewport.addEventListener('resize', this._onVisualViewportResize.bind(this));
        }

        yomichan.on('orphaned', this._onOrphaned.bind(this));
        yomichan.on('optionsUpdated', this.updateOptions.bind(this));
        yomichan.on('zoomChanged', this._onZoomChanged.bind(this));
        chrome.runtime.onMessage.addListener(this._onRuntimeMessage.bind(this));

        this._textScanner.on('clearSelection', this._onClearSelection.bind(this));
        this._textScanner.on('activeModifiersChanged', this._onActiveModifiersChanged.bind(this));

        api.crossFrame.registerHandlers([
            ['getUrl', {async: false, handler: this._onApiGetUrl.bind(this)}]
        ]);

        this._updateContentScale();
        this._broadcastRootPopupInformation();
    }

    setDisabledOverride(disabled) {
        this._disabledOverride = disabled;
        this._updateTextScannerEnabled();
    }

    async setTextSource(textSource) {
        await this._search(textSource, 'script');
        this._textScanner.setCurrentTextSource(textSource);
    }

    async getOptionsContext() {
        let url = window.location.href;
        if (this._useProxyPopup) {
            try {
                url = await api.crossFrame.invoke(this._parentFrameId, 'getUrl', {});
            } catch (e) {
                // NOP
            }
        }

        const depth = this._depth;
        const modifierKeys = [...this._activeModifiers];
        return {depth, url, modifierKeys};
    }

    async updateOptions() {
        const optionsContext = await this.getOptionsContext();
        this._options = await api.optionsGet(optionsContext);

        await this._updatePopup();

        this._textScanner.setOptions(this._options);
        this._updateTextScannerEnabled();

        const ignoreNodes = ['.scan-disable', '.scan-disable *'];
        if (!this._options.scanning.enableOnPopupExpressions) {
            ignoreNodes.push('.source-text', '.source-text *');
        }
        this._textScanner.ignoreNodes = ignoreNodes.join(',');

        this._updateContentScale();

        const textSourceCurrent = this._textScanner.getCurrentTextSource();
        const causeCurrent = this._textScanner.causeCurrent;
        if (textSourceCurrent !== null && causeCurrent !== null) {
            await this._search(textSourceCurrent, causeCurrent);
        }
    }

    showContentCompleted() {
        return this._lastShowPromise;
    }

    // Message handlers

    _onMessagePopupClose() {
        this._textScanner.clearSelection(false);
    }

    _onMessageSelectionCopy() {
        document.execCommand('copy');
    }

    _onMessagePopupSetVisibleOverride({visible}) {
        this._popup.setVisibleOverride(visible);
    }

    _onMessageRootPopupRequestInformationBroadcast() {
        this._broadcastRootPopupInformation();
    }

    _onMessageRequestDocumentInformationBroadcast({uniqueId}) {
        this._broadcastDocumentInformation(uniqueId);
    }

    // API message handlers

    _onApiGetUrl() {
        return window.location.href;
    }

    // Private

    _onResize() {
        this._updatePopupPosition();
    }

    _onWindowMessage(e) {
        const action = e.data;
        const handler = this._windowMessageHandlers.get(action);
        if (typeof handler !== 'function') { return false; }

        handler();
    }

    _onRuntimeMessage({action, params}, sender, callback) {
        const handler = this._runtimeMessageHandlers.get(action);
        if (typeof handler !== 'function') { return false; }

        const result = handler(params, sender);
        callback(result);
        return false;
    }

    _onOrphaned() {
        this._orphaned = true;
    }

    _onZoomChanged({newZoomFactor}) {
        this._pageZoomFactor = newZoomFactor;
        this._updateContentScale();
    }

    _onVisualViewportScroll() {
        this._updatePopupPosition();
    }

    _onVisualViewportResize() {
        this._updateContentScale();
    }

    _onClearSelection({passive}) {
        this._popup.hide(!passive);
        this._popup.clearAutoPlayTimer();
        this._updatePendingOptions();
    }

    async _onActiveModifiersChanged({modifiers}) {
        if (areSetsEqual(modifiers, this._activeModifiers)) { return; }
        this._activeModifiers = modifiers;
        if (await this._popup.isVisible()) {
            this._optionsUpdatePending = true;
            return;
        }
        await this.updateOptions();
    }

    async _updatePopup() {
        const showIframePopupsInRootFrame = this._options.general.showIframePopupsInRootFrame;
        const isIframe = !this._useProxyPopup && (window !== window.parent);

        let popupPromise;
        if (
            isIframe &&
            showIframePopupsInRootFrame &&
            DOM.getFullscreenElement() === null &&
            this._allowRootFramePopupProxy
        ) {
            popupPromise = this._popupCache.get('iframe');
            if (typeof popupPromise === 'undefined') {
                popupPromise = this._getIframeProxyPopup();
                this._popupCache.set('iframe', popupPromise);
            }
        } else if (this._useProxyPopup) {
            popupPromise = this._popupCache.get('proxy');
            if (typeof popupPromise === 'undefined') {
                popupPromise = this._getProxyPopup();
                this._popupCache.set('proxy', popupPromise);
            }
        } else {
            popupPromise = this._popupCache.get('default');
            if (typeof popupPromise === 'undefined') {
                popupPromise = this._getDefaultPopup();
                this._popupCache.set('default', popupPromise);
            }
        }

        // The token below is used as a unique identifier to ensure that a new _updatePopup call
        // hasn't been started during the await.
        const token = {};
        this._updatePopupToken = token;
        const popup = await popupPromise;
        const optionsContext = await this.getOptionsContext();
        if (this._updatePopupToken !== token) { return; }
        await popup.setOptionsContext(optionsContext, this._id);
        if (this._updatePopupToken !== token) { return; }

        if (this._isSearchPage) {
            this.setDisabledOverride(!this._options.scanning.enableOnSearchPage);
        }

        this._textScanner.clearSelection(true);
        this._popup = popup;
        this._depth = popup.depth;
    }

    async _getDefaultPopup() {
        return this._popupFactory.getOrCreatePopup(null, null, this._depth);
    }

    async _getProxyPopup() {
        const popup = new PopupProxy(null, this._depth + 1, this._proxyPopupId, this._parentFrameId);
        await popup.prepare();
        return popup;
    }

    async _getIframeProxyPopup() {
        const rootPopupInformationPromise = yomichan.getTemporaryListenerResult(
            chrome.runtime.onMessage,
            ({action, params}, {resolve}) => {
                if (action === 'rootPopupInformation') {
                    resolve(params);
                }
            }
        );
        api.broadcastTab('rootPopupRequestInformationBroadcast');
        const {popupId, frameId: parentFrameId} = await rootPopupInformationPromise;

        const popup = new PopupProxy(popupId, 0, null, parentFrameId, this._frameOffsetForwarder);
        popup.on('offsetNotFound', () => {
            this._allowRootFramePopupProxy = false;
            this._updatePopup();
        });
        await popup.prepare();

        return popup;
    }

    _ignoreElements() {
        return this._popup === null || this._popup.isProxy() ? [] : [this._popup.getFrame()];
    }

    _ignorePoint(x, y) {
        return this._popup !== null && this._popup.containsPoint(x, y);
    }

    async _search(textSource, cause) {
        await this._updatePendingOptions();

        let results = null;

        try {
            if (textSource !== null) {
                const optionsContext = await this.getOptionsContext();
                results = (
                    await this._findTerms(textSource, optionsContext) ||
                    await this._findKanji(textSource, optionsContext)
                );
                if (results !== null) {
                    const focus = (cause === 'mouse');
                    this._showContent(textSource, focus, results.definitions, results.type, optionsContext);
                }
            }
        } catch (e) {
            if (this._orphaned) {
                if (textSource !== null && this._options.scanning.modifier !== 'none') {
                    this._showPopupContent(textSource, await this.getOptionsContext(), 'orphaned');
                }
            } else {
                yomichan.logError(e);
            }
        } finally {
            if (results === null && this._options.scanning.autoHideResults) {
                this._textScanner.clearSelection(false);
            }
        }

        return results;
    }

    async _findTerms(textSource, optionsContext) {
        const searchText = this._textScanner.getTextSourceContent(textSource, this._options.scanning.length);
        if (searchText.length === 0) { return null; }

        const {definitions, length} = await api.termsFind(searchText, {}, optionsContext);
        if (definitions.length === 0) { return null; }

        textSource.setEndOffset(length);

        return {definitions, type: 'terms'};
    }

    async _findKanji(textSource, optionsContext) {
        const searchText = this._textScanner.getTextSourceContent(textSource, 1);
        if (searchText.length === 0) { return null; }

        const definitions = await api.kanjiFind(searchText, optionsContext);
        if (definitions.length === 0) { return null; }

        textSource.setEndOffset(1);

        return {definitions, type: 'kanji'};
    }

    _showContent(textSource, focus, definitions, type, optionsContext) {
        const {url} = optionsContext;
        const sentence = docSentenceExtract(textSource, this._options.anki.sentenceExt);
        this._showPopupContent(
            textSource,
            optionsContext,
            type,
            {definitions, context: {sentence, url, focus, disableHistory: true}}
        );
    }

    _showPopupContent(textSource, optionsContext, type=null, details=null) {
        const context = {optionsContext, source: this._id};
        this._lastShowPromise = this._popup.showContent(
            textSource.getRect(),
            textSource.getWritingMode(),
            type,
            details,
            context
        );
        return this._lastShowPromise;
    }

    async _updatePendingOptions() {
        if (this._optionsUpdatePending) {
            this._optionsUpdatePending = false;
            await this.updateOptions();
        }
    }

    _updateTextScannerEnabled() {
        const enabled = (
            this._options.general.enable &&
            this._depth <= this._options.scanning.popupNestingMaxDepth &&
            !this._disabledOverride
        );
        this._enabledEventListeners.removeAllEventListeners();
        this._textScanner.setEnabled(enabled);
        if (enabled) {
            this._enabledEventListeners.addEventListener(window, 'message', this._onWindowMessage.bind(this));
        }
    }

    _updateContentScale() {
        const {popupScalingFactor, popupScaleRelativeToPageZoom, popupScaleRelativeToVisualViewport} = this._options.general;
        let contentScale = popupScalingFactor;
        if (popupScaleRelativeToPageZoom) {
            contentScale /= this._pageZoomFactor;
        }
        if (popupScaleRelativeToVisualViewport) {
            const visualViewport = window.visualViewport;
            const visualViewportScale = (visualViewport !== null && typeof visualViewport === 'object' ? visualViewport.scale : 1.0);
            contentScale /= visualViewportScale;
        }
        if (contentScale === this._contentScale) { return; }

        this._contentScale = contentScale;
        if (this._popup !== null) {
            this._popup.setContentScale(this._contentScale);
        }
        this._updatePopupPosition();
    }

    async _updatePopupPosition() {
        const textSource = this._textScanner.getCurrentTextSource();
        if (
            textSource !== null &&
            this._popup !== null &&
            await this._popup.isVisible()
        ) {
            this._showPopupContent(textSource, await this.getOptionsContext());
        }
    }

    _broadcastRootPopupInformation() {
        if (
            this._popup !== null &&
            !this._popup.isProxy() &&
            this._depth === 0 &&
            this._frameId === 0
        ) {
            api.broadcastTab('rootPopupInformation', {
                popupId: this._popup.id,
                frameId: this._frameId
            });
        }
    }

    _broadcastDocumentInformation(uniqueId) {
        api.broadcastTab('documentInformationBroadcast', {
            uniqueId,
            frameId: this._frameId,
            title: document.title
        });
    }
}
