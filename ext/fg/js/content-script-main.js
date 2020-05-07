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

/* global
 * DOM
 * FrameOffsetForwarder
 * Frontend
 * PopupFactory
 * PopupProxy
 * apiBroadcastTab
 * apiForwardLogsToBackend
 * apiOptionsGet
 */

async function createIframePopupProxy(frameOffsetForwarder, setDisabled) {
    const rootPopupInformationPromise = yomichan.getTemporaryListenerResult(
        chrome.runtime.onMessage,
        ({action, params}, {resolve}) => {
            if (action === 'rootPopupInformation') {
                resolve(params);
            }
        }
    );
    apiBroadcastTab('rootPopupRequestInformationBroadcast');
    const {popupId, frameId} = await rootPopupInformationPromise;

    const getFrameOffset = frameOffsetForwarder.getOffset.bind(frameOffsetForwarder);

    const popup = new PopupProxy(popupId, 0, null, frameId, getFrameOffset, setDisabled);
    await popup.prepare();

    return popup;
}

async function getOrCreatePopup(depth) {
    const popupHost = new PopupFactory();
    await popupHost.prepare();

    const popup = popupHost.getOrCreatePopup(null, null, depth);

    return popup;
}

async function createPopupProxy(depth, id, parentFrameId) {
    const popup = new PopupProxy(null, depth + 1, id, parentFrameId);
    await popup.prepare();

    return popup;
}

(async () => {
    apiForwardLogsToBackend();
    await yomichan.prepare();

    const data = window.frontendInitializationData || {};
    const {id, depth=0, parentFrameId, url=window.location.href, proxy=false, isSearchPage=false} = data;

    const isIframe = !proxy && (window !== window.parent);

    const popups = {
        iframe: null,
        proxy: null,
        normal: null
    };

    let frontend = null;
    let frontendPreparePromise = null;
    let frameOffsetForwarder = null;

    let iframePopupsInRootFrameAvailable = true;

    const disableIframePopupsInRootFrame = () => {
        iframePopupsInRootFrameAvailable = false;
        applyOptions();
    };

    let urlUpdatedAt = 0;
    let proxyHostUrlCached = url;
    const getProxyHostUrl = async () => {
        const now = Date.now();
        if (popups.proxy !== null && now - urlUpdatedAt > 500) {
            proxyHostUrlCached = await popups.proxy.getHostUrl();
            urlUpdatedAt = now;
        }
        return proxyHostUrlCached;
    };

    const applyOptions = async () => {
        const optionsContext = {
            depth: isSearchPage ? 0 : depth,
            url: proxy ? await getProxyHostUrl() : window.location.href
        };
        const options = await apiOptionsGet(optionsContext);

        if (!proxy && frameOffsetForwarder === null) {
            frameOffsetForwarder = new FrameOffsetForwarder();
            frameOffsetForwarder.start();
        }

        let popup;
        if (isIframe && options.general.showIframePopupsInRootFrame && DOM.getFullscreenElement() === null && iframePopupsInRootFrameAvailable) {
            popup = popups.iframe || await createIframePopupProxy(frameOffsetForwarder, disableIframePopupsInRootFrame);
            popups.iframe = popup;
        } else if (proxy) {
            popup = popups.proxy || await createPopupProxy(depth, id, parentFrameId);
            popups.proxy = popup;
        } else {
            popup = popups.normal || await getOrCreatePopup(depth);
            popups.normal = popup;
        }

        if (frontend === null) {
            const getUrl = proxy ? getProxyHostUrl : null;
            frontend = new Frontend(popup, getUrl);
            frontendPreparePromise = frontend.prepare();
            await frontendPreparePromise;
        } else {
            await frontendPreparePromise;
            if (isSearchPage) {
                const disabled = !options.scanning.enableOnSearchPage;
                frontend.setDisabledOverride(disabled);
            }

            if (isIframe) {
                await frontend.setPopup(popup);
            }
        }
    };

    yomichan.on('optionsUpdated', applyOptions);
    window.addEventListener('fullscreenchange', applyOptions, false);

    await applyOptions();
})();
