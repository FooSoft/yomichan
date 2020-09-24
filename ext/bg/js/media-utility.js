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

/**
 * MediaUtility is a class containing helper methods related to media processing.
 */
class MediaUtility {
    /**
     * Gets the file extension of a file path. URL search queries and hash
     * fragments are not handled.
     * @param path The path to the file.
     * @returns The file extension, including the '.', or an empty string
     *   if there is no file extension.
     */
    getFileNameExtension(path) {
        const match = /\.[^./\\]*$/.exec(path);
        return match !== null ? match[0] : '';
    }

    /**
     * Gets an image file's media type using a file path.
     * @param path The path to the file.
     * @returns The media type string if it can be determined from the file path,
     *   otherwise null.
     */
    getImageMediaTypeFromFileName(path) {
        switch (this.getFileNameExtension(path).toLowerCase()) {
            case '.apng':
                return 'image/apng';
            case '.bmp':
                return 'image/bmp';
            case '.gif':
                return 'image/gif';
            case '.ico':
            case '.cur':
                return 'image/x-icon';
            case '.jpg':
            case '.jpeg':
            case '.jfif':
            case '.pjpeg':
            case '.pjp':
                return 'image/jpeg';
            case '.png':
                return 'image/png';
            case '.svg':
                return 'image/svg+xml';
            case '.tif':
            case '.tiff':
                return 'image/tiff';
            case '.webp':
                return 'image/webp';
            default:
                return null;
        }
    }
}
