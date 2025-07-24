// srt-player - play srt file in browser.
// Copyright (C) 2024-2025  Yu Hongbo, CNOCTAVE

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global.SrtPlayer = factory());
}(this, (function () {
    'use strict';

    /**
     * SRT字幕播放器类
     * @class
     */
    class SrtPlayer {
        /**
         * 创建SrtPlayer实例
         * @static
         * @param {string} srtText - SRT格式的字幕文本
         * @param {string} [containerId='srt-container'] - 字幕容器的ID
         * @returns {SrtPlayer} 新的SrtPlayer实例
         */
        static init(srtText, containerId = 'srt-container') {
            return new SrtPlayer(srtText, containerId);
        }

        constructor(srtText, containerId) {
            this.srtText = srtText;
            this.containerId = containerId;
            this.isPlaying = false;
            this.animationFrameId = null;
            this.startTime = 0;
            this._parseSrt();
            this._createSubtitlesDOM();
        }

        _parseSrt() {
            // 解析SRT字幕，兼容多种换行和空行分割
            // 先对每行做trim再统一换行符
            let srt = this.srtText
                .split(/\r?\n|\r/)
                .map(line => line.trim())
                .join('\n');
            // 用两个及以上的换行分割为块
            const srtBlocks = srt.split(/\n{2,}/);
            this.lines = [];
            for (const block of srtBlocks) {
                const lines = block.trim().split(/\n/).filter(l => l.trim() !== '');
                if (lines.length < 2) continue;
                // 检查时间行位置
                let timeIdx = 1;
                if (!/^\d+$/.test(lines[0])) timeIdx = 0;
                const timeLine = lines[timeIdx];
                const timeMatch = timeLine && timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
                if (!timeMatch) continue;
                const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
                const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
                // 内容行可能有多行
                const textLines = lines.slice(timeIdx + 1);
                const text = textLines.join('\n').trim();
                this.lines.push({ start, end, text });
            }
        }

        /**
         * 开始播放字幕
         */
        play() {
            if (!this.isPlaying) {
                this.isPlaying = true;
                this.startTime = performance.now();
                this._updateSubtitlesPosition();
            }
        }

        /**
         * 暂停播放
         */
        pause() {
            this.isPlaying = false;
            this.pausedTime = (performance.now() - this.startTime) / 1000;
            cancelAnimationFrame(this.animationFrameId);
        }

        /**
         * 从暂停处继续播放
         */
        resume() {
            if (this.pausedTime !== undefined) {
                this.isPlaying = true;
                this.startTime = performance.now() - (this.pausedTime * 1000);
                this._updateSubtitlesPosition();
            }
        }

        _createSubtitlesDOM() {
            const container = document.createElement('div');
            container.id = this.containerId;
            container.style.cssText = `
                position: relative;
                min-height: 2em;
                overflow: hidden;
                margin: 20px 0;
            `;

            const subtitlesWrapper = document.createElement('div');
            subtitlesWrapper.id = `${this.containerId}-wrapper`;
            subtitlesWrapper.style.cssText = `
                position: absolute;
                width: 100%;
                transition: transform 0.1s linear;
            `;

            this.lines.forEach(line => {
                const lineDiv = document.createElement('div');
                lineDiv.classList.add('srt-player-text');
                lineDiv.innerHTML = line.text;
                lineDiv.style.cssText = `
                    padding: 5px 20px;
                    text-align: center;
                `;
                subtitlesWrapper.appendChild(lineDiv);
            });

            container.appendChild(subtitlesWrapper);
            document.body.appendChild(container);
            this.subtitlesWrapper = subtitlesWrapper;
        }

        _updateSubtitlesPosition() {
            const elapsed = (performance.now() - this.startTime) / 1000;
            const currentLine = this._getCurrentLine(elapsed);

            if (currentLine) {
                const lineIndex = this.lines.findIndex(line => line === currentLine);
                const lineHeight = this.subtitlesWrapper.children[0]?.offsetHeight || 30;
                const offset = lineIndex * lineHeight;

                this.subtitlesWrapper.style.transform = `translateY(${-offset}px)`;

                // 更新所有字幕行的class
                Array.from(this.subtitlesWrapper.children).forEach((div, index) => {
                    if (this.lines[index] === currentLine) {
                        div.classList.add('srt-player-highlight');
                        div.classList.remove('srt-player-text');
                    } else {
                        div.classList.add('srt-player-text');
                        div.classList.remove('srt-player-highlight');
                    }
                });

                if (typeof this.onSubtitleChange === 'function') {
                    this.onSubtitleChange(currentLine.text, currentLine);
                }
            }

            this.animationFrameId = requestAnimationFrame(() => this._updateSubtitlesPosition());
        }

        /**
         * 获取当前时间对应的字幕行
         * @private
         * @param {number} currentTime - 当前时间(秒)
         * @returns {Object|null} 当前字幕行对象，包含start、end和text属性
         */
        _getCurrentLine(currentTime) {
            for (let i = 0; i < this.lines.length; i++) {
                if (this.lines[i].start > currentTime) {
                    return this.lines[i - 1] || null;
                }
            }
            return this.lines[this.lines.length - 1] || null;
        }

        /**
         * 销毁播放器实例，移除所有创建的DOM元素
         */
        destroy() {
            cancelAnimationFrame(this.animationFrameId);
            const container = document.getElementById(this.containerId);
            if (container) {
                container.remove();
            }
            this.isPlaying = false;
            this.animationFrameId = null;
            this.startTime = 0;
            this.subtitlesWrapper = null;
        }

        /**
         * 设置当前播放时间（秒级精度）
         * @param {number} seconds - 要设置的播放时间（秒）
         */
        setTimeSecond(seconds) {
            this.startTime = performance.now() - (seconds * 1000);
            this.pausedTime = (performance.now() - this.startTime) / 1000;
            if (this.isPlaying) {
                cancelAnimationFrame(this.animationFrameId);
                this._updateSubtitlesPosition();
            } else {
                this._updateSubtitlesPosition();
                cancelAnimationFrame(this.animationFrameId);
            }
        }

        /**
         * 设置当前播放时间（毫秒级精度）
         * @param {number} milliseconds - 要设置的播放时间（毫秒）
         */
        setTimeMillisecond(milliseconds) {
            this.startTime = performance.now() - milliseconds;
            this.pausedTime = (performance.now() - this.startTime) / 1000;
            if (this.isPlaying) {
                cancelAnimationFrame(this.animationFrameId);
                this._updateSubtitlesPosition();
            } else {
                this._updateSubtitlesPosition();
                cancelAnimationFrame(this.animationFrameId);
            }
        }

        /**
         * 从头开始重新播放字幕
         */
        replay() {
            this.pause();
            this.play();
        }
    }

    return SrtPlayer;
})));
