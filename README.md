# dsh-music-on

DSH Web 界面右下角的音乐台。一枚可拖动的胶囊常驻在那里，点开是播放卡片：拖入本地音频即播、
粘贴 B 站 / 网易云音乐 / QQ 音乐的歌单链接自动解析入队、页面底部跟着一条蓝白频谱，
另有七个内置音景（白噪音、雨声、咖啡馆、深夜酒吧、鼓点、爵士、Lo-Fi）开箱即听。

- **不修改宿主任何文件**：只走宿主公开的扩展点（槽位 / 服务 / 路由）。
- **浏览器半边零转译**：宿主对插件客户端代码是零转译静态投递，所以全部用 `react.createElement`，不许 JSX 语法。
- **诚实降级**：拿不到直链的曲目（会员 / 版权限制）直接跳过，不伪造一个播不了的条目。

## 功能

- **播放**：队列、上一首 / 下一首、进度条拖动、音量旋钮（悬停滚轮可调）、三种循环模式、切歌淡入淡出。
- **拖入本地音频**：文件拖到卡片上即入队播放，支持 mp3 / wav / ogg / m4a / flac / aac / opus / webm。
- **粘贴链接**：B 站视频、网易云歌单 / 单曲、QQ 音乐歌单 / 单曲、直链音频；一次可粘多条，混着也行。
- **频谱**：圆点 / 粗柱 / 折线 / 波形四种画法，可调柱数、增益、光晕、高度、帧率、贴底通栏或嵌在卡片里。
- **封面**：内置曲目读预置封面，平台曲目读该曲自己的专辑封面，B 站曲目读视频封面。
- **设置页**：`设置 → 音乐台`，界面 / 播放 / 频谱 / 网络与缓存 / 收藏与历史五组。
- **收藏与历史**：设置页里两张表，收藏与最近播放的链接可一键回放。

## 安装

```pwsh
# 从 GitHub 装（首次会要求授权构建，按提示在 profile 的 pnpm-workspace.yaml 里加 allowBuilds）
dsh plugin --profile web add github:lilcandi/dsh-music-on
```

装上后刷新浏览器（`Ctrl+F5`）即可，右下角应出现音乐胶囊。

### 从本地路径装

```pwsh
dsh plugin --profile web add file:J:/plugin/dsh-music-on
```

### 手工挂载

1. 编辑 profile 的 `package.json`（例如 `C:\Users\candi\.dsh\profiles\web\package.json`）：

```json
{
  "dependencies": {
    "dsh-music-on": "file:J:/plugin/dsh-music-on"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-music-on"]
    }
  }
}
```

2. 在 profile 目录下执行 `pnpm install`。

> ⚠️ **只写 `cordis.patch.yml` 而不把包名加进 `dsh.profile.bundles`，插件不会被挂载。**
> 这是本机踩过的坑：patch 一个从未被 insert 的 entry 不会让插件启动，日志里连一行报错都没有。

### 验证装载

```pwsh
# 宿主半边是否被 Loader 认到（能看到 index.js 被读走）
Get-Content C:\Users\candi\.dsh\logs\*.log -Tail 50 -ErrorAction SilentlyContinue |
  Select-String 'dsh-music-on'

# 浏览器半边是否被拼进 combo（换掉 rev 也行，看 200 / 内容）
Invoke-WebRequest 'http://127.0.0.1:3080/plugins/??dsh-music-on/client.js&rev=0' |
  Select-Object StatusCode
```

装载成功后，右下角会出现音乐胶囊；设置页左侧导航会多一项「音乐台」。

---

## 加载链路（谁在什么时候读哪个文件）

```
宿主启动
 └─ Loader 读 profile 的 bundles
     ├─ import dsh-music-on            → index.js            (宿主半边, ESM)
     │    └─ src/index.js              提供 /api/dsh-music-on/* 路由
     └─ 扫描 package.json 的 dsh.client
         └─ 服务端 readFileSync(exports["./client"]) → client.js  (browser 半边)
             └─ window.__ModuleLoader__.load({ id, factory })
                 └─ 浏览器首次 require 时执行 factory
                     └─ require('react') → 内联实现（esbuild 已把 src/client/** 全打包进来）
                         └─ apply(ctx)
                             ├─ styles.ensureStyle()          注入 <style data-plugin-css>
                             ├─ registerShellDock()           挂 shell.overlay 槽位（右下角音乐台）
                             ├─ registerSettingsSection()     挂 settings.section 槽位
                             └─ registerTabType()/Seats()     右侧栏标签页形态（保留）
```

关键事实（均已在本机宿主包里核实，非推测）：

| 事实 | 证据位置 |
|---|---|
| `dsh.client` 只接受 `platform` / `inject` / `external` / `immediately` 四个字段，其余键被忽略 | `...\dsh\node_modules\@deepseek-ai\dsh-client-modules\lib\index.js:62`（`parseDshClient`） |
| 客户端 bundle 路径来自 `exports["./client"]`，缺了直接报错 | 同文件 `:172`（`clientExportOf`） |
| 服务端只做 `readFileSync` 后拼 combo，**全程无 esbuild/babel** | 同文件 `:274` / `:631` / `:834`（`PLUGIN_ROUTE` 一线） |
| 浏览器模块表只种 10 个包（react 系 + cordis + zod + react-virtual + 4 个 dsh-client-* ） | `...\dsh-web-frontend\dist\assets\index-*.js` 的 `staticModules`（函数 `SZ`） |
| `require()` 只认平台种子词与已注册工厂，**相对路径不解析** | `...\dsh-client-modules\lib\client.js:833-841` |

> 后果之一：`client.js` 里出现相对 require → `require("…") missed the module table` → 整插件不加载。
> 所以 `src/client/**` 全部经 esbuild 内联进单文件 `client.js`。
>
> 后果之二：真正的 JSX 语法在浏览器里会 SyntaxError → 面板白屏。
> 所以 `src/client/**` 里即使是 `.jsx` 文件也只写 `createElement as h`，**构建期才做转译**。

---

## 目录结构

```
dsh-music-on/
├── package.json            # dsh.bundle / dsh.client / exports 三处是装载的关键
├── index.js                # 宿主半边入口，只做 re-export
├── client.js               # 浏览器半边**构建产物**（__ModuleLoader__ 协议），由 scripts/build-client.mjs 生成
├── cordis.patch.yml        # bundle patch（顶层必须是 YAML **数组**，见下）
├── LICENSE                 # MIT
├── README.md / README.en.md
├── presets/                # 预置音景：manifest.json + 7 个 *.wav（CC0 原创合成）
├── scripts/                # 构建与自检（不进安装位置）
│   ├── build-client.mjs        # esbuild 打 client.js
│   ├── check-install.mjs       # 安装位置 19 项自检
│   ├── check-spectrum.mjs      # 频谱绘制 27 项自检
│   ├── simulate-browser.mjs    # vm 里真跑 client.js，验证槽位注册与首渲染
│   ├── simulate-drag.mjs       # 拖动通道（window 监听）行为验证
│   └── verify-*.mjs            # 实网端到端自检（B站 / 平台直链）
└── src/
    ├── index.js            # 宿主半边入口：建票据单例、挂三条路由
    ├── shared.js           # 跨半边共享常量（PLUGIN_ID / 三条路径 / 槽位 id）
    ├── host/               # 只在 Node 里跑，浏览器拿不到的能力
    │   ├── resolve.js      # 平台链接解析（B站 / 网易云 / QQ / YouTube）
    │   ├── stream.js       # 音频流转发 + 平台票据通道
    │   ├── mediatoken.js   # HMAC 票据签发 / 验签（不透明句柄）
    │   └── presets-static.js  # presets/*.wav 静态资源路由
    └── client/             # 全部内联进 client.js，禁止相对 require
        ├── register.js     # 槽位注册 + React 桥 + 运行时单例
        ├── engine.js       # 播放引擎（AudioContext 单例、队列、双轨音源）
        ├── sources.js      # Track 工厂（url / preset / embed / bilibili / platform）
        ├── linkintake.js   # 粘贴文本 → 分流 → 入队
        ├── library.js      # 收藏与历史的存储层
        ├── parser.js        # 平台链接识别与 id 提取
        ├── settings.js     # 设置 schema / 默认值 / 归一化 / store
        ├── locale.js       # zh / en 字典
        ├── i18n.js         # 安全翻译层（宿主 t 的插值语义补丁）
        ├── styles.js       # 全部 CSS（类名统一 dmo- 前缀）
        ├── presets.js       # 预置清单加载
        └── ui/             # 组件（纯 createElement，无 JSX 语法糖）
            ├── ShellDock.js      # 右下角音乐台（胶囊 / 卡片 / 隐藏三态）
            ├── Spectrum.jsx      # 频谱动画（dots / bars / line / wave）
            ├── Settings.jsx      # 设置页分区
            ├── LibrarySection.jsx # 设置页里的收藏 / 历史表
            ├── PlayerPanel.jsx   # 右侧栏标签页形态（保留）
            └── PresetsSection.jsx
```

---

## 三条 HTTP 路由与平台票据通道

| 路径 | 挂法 | 存在理由 |
| --- | --- | --- |
| `/api/dsh-music-on/resolve` | `connection.fetch.register` | 浏览器直连 B站 / 网易云 / QQ 必被同源策略与 Referer 校验拦下，必须宿主代取 |
| `/api/dsh-music-on/stream` | `connection.fetch.register` | 让外部音频能进 `AudioContext`，从而拿到真频谱 |
| `/api/dsh-music-on/presets/` | `webServer.register({kind:'prefix'})` | 静态 WAV；需要自己写 `ServerResponse` 以支持 `Range` |

### 网易云 / QQ 音乐：为什么不透明票据

这两个平台的 CDN（`music.126.net` / `tc.qq.com`）**不在 B 站 CDN 白名单里**。若让客户端把解析出来的明文直链交给 `stream?src=…`，那条路由立刻退化成开放代理 —— 任何人都能拿它当跳板。

所以走票据：宿主解析出直链后，用 HMAC 签发一个不透明句柄（`/api/dsh-music-on/stream?mt=<token>`），客户端**永远拿不到真实直链，也无法伪造 URL**。票据里只带 `{url, mime, platform, id, title, pageUrl, 签发时间, 过期时间}`。

- 实现：`src/host/mediatoken.js`。形态 `<base64url(payload)>.<base64url(hmac)>`，**字符集不含 `%`** —— 硬要求，因为 stream 路由拒绝任何百分号编码。
- 域名白名单分成两张表：`ALLOWED_CDN_DOMAINS`（B站，供 `src=` 通道）与 `PLATFORM_CDN_DOMAINS`（平台，**只供 token 通道**）。合并它们 = `src=` 变开放代理。
- `verify()` 先比签名再解 JSON，用 `timingSafeEqual`，**永不抛错**。
- TTL 10 分钟；宿主重启即换随机密钥 → 旧票据全失效 → 客户端重新解析（有意为之）。
- 拿不到直链的曲目（网易云 VIP / QQ 版权限制）**仍然入队**，带 `unavailableReason`，队列里标「无直链」、诊断行说明原因，并可跳原平台。绝不伪造一个 url 让它假装能播。

### 每批上限必须两端相等

`MAX_STREAM_TRACKS`（宿主，`src/host/resolve.js`）= `MAX_PLATFORM_TRACKS`（客户端，`src/client/linkintake.js`）= **60**。

这不是随手取的数，是两边必须对齐的**耦合常量**：

- 宿主只给前 60 首取直链并签票据。客户端截得比 60 小，等于把已签好的票据白扔（能播的曲目没进队列）；截得比 60 大也没意义，多出来的必然 `streamOnly`。
- 两者由 `test/host-route.test.mjs` 的「宿主与客户端的每批上限必须相等」一条断言锁死。

### 网易云歌单必须按 trackIds 补齐

`api/v6/playlist/detail` 返回的 `playlist.tracks` **只内联前 10 首**，而 `trackCount` 与 `trackIds` 是完整的。直接吃 `tracks` 的后果是：73 首的歌单只解析出 10 首，界面上却显示「解析成功」—— 比报错更难发现。

补齐走 `api/song/detail?ids=[...]`，实测（本机直连）：200 首 → 200/612KB/228ms；500 首 → 200/616KB/181ms；**1000 首 → code 400**（URL 长 11399 超限）。所以按 200 分块。

两个额外约束：

- 字段形状**两套**。内联曲目是 `ar` / `dt`，`song/detail` 是 `artists` / `duration`。只认一套会把补齐来的曲目歌手与时长全部弄丢（`neteaseArtists` / `neteaseDuration` 两吃）。
- 补齐失败**绝不抛错**：分块异常就跳过这一块，拿到几首算几首。

### 链接识别只有一份实现

`src/client/parser.js` 是纯函数模块（零 import、零浏览器全局），宿主侧直接 `import` 它。

这条是踩出来的：宿主曾自带一份 `neteaseRouteOf`，比客户端的 `neteaseRoute` 弱，只认 hash 路由和纯 path 段，不认 `music.163.com/playlist?id=xxx` 这种「path 路由 + search query」写法 → 客户端认得出、宿主返回 null → 用户看到「网易云音乐链接解析失败」。**路由解析一旦分叉，两边的单测都会绿，故障只在真实链接上暴露。** 现在 `test/host-route.test.mjs` 用「宿主路由与客户端 parser 必须逐字一致」逐条比对两组结果。

---

## 宿主 API 核实清单

写这个插件时逐条核实过的宿主接口（路径 + 导出符号），括号内是「怎么用的」。

### 1. 槽位服务 `ctx.slots`

```js
// 声明依赖
const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];
// keyed 槽位：注册 / 卸载
ctx.effect(
  () => ctx.slots.inject(SLOT, () =>
    ctx.slots.register({ name: SLOT, key: TAB_ID, locale: PLUGIN_ID }, Component)),
  'label',
);
```

- 定义在 `...\dsh-web-frontend\dist\assets\index-*.js`（`SlotCore` 类与 `Object.freeze` 命名空间 `SI`）。
- `SlotCore` 上有 `records` / `factories` / `mutateListeners` / `entryErrorListeners`，槽域 `singleton|keyed|chain|list`。
- `dsh-client-ui-slots` **不在磁盘上**（`node_modules` 里没有这个目录），它只作为浏览器模块表的种子导出一份冻结命名空间，导出符号：`SlotCore` / `SlotOwnershipError` / `StaleAuthorizationError` / `resolveSlotLabel` / `standardHookPropName`。 → **不要在 Node 侧 `import '@deepseek-ai/dsh-client-ui-slots'`，也不要在浏览器侧 value-import 它，只用 `ctx.slots`。**

### 2. 右侧栏标签页（三处，缺一不可）

| 用途 | 调用 | 证据 |
|---|---|---|
| 类型表服务 | `ctx.sidebarRightTabs.register(definition)` | `...\dsh-client-ui-sidebar-right\lib\types\client\index.d.ts` 的 `declare module '@deepseek-ai/cordis'` 段 |
| 槽位常量 | `'sidebar.right.pane.tab'`（body）/ `'sidebar.right.pane.tab.title'`（标题） | `...\dsh-client-ui-sidebar-right\lib\types\client\contract\slots.d.ts` |
| 运行时范例 | `ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind, multiple, priority, title, guide }), …)` | `...\dsh-client-ui-sidebar-terminal\lib\client.js:438` |

`SidebarRightTabDefinition` 必填只有 `id` / `kind` / `title`：

```js
{
  id: 'dsh-music-on',        // 本实现的稳定身份；keyed 槽位的 key 必须等于它
  kind: 'music-on',          // 类型判别符，openTab('music-on') 用它
  multiple: false,           // 每种会话一个页面
  keepMounted: true,         // 隐藏/切会话时不被卸载（播放不能断）
  priority: 'extension',     // 外部扩展优先级最高；另有 'builtin' / 'fallback'
  title: () => '音乐台',
  guide: [{ id: 'open', order: 40, title: () => '…', description: () => '…' }],
}
```

打开：

```js
ctx.sidebarRight.openTab('music-on', { params: { source: 'command' } });
```

`priority` 是字面量字符串而非常量导入 —— 宿主这么设计的，跨包类型不需要运行时依赖。

### 3. `@deepseek-ai/dsh-client-store`

导出 `createSnapshotStore` / `defineStore` / `notifySubscribers` / `shallowEqual`。
`defineStore` 返回 `{ actions, getSnapshot, subscribe, store, clearPersisted }`，可带 `localStorage` 持久化 key。
本插件的设置存储（`src/client/settings.js`）按这个形态实现；**浏览器侧不 value-import 该包**，只用同形态自实现，避免种子表之外的依赖。

### 4. `@deepseek-ai/dsh-client-ui-primitives`

可用组件（节选，全集是约 130 个 `Icon*` + 下列）：`Button` / `Checkbox` / `Switch` / `Input` / `Menu*` / `Modal` / `Pill` / `Tag` / `Tooltip` / `Toast` / `SegmentedControl` / `SegmentedTabs` / `DisclosureRow` / `HoverCard` / `MarkdownText` / `Modal` / `SettingsForm` / `SettingsSecretField` / `PluginArtworkDefault` / `PluginArtworkLoop` / `PluginArtworkSearch` / `PluginArtworkSubagent` / `PluginArtworkTerminal`，以及工具函数 `relativeTime` / `fileSizeText` / `writeClipboard` / `useAnchoredPosition` / `useDismissOnOutsidePointer`。
→ 本插件用原生 `button` + 自写样式，只用它们取图标（可选）。

### 5. 宿主 HTTP 路由（engine 的活，这里留接口说明）

```js
// 必须走 connection 的共享 /api 前缀，才有浏览器登录态与 Host/Origin 防护
ctx.inject(['connection'], (c) =>
  c.effect(() => registerResolveRoute(c), 'dsh-music-on: resolve route'));
// registerResolveRoute 内部：
c.connection.fetch.register({
  path: '/api/dsh-music-on/resolve',
  methods: ['GET'],
  requestBody: 'buffered',
  fetch: (request) => serveResolve(request),
});
```

- 范例：`...\dsh-api-session-controller\lib\index.js:2482`（`/api/file`）。
- 段名校验 `/^[A-Za-z0-9_$.-]+$/`：`...\dsh-client-connection\lib\index.js:690`（`ENDPOINT_SEGMENT_PATTERN`）。
- 强制 `peer.principal.kind === 'owner'`，非 owner 一律 403：同文件 `:830`。

---

## engine（播放引擎）

`src/client/engine.js` —— 单例，挂在 `window.__dsh_music_on_runtime__`，由 `register.js` 的 `getRuntime()` 惰性创建。

音频图：`<audio crossOrigin=移除> → MediaElementAudioSourceNode → gain → analyser → destination`。

**`<audio>` 绝不能带 `crossorigin` 属性**。带上去以后元素进入 CORS 模式，而流代理若没回 `access-control-allow-origin`，规范要求 `MediaElementAudioSourceNode` **静音输出** —— 但 `play()` 仍然 resolve、进度条照样走，症状是「在播放但没声音、频谱是一条直线」。`stream.js` 的 `baseStreamHeaders()` 里那条 `access-control-allow-origin: '*'` 是配套的另一半，两处不可只改一边。

频谱出口三条，语义严格区分：

- `getAnalyser(): AnalyserNode | null` —— 内部模式返回真节点；**外部 iframe 模式必须返回 `null`**，不许返回一个静音 analyser 假装有频谱。
- `readSpectrum(Uint8Array): boolean` —— 读不到返回 `false`。
- `get spectrumAvailable` —— 布尔。

事件订阅（各自返回取消函数）：`onTrackChange` / `onStateChange` / `onTimeUpdate`（250ms 频控）/ `onQueueChange` / `onError`。

**入队时 `playFirst` 的语义**：引擎只在 `opts.playFirst === true && current === null` 时自动开播（`engine.js` 的 `add`）。所以批量入队必须只在首条传 `playFirst`，否则会反复抢占当前曲目。

## parser（链接识别）

`src/client/parser.js` —— 纯函数，宿主 `resolve.js` 与客户端 `linkintake.js` 共用同一套判定。

- `PLATFORMS`：`bilibili-video` / `bilibili-favlist` / `netease-playlist` / `netease-track` / `qq-playlist` / `qq-track` / `youtube-video` / `youtube-playlist` / `direct-audio` / `unknown`。
- `ALLOWED_DOMAINS`：`bilibili.com`、`b23.tv`、`music.163.com`、`y.qq.com`、`youtube.com`、`youtu.be`。判定是 `host === domain || host.endsWith('.' + domain)`，**不是子串包含** —— 否则 `evilbilibili.com`、`bilibili.com.evil.tld` 都会漏进来。
- `ERROR_CODES`：`E_UNSUPPORTED_URL` / `E_RESOLVE_TIMEOUT` / `E_RESOLVE_BLOCKED` / `E_NO_STREAM` / `E_DECODE_FAILED` / `E_BAD_RESPONSE`。
- **`normalizeUrl()` 对非法输入是抛错，不是返回 null**。调用方一律 try/catch —— 粘一段乱码就炸掉整个入队流程是真实踩过的坑。

## presets（预置音景）

`presets/manifest.json`（14 条）+ 7 个 WAV。

切片规范（`presets/generate-seeds.mjs` 实测值）：**44.1kHz / 16bit / 单声道 / 5.600s**，每条 493,964 字节，循环接缝用 `XFADE_SEC = 0.25` 做的交叉淡化（`makeSeamless`），实测接缝跳变 0.0000。全部 CC0-1.0 原创合成，`sha256` 是脚本实测真值。

`manifest.json` 字段：顶层 `version` / `generatedAt` / `loopCrossfadeSec` / `layers` / `items` / `audioFormat`；条目 `id` / `name` / `nameEn` / `category` / `tags` / `loopStart` / `loopEnd` / `source` / `url` / `pageUrl` / `bvid` / `sha256` / `sizeBytes` / `duration` / `license` / `attribution` / `spectrumAvailable` / `status` / `file`。

注意条目用的字段名是 **`name` 而不是 `title`**。

`source` 三态：

| source | 含义 | 频谱 |
| --- | --- | --- |
| `embedded` | 包内 WAV，走 AudioContext | 可用 |
| `bilibili-embed` | `player.bilibili.com` iframe | 不可用 |
| `platform-link` | 只做跳转 | 不可用 |

`status` 三态 `ready` / `needs-config` / `unavailable`。**`bvid` 必须填真实公开视频号**，不能编造 —— 编错的后果是打开一片黑，比 `needs-config` 更糟。

新增预置音景：在 `generate-seeds.mjs` 的合成器表里加一项 → 跑脚本重生成 WAV 与 manifest → 跑 `presets/selftest.mjs`（37 项）与 `presets/verify-seeds.mjs`（逐条复核 sha256 / 字节数 / 时长 / 接缝）。静态路由只放行 `.wav` 与裸名 `manifest.json`，WAV 带 `cache-control: public, max-age=31536000, immutable`，manifest 是 `no-store`。

## spectrum（频谱）

`src/client/ui/Spectrum.jsx` —— 从 `engine.getAnalyser()` 拿 `AnalyserNode`，`getByteFrequencyData` 取数，**不是** OfflineAudioContext。

- `fftSize` 2048；analyser 上不是这个值时由组件显式设定（只读实现上退化为用现有 bin 数）。
- 对数频段分桶，柱数由设置 `spectrumBars` 控制（8 对齐，16–96）。
- **analyser 是懒绑定的**：音频图要到首次播放才建，首次渲染时 `getAnalyser()` 必然返回 null。组件每 500ms 重试一次（`ANALYSER_PROBE_MS`），绑上就不再探。早期版本只在挂载时取一次，于是频谱永远是呼吸基线 —— 这就是「频谱消失」的真因。
- 四种绘制：`dots`（默认，蓝白细圆点）/ `bars`（柱状）/ `line` / `wave`；`off` 直接 `return null`，**完全不创建 canvas 与动画循环**。
- 峰值每帧回落 `-0.6`（以 60fps 为基准按实际 `dt` 缩放），永不低于当前值。
- 帧率由 `spectrumFps` 控制；`prefers-reduced-motion: reduce` 时降到 **10fps 而不是让频谱消失**。
- 双通道暂停：`IntersectionObserver` + `visibilitychange`。
- 配色从 CSS 变量读（`getComputedStyle(canvas)` 继承）：`--dmo-spec-base/low/high/glow`，定义在 `.dmo-dock-stack` 上，深浅主题各一套。
- 几何自检：`node scripts/check-spectrum.mjs`（27 项，含 6 组容器宽度下的柱宽/间距/圆角/整排宽度）。

## 视觉语言（蓝白鲸鱼娘）

配色令牌全部落在 `.dmo-dock-stack` 与 `.dmo-settings` 两个作用域里，**不在 `:root`**，避免污染宿主：`--dmo-brand`(#4d6bfe) / `--dmo-brand-soft` / `--dmo-brand-deep` / `--dmo-glass` / `--dmo-edge` / `--dmo-halo` / `--dmo-spec-*`。

铁律：
- 卡片与设置分区必须自带前景与底色锚点（`--dmo-fg*` / `--dmo-glass`）。直接用宿主的 `--dsw-alias-label-primary` 会在浅色主题下变成白字白底 —— 因为宿主的 label 随主题翻转，而我们的玻璃底不翻转。
- 深色反转必须写两块：`@media (prefers-color-scheme: dark)` 兜底 + `:where([data-theme='dark'], …)`，且后者排在**后面**靠同权重后出现者胜出。
- `test/theme-contrast.test.mjs` 锁住以上三条（含「卡片子树不得直接消费宿主 label 族变量」）。

## 走带与音量（长条是进度，音量是旋钮）

卡片里最长的那根横条是**音乐进度**，不是音量。走带行只剩「上一首 / 播放 / 下一首 + 旋钮 + 循环芯片」，进度条独占它下面一整行（`.dmo-progress` 里 `.dmo-seek` + 两个时间戳）。原先进度条挤在走带行里与三个按钮、两个时间戳共处 340px 宽，谁都看不清。

音量是 34px 圆旋钮（`.dmo-knob`，`role="slider"` + `aria-valuenow`），三条操作通道：

- **拖动**：130px 竖向行程对应 0→1（向上变响）。拖动途中每帧只写引擎与 ref、**不落盘**，松手才 commit —— 逐帧 patch 会把设置 store 打成筛子。
- **滚轮**：一格 5%。监听必须手挂真实节点并 `{ passive: false }`；React 的 `onWheel` 走 passive 委托，`preventDefault()` 是空操作，音量与卡片滚动会同时发生。
- **单击 / 键盘**：单击是静音开关（记住静音前的值，恢复不回到 0.8）；方向键 1 格、PageUp/PageDown 4 格、Home/End 到底。

两条踩过的坑，都有测试锁：

1. **旋钮拖动必须走 window 通道**。旋钮直径只有 30px，指针往外甩几像素就离开元素，React 的 `onPointerMove` 随即不再派发 —— 拖动当场断掉。这与胶囊拖动是同一个坑（见 `test/shell-dock-render.test.mjs` 的「旋钮拖动必须走 window 通道」）。
2. **绝不能加 `setPointerCapture`**。捕获会把该指针的 compatibility mouse events 目标重定向到捕获元素，合成出的 `click` 落在容器而不是子按钮上，症状是「能拖了，但所有按钮点了都没反应」。`check-install.mjs` 有一条断言直接扫 bundle 里不许出现 `setPointerCapture`。

旋钮的显示值走自己的 `knobValue` state，而不是 `settings.volume`：拖动时连续 `applyVolume(commit=false)` 不落盘，就不会有新的 settings 快照回流，指针会停在按下那一刻而旋钮纹丝不动。

## settings（设置）

`src/client/settings.js` —— 持久化键 `STORAGE_KEY = 'dsh-music-on:settings'`，另有 `dsh-music-on:queue.v1`（播放列表）、`dsh-music-on:favorites.v1`、`dsh-music-on:history.v1`。

通道优先级：**localStorage > configForms(ctx) > memory-only**。localStorage 排第一是因为它是唯一「刷新后必然还在」的通道；configForms 在后台补写，失败无所谓，localStorage 已经是真相。

`normalizeSettings()` 对每一项做夹取而不是丢弃：数值按范围夹、8 对齐的按 8 对齐、枚举非法值回落到默认。**幂等**是硬要求 —— 不幂等会让「读出来 → 归一化 → 写回去」在多轮之后漂移（`dockX: null` 被 `Number(null) === 0` 吃成 0，把胶囊钉到左上角，就是这条踩出来的）。

### 播放列表持久化：绝不能存票据地址

队列落盘在 `dsh-music-on:queue.v1`，单条只留一个「能重建播放的地址」。平台曲目的 `track.url` 是 `/api/dsh-music-on/stream?mt=…`，**票据 TTL 只有 10 分钟，宿主重启还换密钥**。存它等于存一条必然失效的死链。

所以 `serializeTrack()` 对平台曲目改存两样东西：`sourceUrl`（用户粘贴的那个歌单链接）与 `pageUrl`（单曲页），恢复时按 `sourceUrl` 分组、**每个歌单只重新解析一次**，再按 `pageUrl` 把存下来的条目对回新解析出的曲目拿新票据。一条都对不上时明确报「需要重新粘贴歌单链接」—— 静默失败会让用户以为持久化根本没生效。

封面（纯 https 图床外链，不带凭据、不会过期）可以落盘；但**绝不序列化 Blob / objectURL**（本地拖入的文件刷新后必然是死地址）。

---

## 自检

```pwsh
cd J:\plugin\dsh-music-on

# 1) 构建（client.js 是产物，改 src 后必须重建）
node scripts\build-client.mjs

# 2) 全部单测（注意：node --test 传目录会 MODULE_NOT_FOUND，必须逐个给文件名）
#    别手写文件清单 —— 会漏掉新加的测试文件。用 glob 取：
$files = Get-ChildItem test -Filter *.test.* | ForEach-Object { $_.FullName }
node --test @files

# 3) 运行期模拟（vm 里真跑 client.js，验槽位注册与首渲染）
node scripts\simulate-browser.mjs
node scripts\simulate-drag.mjs

# 4) 实网端到端（需要能直连，先清空 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY）
node scripts\verify-bilibili.mjs
node scripts\verify-platform.mjs

# 5) 安装位置自检
node scripts\check-install.mjs
```

**同步到安装位置必须逐文件 `Copy-Item` + `Get-FileHash` 比对**：`file:` 依赖在 node_modules 下是**实体目录副本**（不是 junction/symlink），`Copy-Item -Recurse` 会造出 `src\src`、`presets\presets` 嵌套重复。改完纯客户端只需 `Ctrl+F5`；改了 `src/host/*` 必须重启 DSH。
