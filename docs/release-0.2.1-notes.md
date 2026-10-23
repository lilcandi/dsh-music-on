## 0.2.1

一次只改文案的补丁版：把**随包分发**的商店条目对齐到审核后的措辞。代码路径未动。

### 为什么会有这一版

0.2.0 的 tag 打在 `6551308` 上，而 `docs/marketplace-entry.yml` 的措辞修正发生在 tag **之后**（远端 `e2a4a66`，本地 `968f61c`）。结果是：插件市场里展示的条目已经是改好的版本，但 `npm pack` 出来的包里那个文件仍写着三句代码做不到的话 ——

- 「本地文件在重开后可以恢复」：`ShellDock.js` 把本地曲目标成 `missing: true`，`restore()` 的两遍循环都会跳过它。Blob 地址刷新后就是死地址，本地文件从来没有被恢复过。
- 「逐曲封面」未加限定：本地文件不走解析，`sources.js` 不产出 cover，落的是黑胶占位。现在写明「仅解析出的链接曲目」。
- 「整排在任意窗口宽度下精确铺满」偏绝对：`Spectrum.jsx` 在间隙被压到 `DOT_GAP_FLOOR` 以下时会如实略微溢出，这是刻意的（不重叠优先）。现在把这条边界一并写出。

一个包的元数据与它的实际行为不一致，就是 0.2.0 的真缺陷 —— 只是它不在运行时代码里，所以现有 537 项测试一条都不会失败。这一版补上。

### 同时做的

- 版本号 `version` 与 `dsh.version` 两处 0.2.0 → **0.2.1**
- 新增 `docs/release-0.2.1-notes.md` 即本文件（不进 npm 包，`files` 逐条列举）

### 校验

`npm pack` 后解包比对：

- `src/` 下 20 个 `.js`/`.jsx` 与工作区逐字节一致
- `presets/` 不存在
- 包内 `docs/marketplace-entry.yml` 含「半像素」与「本地文件用黑胶占位」，不含「重开」
- `package.json` 两处版本号均为 `0.2.1`

升级：`dsh plugin --profile web add github:lilcandi/dsh-music-on`，或换成新的 tarball 地址（资产名刻意不带版本号，`latest/download/dsh-music-on.tgz` 会一直解析到最新一版）。
