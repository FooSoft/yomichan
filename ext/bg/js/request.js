/*
 * Copyright (C) 2017-2020  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
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


function requestText(url, action, params) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.overrideMimeType('text/plain');
        xhr.addEventListener('load', () => resolve(xhr.responseText));
        xhr.addEventListener('error', () => reject(new Error('Failed to connect')));
        xhr.open(action, url);
        if (params) {
            xhr.send(JSON.stringify(params));
        } else {
            xhr.send();
        }
    });
}

async function requestJson(url, action, params) {
    const responseText = await requestText(url, action, params);
    try {
        return JSON.parse(responseText);
    }
    catch (e) {
        throw new Error('Invalid response');
    }
}
