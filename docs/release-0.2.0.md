# dsh-music-on 0.2.0 发布清单

> 本文件是 0.2.0 的发布待办，**不进 npm 包**（`package.json` 的 `files` 用
> `docs/screenshot-*.png` 与 `docs/marketplace-entry.yml` 逐条列举，不整目录收 `docs`）。

## 已完成（本地）

- [x] 版本号 `0.1.3` → `0.2.0`（`package.json` 的 `version` 与 `dsh.version` 两处）
- [x] 构建 `client.js`（314.7 KB）
- [x] 全量单测 537 项全过
- [x] `check-spectrum.mjs` 27 项全过
- [x] `smoke.mjs` 16/16
- [x] `check-bundle.mjs` 全过
- [x] `check-install.mjs` 20 项全过
- [x] 真浏览器探针 `probe-live.py` 全过
- [x] 四张商店截图重拍（频谱特写由真拖放驱动）
- [x] 安装副本同步：24 文件哈希全同
- [x] 提交 `6bb3ebd`
- [x] 标签 `v0.2.0`

## 卡住（网络）

GitHub 系域名 TLS 握手被中断：

- 裸 IP 无 SNI 时正常（`20.205.243.168` → 400、`20.205.243.166` → 301、`140.82.112.5` → 400）
- 带 SNI（`--resolve` 或代理隧道）时一律 `schannel: failed to receive handshake`
- 代理本身可用：example.com 200、registry.npmjs.org 200
- 所以是 SNI 层干扰，不是配置问题

## 网络恢复后执行

```pwsh
cd J:\plugin\dsh-music-on

# 1) 推 main
git -c http.proxy=http://127.0.0.1:7897 push origin main

# 2) 推标签
git -c http.proxy=http://127.0.0.1:7897 push origin v0.2.0

# 3) 打 tarball（资产名故意不带版本号，市场条目用 latest/download/）
npm pack
Rename-Item dsh-music-on-0.2.0.tgz dsh-music-on.tgz

# 4) 建 Release 并上传资产
.\scripts\submit-marketplace.ps1 -Help   # 看现有子命令
```

Release 要点：
- tag：`v0.2.0`
- 标题：`dsh-music-on 0.2.0`
- 资产：`dsh-music-on.tgz`（名字必须不带版本号）
- 正文：见下

## Release 正文（可直接粘贴）

```markdown
频谱彻底重做、七套配色主题、音景功能移除。这一版是破坏性变更。

## 频谱

旧版频谱无论窗口多宽都只占约 286px：柱宽被夹死在 [2,4]、缝夹死在 [1.5,2]，
pitch 上限 6px，48 柱 × 6px 就是物理天花板。现在按剩余宽度反解间距，
每一档宽度都精确铺满容器：

| 容器宽 | 柱宽 | 间距 | 整排 |
| --- | --- | --- | --- |
| 320px | 3.33px | 3.40px | 320.0px |
| 960px | 10.00px | 10.21px | 960.0px |
| 1440px | 15.00px | 15.32px | 1440.0px |

- 柱数上限 96 → 160
- 新增「频谱宽度」设置（20–100%，按 5 对齐）
- 七种画法全部有真实绘制：圆点 / 粗柱 / 方块阵列 / 对称声波 / 折线 / 时域波形 / 关闭
  （`blocks` 与 `mirror` 之前只在选项里存在，没有绘制函数）

## 七套配色主题

鲸鱼蓝白（默认）、极光青紫、薄荷、落日、玫瑰、霓虹、极简灰白。

之前七套主题视觉上完全一样，真因是主题块写成了 `:where([data-dmo-theme='x'])`，
`:where()` 把权重压到 0，而默认令牌块权重是 (0,1,0)，主题块永远输。
改成真选择器后七套各给出不同主色。60+ 处硬编码颜色同步收敛为
`rgba(var(--dmo-rgb), α)` 三元组。

## 移除：内置音景

不是从界面藏起来，是整条链拔除：

- `src/client/presets.js`（871 行音景控制器）
- `src/client/presets-boot.js`
- `src/client/ui/PresetsSection.jsx`
- `src/host/presets-static.js`（静态资源路由）
- `presets/` 整个目录（7 个 CC0 WAV）

宿主 `inject` 从 `['connection','webServer']` 收窄为 `['connection']`，
路由表从三条降到两条。**如果你依赖过白噪音/雨声等预置音景，这一版没有替代品。**

## 修复

- 设置页「收藏 / 历史」的说明文字对比度只有 2.0:1（11.5px 小字落在宿主半透明面板上），
  现在分区自带玻璃底，并加了对比度防回归断言
- 循环模式按钮曾直接显示内码 `all` / `one` / `off`，现在显示「列表循环 / 单曲循环 / 不循环」

## 自检

537 项单测、27 项频谱几何、20 项安装自检、16 项 smoke 全过；
真浏览器探针验证七套主题各给出不同主色、频谱带按 `--dmo-span` 居中且宽度精确。
商店截图现在由真实拖放事件驱动——脚本在页面内合成 24 秒 WAV 交给插件，
跑通即等于验证了「拖入音频即自动播放」。
```

## 投稿到插件市场

仓库创建于 `2026-10-18T15:23:21Z`，满一天门槛早已满足。

```pwsh
cd J:\plugin\dsh-music-on
.\scripts\submit-marketplace.ps1
```

投稿文件：`data/plugins/lilcandi__dsh-music-on.yml`，内容见 `docs\marketplace-entry.yml`。
category 保持 `ui`（不要改成 theme，theme 会被市场塞进主题 Tab）。

## 已知风险

- 本机 `hosts` 把所有 github 域名指向 `127.0.0.1`，任何 GitHub 操作都要 `--resolve` 或走代理
- git push 走代理时 `-c http.proxy=...` 必须放在子命令之前
- npm 未登录，`npm publish` 需要先 `npm login`
