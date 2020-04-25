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


class FrontendApiSender {
    constructor() {
        this.senderId = yomichan.generateId(16);
        this.ackTimeout = 3000; // 3 seconds
        this.responseTimeout = 10000; // 10 seconds
        this.callbacks = new Map();
        this.disconnected = false;
        this.nextId = 0;

        this.port = null;
    }

    invoke(action, params, target) {
        if (this.disconnected) {
            // attempt to reconnect the next time
            this.disconnected = false;
            return Promise.reject(new Error('Disconnected'));
        }

        if (this.port === null) {
            this._createPort();
        }

        const id = `${this.nextId}`;
        ++this.nextId;

        return new Promise((resolve, reject) => {
            const info = {id, resolve, reject, ack: false, timer: null};
            this.callbacks.set(id, info);
            info.timer = setTimeout(() => this._onError(id, 'Timeout (ack)'), this.ackTimeout);

            this.port.postMessage({id, action, params, target, senderId: this.senderId});
        });
    }

    _createPort() {
        this.port = chrome.runtime.connect(null, {name: 'backend-api-forwarder'});
        this.port.onDisconnect.addListener(this._onDisconnect.bind(this));
        this.port.onMessage.addListener(this._onMessage.bind(this));
    }

    _onMessage({type, id, data, senderId}) {
        if (senderId !== this.senderId) { return; }
        switch (type) {
            case 'ack':
                this._onAck(id);
                break;
            case 'result':
                this._onResult(id, data);
                break;
        }
    }

    _onDisconnect() {
        this.disconnected = true;
        this.port = null;

        for (const id of this.callbacks.keys()) {
            this._onError(id, 'Disconnected');
        }
    }

    _onAck(id) {
        const info = this.callbacks.get(id);
        if (typeof info === 'undefined') {
            console.warn(`ID ${id} not found for ack`);
            return;
        }

        if (info.ack) {
            console.warn(`Request ${id} already ack'd`);
            return;
        }

        info.ack = true;
        clearTimeout(info.timer);
        info.timer = setTimeout(() => this._onError(id, 'Timeout (response)'), this.responseTimeout);
    }

    _onResult(id, data) {
        const info = this.callbacks.get(id);
        if (typeof info === 'undefined') {
            console.warn(`ID ${id} not found`);
            return;
        }

        if (!info.ack) {
            console.warn(`Request ${id} not ack'd`);
            return;
        }

        this.callbacks.delete(id);
        clearTimeout(info.timer);
        info.timer = null;

        if (typeof data.error !== 'undefined') {
            info.reject(jsonToError(data.error));
        } else {
            info.resolve(data.result);
        }
    }

    _onError(id, reason) {
        const info = this.callbacks.get(id);
        if (typeof info === 'undefined') { return; }
        this.callbacks.delete(id);
        info.timer = null;
        info.reject(new Error(reason));
    }
}
