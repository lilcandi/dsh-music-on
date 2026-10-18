# presets —— 预置音景（三层音源）

清单：`manifest.json`　客户端：`../src/client/presets.js`　生成脚本：`generate-seeds.mjs`

## 目录内容

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | 14 条预置清单，每条带 `source` 区分音源层 |
| `generate-seeds.mjs` | 离线合成 7 条 WAV 种子，并把真实 `sha256`/`sizeBytes`/`duration` 写回清单 |
| `verify-seeds.mjs` | 只读校验：重算 sha256、核对 WAV 文件头、时长、loop 区间、接缝跳变 |
| `selftest.mjs` | 客户端冒烟测试：用桩件在 Node 里跑通 presets.js 的完整决策链 |
| `*.wav` | 7 个已生成的种子音频（每个 482.4KB） |

## 三层音源

| source | 含义 | 出声 | 频谱 | 离线 |
| --- | --- | --- | --- | --- |
| `embedded` | 本插件离线合成的 WAV 种子 | 是 | **是**（进 AudioContext） | 是 |
| `bilibili-embed` | B站公开播放器 iframe | 是 | 否（音频不进入 AudioContext） | 否 |
| `platform-link` | 网易云/QQ音乐歌单页跳转 | 否（只在外部平台播放） | 否 | 否 |

未配置的 `bilibili-embed` 条目 `bvid` 留空、`status: "needs-config"`；`platform-link` 的 `pageUrl` 同样留空。已配置的条目一律使用**主机实测过的真实 BV 号**（`jazz-lofi-mix-bili` = `BV1Lyw7zPEeo`，2026-10-18 经 B站公开 API 验证，`videoMeta` 里存了 title/owner/cid/pubdate 原始值）。清单里没有任何编造的 BV 号或歌单 id——编出来的在别人机器上都是死链。

`jazz-lofi-mix-bili` 同时命中 `jazz` / `lofi` / `cafe` 三类，做法是**一条主条目 + tags**（`["lofi","cafe","bilibili","lofi-girl","jazz"]`），不复制成三条重复条目；`lofi` 与 `cafe` 两个分类下仍保留本插件自己的 embedded 版本。`license` 写「版权归原视频作者所有（嵌入播放，不转存）」，**不是** CC0/CC-BY。

## 重新生成种子音频

```powershell
cd J:\plugin\dsh-music-on
node presets\generate-seeds.mjs
```

脚本行为：

1. 只对 `source === "embedded"` 且 `status === "ready"` 的条目合成音频，其余条目清空 `sha256`/`sizeBytes`/`file`（绝不伪造）。
2. 输出 44.1kHz / 16bit / 单声道 PCM WAV，**5.600s 循环**（482.4KB，压在 500KB 上限内）。
3. 用真实字节重算 sha256 写回 `manifest.json`，同时回填 `sizeBytes`、`duration`、`loopStart=0`、`loopEnd=5.6`、`file`、`url`。
4. 体积超过 500KB 直接抛错退出，不静默放行。

> 为什么是 WAV 而不是 ogg/m4a：Node 内置模块没有音频编码器（无 Vorbis/AAC 编码），装 npm 依赖被明确禁止。WAV PCM 是唯一零依赖可产出的格式，代价是体积。5.6s × 44100 × 2 字节 = 493,964 字节，稳定在 500KB 线内。

## 七条音色的合成方式（全部原创，无采样、无第三方素材）

| id | 配方 |
| --- | --- |
| `white-noise` | 均匀白噪声（固定种子 xorshift64*），去直流 |
| `rain` | 双级低通白噪（2.6k/5.2k）做雨幕 + 带通 1.4–4.0kHz 的随机雨滴瞬态（衰减 25–70ms） |
| `cafe` | 两级低通粉噪底 + 1.9kHz 人声共振带随机音节包络 + 稀疏杯碟叮声（2.6–4.0kHz 双正弦衰减） |
| `cafe-night` | 220Hz 房间嗡鸣（双级低通）+ 1.2kHz 远处稀疏人声（密度仅 cafe 的 1/3、单段更长更轻）+ 2.4kHz 封顶的远处钢琴 Am9–Fmaj9 残响（6 阶谐波、偶次倾斜 0.42、无槌击、decay 1.2s）+ 一把随机杯碟 + 全轨 2.2kHz 低通压暗 |
| `beat` | 80BPM：kick 正弦 110→48Hz 扫频、snare 带通噪声 1.5kHz、hihat 两级高通噪声 |
| `jazz` | Dm9–G13–Cmaj9–A7b9，三角波加性合成（8 阶谐波、奇次加权）+ 每音 ±7 cent detune + 走路贝斯，85.714BPM 使 2 小节精确 = 5.6s |
| `lofi` | Fmaj9–Em7–Dm9–Cmaj7，正弦谐波 + ±14 cent detune、低通砍到 2.4kHz、黑胶嘶声 + 极轻 kick/snare，85.714BPM 精确 5.6s |

## 无缝循环怎么保证

1. **环形叠加**：`addWrapped()` 把超尾部的样本回绕到开头，鼓点/雨滴跨接缝时不丢能量。
2. **整周期调参**：jazz/lofi 的 BPM 反算成 85.714… 使小节长度在 5.6s 内整除，避免循环点落在半小节上。
3. **首尾交叉淡化 + 接缝硬对齐**：`makeSeamless()` 先对头部 0.25s 做环回互补加权（`out[i] = x[i]*w + x[n-fade+i]*(1-w)`），再用 `ramp = fade/4` 的斜坡把最后几个样本收拢到 `out[0]`、把最开始几个样本从 `x[n-1]` 拉起，使「末样本 → 首样本」这一步的跳变等于正常相邻样本差。
4. **人声/噪声段索引必须双重回绕**：`out[(start+i)%n] += voiceBand[(start+i)%n] * ...`。只回绕目标索引会让源索引越界读出 `undefined`，乘进浮点数组立刻变 NaN，再被 `lowpass1` 的 IIR 状态扩散到全轨——这是实际踩到的坑，`cafe-night` 曾因此整轨报废。
5. `verify-seeds.mjs` 会核对「末样本 → 首样本的跳变」与内部相邻样本平均跳变之比，阈值 8×；当前七条全部为 `0.0000`。

## 校验命令

```powershell
node presets\verify-seeds.mjs   # 音频与清单一致性（只读）
node presets\selftest.mjs       # 客户端逻辑冒烟（只读）
node --check src\client\presets.js
```

`selftest.mjs` 覆盖 37 项断言：settings 容错（含别名 `cacheDir`/`cacheLimit`/`maxCacheMb`、async settings、抛错 settings）、清单解析与伪造 ready 降级、bvid 格式校验、下载/缓存命中、sha256 不匹配时报错且不落缓存、三层分流决策、不可用原因上报、缓存容量裁剪。

## 客户端用法（`src/client/presets.js`）

```js
import { createPresets } from './client/presets.js';

const presets = await createPresets({
  settings,            // 宿主 settings 对象 / async 函数 / Promise，读不到自动用默认值
  cacheStore,          // 可选：宿主缓存后端（get/set/delete/list/clear）；不传则用 IndexedDB，再退内存
  baseUrl: './',       // 清单与 WAV 的相对根
  onStateChange: (s) => render(s),
});

presets.onChange((e) => {
  if (e.type === 'error') showUnavailable(e.id, e.error.message);
});

presets.categories();          // 六类入口 + 每类 ready/needsConfig/unavailable 计数
await presets.prepare('rain'); // 下载 + sha256/sizeBytes 校验 + 落缓存
await presets.play('rain');    // → { mode: 'audio', spectrum: true }
presets.unavailableReport();   // 每条不可用条目的 reason + hint
await presets.cacheStats();    // { backend, storageDir, limitMb, entries, sizeMb }
```

`play()` 按 `source` 分流返回值：

- `embedded` → `{ mode: 'audio', spectrum: true }`，已通过 `AudioBufferSourceNode` 的 `loop/loopStart/loopEnd` 无缝循环。
- `bilibili-embed` → `{ mode: 'iframe', embedUrl, spectrum: false }`，UI 用 `embedUrl` 挂 iframe，并**必须标注「频谱不可用」**。
- `platform-link` → `{ mode: 'external', url, spectrum: false }`，UI 只渲染「打开原平台」按钮。

未配置 / 不可用的条目一律抛错并附中文原因，同时通过 `onChange({type:'error'})` 广播，不存在静默失败。

### settings 字段容错

`storageDir` / `cacheDir` / `presetsDir`，`cacheLimitMb` / `cacheLimit` / `maxCacheMb`，`fetchTimeoutMs` / `downloadTimeoutMs`，`hostCache` / `cacheMode`。任一缺失或非法（负数、非数字、空串）都退回默认值：`dsh-music-on/presets-cache` / `64`MB / `30000`ms。settings 是 undefined、Promise、async 函数、甚至抛错都能正常初始化。

## 已知限制

- `sha256Hex()` 依赖 `crypto.subtle`，只在安全上下文（https 或 localhost）可用。非安全上下文会明确抛错，不会跳过校验放行。
- 缓存后端未注入时用 IndexedDB；IndexedDB 不可用（如受限 WebView）会退化成内存缓存，当次会话有效、刷新即失效——`cacheStats().backend` 会显示 `memory`，UI 可据此提示。
- 真实出声与 iframe 渲染无法在 Node 内验证，`selftest.mjs` 只验证到解码前一步（已断言「缺 AudioContext」这一预期错误），浏览器端需要人工点一次确认。
