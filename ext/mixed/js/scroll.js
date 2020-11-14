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


class WindowScroll {
    constructor() {
        this._animationRequestId = null;
        this._animationStartTime = 0;
        this._animationStartX = 0;
        this._animationStartY = 0;
        this._animationEndTime = 0;
        this._animationEndX = 0;
        this._animationEndY = 0;
        this._requestAnimationFrameCallback = this._onAnimationFrame.bind(this);
    }

    toY(y) {
        this.to(this.x, y);
    }

    toX(x) {
        this.to(x, this.y);
    }

    to(x, y) {
        this.stop();
        window.scroll(x, y);
    }

    animate(x, y, time) {
        this._animationStartX = this.x;
        this._animationStartY = this.y;
        this._animationStartTime = window.performance.now();
        this._animationEndX = x;
        this._animationEndY = y;
        this._animationEndTime = this._animationStartTime + time;
        this._animationRequestId = window.requestAnimationFrame(this._requestAnimationFrameCallback);
    }

    stop() {
        if (this._animationRequestId === null) {
            return;
        }

        window.cancelAnimationFrame(this._animationRequestId);
        this._animationRequestId = null;
    }

    _onAnimationFrame(time) {
        if (time >= this._animationEndTime) {
            window.scroll(this._animationEndX, this._animationEndY);
            this._animationRequestId = null;
            return;
        }

        const t = WindowScroll.easeInOutCubic((time - this._animationStartTime) / (this._animationEndTime - this._animationStartTime));
        window.scroll(
            WindowScroll.lerp(this._animationStartX, this._animationEndX, t),
            WindowScroll.lerp(this._animationStartY, this._animationEndY, t)
        );

        this._animationRequestId = window.requestAnimationFrame(this._requestAnimationFrameCallback);
    }

    get x() {
        return window.scrollX || window.pageXOffset;
    }

    get y() {
        return window.scrollY || window.pageYOffset;
    }

    static easeInOutCubic(t) {
        if (t < 0.5) {
            return (4.0 * t * t * t);
        } else {
            t = 1.0 - t;
            return 1.0 - (4.0 * t * t * t);
        }
    }

    static lerp(start, end, percent) {
        return (end - start) * percent + start;
    }
}
