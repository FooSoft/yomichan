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

const yomichan = (() => {
    class Yomichan extends EventDispatcher {
        constructor() {
            super();

            this._isBackendPreparedPromise = this.getTemporaryListenerResult(
                chrome.runtime.onMessage,
                ({action}, {resolve}) => {
                    if (action === 'backendPrepared') {
                        resolve();
                    }
                }
            );

            this._messageHandlers = new Map([
                ['getUrl',          this._onMessageGetUrl.bind(this)],
                ['optionsUpdated',  this._onMessageOptionsUpdated.bind(this)],
                ['zoomChanged',     this._onMessageZoomChanged.bind(this)]
            ]);

            chrome.runtime.onMessage.addListener(this._onMessage.bind(this));
        }

        // Public

        ready() {
            chrome.runtime.sendMessage({action: 'yomichanCoreReady'});
            return this._isBackendPreparedPromise;
        }

        generateId(length) {
            const array = new Uint8Array(length);
            crypto.getRandomValues(array);
            let id = '';
            for (const value of array) {
                id += value.toString(16).padStart(2, '0');
            }
            return id;
        }

        triggerOrphaned(error) {
            this.trigger('orphaned', {error});
        }

        isExtensionUrl(url) {
            try {
                const urlBase = chrome.runtime.getURL('/');
                return url.substring(0, urlBase.length) === urlBase;
            } catch (e) {
                return false;
            }
        }

        getTemporaryListenerResult(eventHandler, userCallback, timeout=null) {
            if (!(
                typeof eventHandler.addListener === 'function' &&
                typeof eventHandler.removeListener === 'function'
            )) {
                throw new Error('Event handler type not supported');
            }

            return new Promise((resolve, reject) => {
                const runtimeMessageCallback = ({action, params}, sender, sendResponse) => {
                    let timeoutId = null;
                    if (timeout !== null) {
                        timeoutId = setTimeout(() => {
                            timeoutId = null;
                            eventHandler.removeListener(runtimeMessageCallback);
                            reject(new Error(`Listener timed out in ${timeout} ms`));
                        }, timeout);
                    }

                    const cleanupResolve = (value) => {
                        if (timeoutId !== null) {
                            clearTimeout(timeoutId);
                            timeoutId = null;
                        }
                        eventHandler.removeListener(runtimeMessageCallback);
                        sendResponse();
                        resolve(value);
                    };

                    userCallback({action, params}, {resolve: cleanupResolve, sender});
                };

                eventHandler.addListener(runtimeMessageCallback);
            });
        }

        logWarning(error) {
            this.log(error, 'warn');
        }

        logError(error) {
            this.log(error, 'error');
        }

        log(error, level, context=null) {
            if (!isObject(context)) {
                context = this._getLogContext();
            }

            let errorString;
            try {
                errorString = error.toString();
                if (/^\[object \w+\]$/.test(errorString)) {
                    errorString = JSON.stringify(error);
                }
            } catch (e) {
                errorString = `${error}`;
            }

            let errorStack;
            try {
                errorStack = (typeof error.stack === 'string' ? error.stack.trimRight() : '');
            } catch (e) {
                errorStack = '';
            }

            let errorData;
            try {
                errorData = error.data;
            } catch (e) {
                // NOP
            }

            if (errorStack.startsWith(errorString)) {
                errorString = errorStack;
            } else if (errorStack.length > 0) {
                errorString += `\n${errorStack}`;
            }

            const manifest = chrome.runtime.getManifest();
            let message = `${manifest.name} v${manifest.version} has encountered a problem.`;
            message += `\nOriginating URL: ${context.url}\n`;
            message += errorString;
            if (typeof errorData !== 'undefined') {
                message += `\nData: ${JSON.stringify(errorData, null, 4)}`;
            }
            message += '\n\nIssues can be reported at https://github.com/FooSoft/yomichan/issues';

            switch (level) {
                case 'info': console.info(message); break;
                case 'debug': console.debug(message); break;
                case 'warn': console.warn(message); break;
                case 'error': console.error(message); break;
                default: console.log(message); break;
            }

            this.trigger('log', {error, level, context});
        }

        // Private

        _getUrl() {
            return (typeof window === 'object' && window !== null ? window.location.href : '');
        }

        _getLogContext() {
            return {url: this._getUrl()};
        }

        _onMessage({action, params}, sender, callback) {
            const handler = this._messageHandlers.get(action);
            if (typeof handler !== 'function') { return false; }

            const result = handler(params, sender);
            callback(result);
            return false;
        }

        _onMessageGetUrl() {
            return {url: this._getUrl()};
        }

        _onMessageOptionsUpdated({source}) {
            this.trigger('optionsUpdated', {source});
        }

        _onMessageZoomChanged({oldZoomFactor, newZoomFactor}) {
            this.trigger('zoomChanged', {oldZoomFactor, newZoomFactor});
        }
    }

    return new Yomichan();
})();
