/**
 * dsh-music-on 宿主半边入口（ESM，零构建）。
 *
 * 真正的实现全在 src/index.js（+ src/host/*），这里只做 re-export，
 * 保证 `main`、`exports["."]` 指向的语义是同一份。
 *
 * 宿主为什么要单独有半边：
 *   浏览器不能读磁盘、不能跑 ffmpeg、不能长任务。所有「重」的部分
 *   （切片、重采样、预设库、后台生成）都在这里，客户端只拿 URL。
 */
export { name, inject, apply, default, routes, __test } from './src/index.js';
