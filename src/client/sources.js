/**
 * 音源适配层：把三种完全不同的音源压成同一个 Track 形状。
 *
 * 三种 kind（设计铁律，不可增删而不改 engine）：
 *   local-file      用户拖入的 File 或 FileList 里的一项。走 URL.createObjectURL，
 *                   必须流式播放，绝不 decodeAudioData 整块解码。
 *   url-audio       直链音频：预置音景的 WAV、平台代理解析出的直链。
 *                   同样交给 <audio> + MediaElementSource。
 *   external-embed  第三方 iframe 播放器（B 站 player.bilibili.com/player.html?bvid=...）。
 *                   它的声音在 iframe 自己的文档里，进不了本页 AudioContext，
 *                   所以它只描述「界面上要放一个 iframe」，不参与音频图。
 *
 * 为什么所有事件监听都挂到元素/iframe 的 on* 属性而不是 addEventListener：
 * engine 持有一个复用元素，on* 属性赋值天然幂等，换歌时不会累积监听器，
 * 也不需要维护一张「上次挂了哪些 handler」的清单。这是本文件的核心取舍。
 *
 * duration/seekable 的语义：
 *   duration === null && seekable === false  -> UI 显示 indeterminate，禁用进度条。
 *   只有 external-embed 是这种；其余音源在 loadedmetadata 后填出真实时长。
 */

export const KIND_LOCAL_FILE = 'local-file';
export const KIND_URL_AUDIO = 'url-audio';
export const KIND_EXTERNAL_EMBED = 'external-embed';

export const AUDIO_KINDS = Object.freeze([KIND_LOCAL_FILE, KIND_URL_AUDIO]);
export const ALL_KINDS = Object.freeze([KIND_LOCAL_FILE, KIND_URL_AUDIO, KIND_EXTERNAL_EMBED]);

/** 同一个文件被拖两次也不会撞 id，这里用单调计数器兜底。 */
let uidCounter = 0;

/**
 * 生成一个进程内唯一的 track id。
 * 用单调计数器而不是 crypto.randomUUID：调试时能看出入队顺序，
 * 且不依赖 randomUUID 是否可用。
 * @param {string} prefix
 * @returns {string}
 */
export function nextTrackId(prefix) {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/** 防御性归一：只接受有限正数，其余一律 null（UI 显示 --:--）。 */
function safeSeconds(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

/**
 * 循环点归一：这里 0 是合法值（loopStart = 0 表示从头开始），
 * 所以不能复用 safeSeconds —— 那个函数把 0 吞成 null，
 * 会让「从 0 循环到 5.6s」退化成「不知道从哪开始」。
 */
function safeLoopSeconds(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

/**
 * 从文件名里剥掉扩展名，做默认标题。
 * @param {string} name
 * @returns {string}
 */
export function titleFromFileName(name) {
  if (typeof name !== 'string' || name === '') return '未命名音源';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

/**
 * 把文件名猜成 artist / title。
 * 常见命名：`周杰伦 - 晴天.mp3` / `01. 晴天.mp3` / `晴天.mp3`。
 * 猜不出来就 title = 去扩展名后的全名，artist 留空 —— 宁可没有也别编。
 * @param {string} fileName
 * @returns {{ title: string, artist: string }}
 */
export function parseFileTitle(fileName) {
  const base = titleFromFileName(fileName);
  const dash = base.indexOf(' - ');
  if (dash > 0 && dash < base.length - 3) {
    const artist = base.slice(0, dash).trim();
    const title = base.slice(dash + 3).trim();
    if (artist !== '' && title !== '') return { title, artist };
  }
  // `01. 晴天` / `01 - 晴天` / `1_晴天` 这类序号前缀不是标题的一部分。
  const numbered = /^\s*\d{1,3}\s*[.\-_)]\s+(.+)$/.exec(base);
  if (numbered !== null && numbered[1].trim() !== '') {
    return { title: numbered[1].trim(), artist: '' };
  }
  return { title: base, artist: '' };
}

/**
 * 音频扩展名判定。拖进来的可能是图片、PDF，必须挡在入队之前。
 * 用扩展名兜底而不是只看 file.type：很多系统给 flac/opus 的 type 是空串。
 */
const AUDIO_EXTENSIONS = Object.freeze([
  '.mp3',
  '.m4a',
  '.m4b',
  '.aac',
  '.wav',
  '.wave',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.weba',
  '.webm',
  '.aiff',
  '.aif',
  '.caf',
  '.amr',
]);

/**
 * 判断一个 File 能不能进队列。
 * @param {File} file
 * @returns {boolean}
 */
export function isAudioFile(file) {
  if (file === null || typeof file !== 'object') return false;
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  if (type.startsWith('audio/')) return true;
  // 少数浏览器把 .m4a 报成 video/mp4，但它确实是音频容器。
  if (type === 'video/mp4' || type === 'application/ogg') return true;
  const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
  for (const ext of AUDIO_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

/**
 * 给 B 站播放页地址换算成可嵌入的 player URL。
 * 支持三种输入：
 *   https://player.bilibili.com/player.html?bvid=BV1xx       直接透传（规范化参数）
 *   https://www.bilibili.com/video/BV1xx/?p=2                提取 bvid + page
 *   BV1xxxxxxxxx                                             裸 bvid
 * 认不出来返回 null —— engine 把该条目标为不可播放，而不是塞一个坏 iframe。
 * @param {string} input
 * @returns {{ url: string, bvid: string, page: number } | null}
 */
export function toEmbedUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const raw = input.trim();

  const bare = /^(BV[0-9A-Za-z]{8,12})$/.exec(raw);
  if (bare !== null) {
    return { url: buildPlayerUrl({ bvid: bare[1], page: 1 }), bvid: bare[1], page: 1 };
  }
  // 不带协议的 `player.bilibili.com/...`：补一个 https 再走 URL 解析，
  // 省掉「复制地址时漏了协议头」这一条高频失败路径。
  const candidate = /^https?:\/\//i.test(raw) ? raw : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(raw) ? `https://${raw}` : raw;

  let parsed = null;
  try {
    parsed = new URL(candidate);
  } catch (_error) {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();
  const isBiliHost = host === 'bilibili.com' || host.endsWith('.bilibili.com') === true || host === 'b23.tv';
  if (isBiliHost === false) return null;

  const bvidFromQuery = parsed.searchParams.get('bvid');
  const bvidMatch = /\/video\/(BV[0-9A-Za-z]{8,12})/.exec(parsed.pathname);
  let bvid = bvidFromQuery !== null && bvidFromQuery !== '' ? bvidFromQuery : null;
  if (bvid === null && bvidMatch !== null) bvid = bvidMatch[1];

  const aid = parsed.searchParams.get('aid') ?? parsed.searchParams.get('avid');
  if (bvid === null && (aid === null || aid === '')) return null;

  const pageRaw = parsed.searchParams.get('p');
  const page = pageRaw !== null && /^\d+$/.test(pageRaw) === true ? Math.max(1, Number(pageRaw)) : 1;

  return {
    url: buildPlayerUrl({ bvid: bvid ?? '', aid: aid ?? '', page }),
    bvid: bvid ?? '',
    page,
  };
}

/** 组装 player.bilibili.com 的嵌入地址。参数顺序固定，便于测试断言。 */
function buildPlayerUrl(spec) {
  const params = new URLSearchParams();
  if (spec.bvid !== '') params.set('bvid', spec.bvid);
  else params.set('aid', spec.aid);
  params.set('page', String(spec.page));
  params.set('high_quality', '1');
  params.set('autoplay', '0');
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

/**
 * Track 的公共字段。所有构造函数都经由这个函数，保证形状一致，
 * UI 里就不用到处写 `track.kind === ... ? a : b`。
 * @param {object} parts
 */
function baseTrack(parts) {
  return {
    id: parts.id,
    title: parts.title,
    artist: parts.artist ?? '',
    kind: parts.kind,
    duration: parts.duration ?? null,
    seekable: parts.seekable ?? true,
    source: parts.source ?? null,
    file: parts.file ?? null,
    fileSize: parts.fileSize ?? null,
    url: parts.url ?? null,
    embedUrl: parts.embedUrl ?? null,
    /** 走我们自己 host 的流代理地址（同源，能进 AudioContext）。优先于 url。 */
    streamUrl: parts.streamUrl ?? null,
    /**
     * 曲目的原始页面地址（www.bilibili.com/video/xxx、music.163.com/#/song?id=xxx、
     * y.qq.com/n/ryqq/songDetail/xxx）。收藏与历史存的就是它 —— 内部地址有三种形态
     * （blob: / 相对路径 / player 壳），只有这个是长期有效、人可复制的。
     */
    pageUrl: parts.pageUrl ?? null,
    /** 曲目所属平台标识（bilibili / netease / qq / youtube），队列行据此显示 chip。 */
    platform: parts.platform ?? null,
    /**
     * 这条曲目是从哪个**歌单/专辑页面**解析来的（用户粘贴的那个链接）。
     *
     * 存在的唯一理由：平台曲目的 url 是票据路径 `/api/dsh-music-on/stream?mt=…`，
     * 票据 10 分钟就过期。刷新页面要恢复队列时，票据必然已死 —— 只有这个源地址
     * 能重新解析出带新票据的曲目。没有它，持久化的平台曲目全是点了就报错的死链。
     */
    sourceUrl: parts.sourceUrl ?? null,
    /** 封面图 URL。B 站由解析层提供；本地文件可后填 objectURL；空表示走黑胶兜底。 */
    cover: parts.cover ?? null,
    presetId: parts.presetId ?? null,
    unavailableReason: parts.unavailableReason ?? null,
    loopStart: parts.loopStart ?? null,
    loopEnd: parts.loopEnd ?? null,
    /** presets.play() 的 mode，引擎与 UI 据此分流；普通音源为 null。 */
    presetMode: parts.presetMode ?? null,
    /** 该音源的频谱是否可能可用（false = UI 直接画静止占位，不用等 engine 说）。 */
    spectrumPossible: parts.spectrumPossible ?? true,
  };
}

/**
 * 由用户拖入 / 选择的一份 File 构造 Track。
 *
 * revoke() 是幂等的：engine 在切歌和 dispose 时都会调用。
 * @param {File} file
 * @param {{ id?: string }} [options]
 * @returns {object | null} 不是音频时返回 null，调用方据此计数被跳过的文件
 */
export function createLocalTrack(file, options) {
  if (isAudioFile(file) === false) return null;
  const named = parseFileTitle(typeof file.name === 'string' ? file.name : '');
  let objectUrl = null;
  let revoked = false;

  const track = baseTrack({
    id: (options && options.id) || nextTrackId('local'),
    title: named.title,
    artist: named.artist,
    kind: KIND_LOCAL_FILE,
    duration: null,
    seekable: true,
    source: 'blob',
    file,
    fileSize: typeof file.size === 'number' ? file.size : null,
  });

  /**
   * 懒创建 objectURL：入队时不建，真正要播时才建。
   * 拖 200 首进来不播，不该白占 200 个 blob 引用；
   * 播一首建一个，revoke 点也就只剩「切歌」和「dispose」两处。
   */
  track.load = function load() {
    if (revoked) return Promise.reject(new Error('轨道已释放'));
    if (objectUrl === null) {
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return Promise.resolve({ src: objectUrl, kind: KIND_LOCAL_FILE });
  };

  track.revoke = function revoke() {
    if (revoked) return;
    revoked = true;
    if (objectUrl !== null) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (_error) {
        /* 已 revoke 或环境不支持，都不影响后续流程 */
      }
      objectUrl = null;
    }
  };

  /** 供 engine 判断这份 blob 是否已建过 URL（用于 dispose 统计）。 */
  track.hasObjectUrl = function hasObjectUrl() {
    return objectUrl !== null;
  };

  return track;
}

/**
 * 由直链 URL 构造 Track。直链不创建 objectURL，revoke 是空操作，
 * 但保留同名字段，让 engine 可以无差别地对所有 track 调用 revoke。
 * @param {{ url: string, title?: string, artist?: string, duration?: number, id?: string, presetId?: string }} spec
 * @returns {object}
 */
export function createUrlTrack(spec) {
  const url = spec && typeof spec.url === 'string' ? spec.url : '';
  let title = spec && typeof spec.title === 'string' ? spec.title : '';
  if (title === '') {
    const tail = url.split('/').pop() || url;
    title = url === '' ? '网络音频' : titleFromFileName(tail.split('?')[0]) || '网络音频';
  }

  const track = baseTrack({
    id: (spec && spec.id) || nextTrackId('url'),
    title,
    artist: spec && typeof spec.artist === 'string' ? spec.artist : '',
    kind: KIND_URL_AUDIO,
    duration: safeSeconds(spec && spec.duration),
    seekable: true,
    source: 'url',
    url,
    pageUrl: spec && typeof spec.pageUrl === 'string' && spec.pageUrl !== '' ? spec.pageUrl : null,
    platform: spec && typeof spec.platform === 'string' && spec.platform !== '' ? spec.platform : null,
    presetId: (spec && spec.presetId) || null,
    loopStart: safeLoopSeconds(spec && spec.loopStart),
    loopEnd: safeLoopSeconds(spec && spec.loopEnd),
  });

  track.load = function load() {
    if (url === '') return Promise.reject(new Error('直链为空'));
    return Promise.resolve({ src: url, kind: KIND_URL_AUDIO });
  };
  track.revoke = function revoke() {
    /* 直链不持有本地资源，释放是空操作 */
  };
  return track;
}

/**
 * 平台曲目（网易云 / QQ 音乐单曲）。
 *
 * 与 createUrlTrack 的区别只有一个：**地址来自宿主签发的票据**。
 * 票据是 `/api/dsh-music-on/stream?mt=...` 形态的同源路径，客户端无法伪造，
 * 且它指向的是平台 CDN —— 所以这条 track 能进 AudioContext、频谱是真的，
 * 而不是像 embed 那样只能挂一个白屏的 iframe。
 *
 * 没有票据时（VIP 曲 / 解析失败）退回「只跳转」：streamUrl 为 null，
 * unavailableReason 说明原因，UI 据此提示用户去原平台。
 *
 * @param {{ streamPath?: string, pageUrl?: string, title?: string, artist?: string,
 *           duration?: number, platform?: string, id?: string, reason?: string }} spec
 * @returns {object}
 */
export function createPlatformTrack(spec) {
  const input = spec || {};
  const streamPath = typeof input.streamPath === 'string' && input.streamPath !== '' ? input.streamPath : null;
  const pageUrl = typeof input.pageUrl === 'string' && input.pageUrl !== '' ? input.pageUrl : null;
  const platform = typeof input.platform === 'string' && input.platform !== '' ? input.platform : null;
  const title = typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : '平台曲目';

  const track = baseTrack({
    id: input.id || nextTrackId('platform'),
    title,
    artist: typeof input.artist === 'string' ? input.artist : '',
    // kind 用 url-audio：有票据时它就是一条同源音频流，与直链无差别。
    kind: KIND_URL_AUDIO,
    duration: safeSeconds(input.duration),
    seekable: true,
    source: platform === 'netease' ? 'netease' : platform === 'qq' ? 'qq' : 'platform',
    url: streamPath,
    streamUrl: streamPath,
    pageUrl,
    platform,
    // 歌单源地址：刷新后靠它重新解析出新票据（票据本身 10 分钟就过期）。
    sourceUrl: typeof input.sourceUrl === 'string' && input.sourceUrl !== '' ? input.sourceUrl : null,
    // 没有票据就是不能播 —— 如实标注，别让 UI 以为点了会响。
    unavailableReason: streamPath === null
      ? (typeof input.reason === 'string' && input.reason !== '' ? input.reason : '该曲目需要会员，可点「打开原平台」收听')
      : null,
  });

  track.load = function load() {
    if (streamPath === null) {
      return Promise.reject(new Error(track.unavailableReason || '该曲目没有可播放的直链'));
    }
    return Promise.resolve({ src: streamPath, kind: KIND_URL_AUDIO });
  };
  track.revoke = function revoke() {
    /* 票据流不持有本地资源 */
  };
  // 逐曲封面：宿主解析层已从各平台接口取到并转成 https。
  // 只接受字符串形态，坏值一律置 null —— UI 会退回纯黑胶图形，
  // 绝不留一个空白 <img> 在盘面上。
  track.cover = typeof input.cover === 'string' && input.cover.trim() !== '' ? input.cover.trim() : null;
  return track;
}

/**
 * 由预置音景清单条目构造 Track（presets/manifest.json 的 items[]）。
 *
 * 清单里两种条目都要能入队：
 *   status === 'seeded'       -> file 有值，转成 url-audio，src 走 presets/<file>
 *   status === 'unavailable'  -> 仍然入队，但 load() 直接 reject 并带 unavailableReason，
 *                                UI 能解释原因，用户不会以为「点了没反应」。
 * @param {object} item 清单条目
 * @param {{ baseUrl?: string, id?: string }} [options]
 */
export function createPresetTrack(item, options) {
  const baseUrl = options && typeof options.baseUrl === 'string' ? options.baseUrl : 'presets/';
  const name = item && typeof item.name === 'string' && item.name !== '' ? item.name : '音景';
  const reason = item && typeof item.unavailableReason === 'string' ? item.unavailableReason : null;

  let src = null;
  if (item && typeof item.url === 'string' && item.url !== '') src = item.url;
  else if (item && typeof item.file === 'string' && item.file !== '') src = `${baseUrl}${item.file}`;

  const track = baseTrack({
    id: (options && options.id) || (item && typeof item.id === 'string' ? `preset:${item.id}` : nextTrackId('preset')),
    title: name,
    artist: '预置音景',
    kind: KIND_URL_AUDIO,
    duration: safeSeconds(item && item.duration),
    seekable: true,
    source: 'preset',
    url: src,
    presetId: item && typeof item.id === 'string' ? item.id : null,
    unavailableReason: src === null ? reason || '该音景缺少音频文件' : null,
    loopStart: safeLoopSeconds(item && item.loopStart),
    loopEnd: safeLoopSeconds(item && item.loopEnd),
    presetMode: item && typeof item.mode === 'string' ? item.mode : null,
  });

  track.load = function load() {
    if (src === null) return Promise.reject(new Error(track.unavailableReason || '音景不可用'));
    return Promise.resolve({ src, kind: KIND_URL_AUDIO });
  };
  track.revoke = function revoke() {
    /* 预置音景是插件自带资源，不持有 objectURL */
  };
  return track;
}

/**
 * 由外部播放器地址（B 站）构造 Track。
 *
 * 这类 Track 不进 AudioContext：engine 见到 kind 就切外部模式，
 * 只把 embedUrl 交给 UI 挂 iframe。duration 恒为 null、seekable 恒为 false。
 * @param {{ url: string, title?: string, artist?: string, id?: string }} spec
 * @returns {object}
 */
export function createEmbedTrack(spec) {
  const resolved = toEmbedUrl(spec && spec.url);
  const rawTitle = spec && typeof spec.title === 'string' ? spec.title.trim() : '';
  const track = baseTrack({
    id: (spec && spec.id) || nextTrackId('embed'),
    title: rawTitle !== '' ? rawTitle : '外部播放器',
    artist: spec && typeof spec.artist === 'string' ? spec.artist : 'Bilibili',
    kind: KIND_EXTERNAL_EMBED,
    duration: null,
    seekable: false,
    source: 'external',
    embedUrl: resolved !== null ? resolved.url : null,
    unavailableReason: resolved !== null ? null : '无法从该地址解析出可嵌入的播放器',
  });
  track.bvid = resolved !== null ? resolved.bvid : null;
  track.page = resolved !== null ? resolved.page : null;

  track.load = function load() {
    if (resolved === null) return Promise.reject(new Error(track.unavailableReason || '外部播放器不可用'));
    /* 外部播放器的「加载」就是拿到 iframe 地址，没有真实媒体加载期。 */
    return Promise.resolve({ src: null, kind: KIND_EXTERNAL_EMBED, embedUrl: resolved.url });
  };
  track.revoke = function revoke() {
    /* 外部播放器不持有本地资源 */
  };
  return track;
}

/**
 * 由 B 站视频构造 Track —— 双轨：streamUrl 主路 + embedUrl 兜底。
 *
 * 主路径走我们自己 host 的 /api/dsh-music-on/stream?bvid=..&cid=..：
 * 同源、能进 AudioContext、频谱正常动。
 * 兜底是 player.bilibili.com 的 iframe，频谱停。
 *
 * **永远不要把 B 站 CDN 直链填进 audio.src**：那个地址有 Referer 校验，
 * 浏览器直连必然 403，且跨域后 CORS 也过不了。
 *
 * @param {{ bvid?: string, cid?: string|number, aid?: string, page?: number,
 *           title?: string, artist?: string, duration?: number,
 *           streamBase?: string, id?: string, embedUrl?: string }} spec
 * @returns {object}
 */
export function createBilibiliTrack(spec) {
  const input = spec || {};
  const streamBase = typeof input.streamBase === 'string' && input.streamBase !== ''
    ? input.streamBase
    : '/api/dsh-music-on/stream';

  const params = new URLSearchParams();
  if (typeof input.bvid === 'string' && input.bvid !== '') params.set('bvid', input.bvid);
  else if (typeof input.aid === 'string' && input.aid !== '') params.set('aid', input.aid);
  // cid 必须带上。宿主 stream 路由的 parseStreamQuery 一旦发现 cid 缺失，
  // 会额外打一次 view 接口去查 —— 那是可以避免的往返，且 view 接口在稿件受限时
  // 直接失败，等于把「已经解析成功」的优势白白丢掉。
  const cidText = typeof input.cid === 'string' || typeof input.cid === 'number'
    ? String(input.cid).trim()
    : '';
  if (cidText !== '') params.set('cid', cidText);
  if (typeof input.page === 'number' && input.page > 1) params.set('page', String(input.page));

  const hasKey = params.has('bvid') || params.has('aid');
  const streamUrl = hasKey ? `${streamBase}?${params.toString()}` : null;

  // embedUrl 用同一组参数重新构造，保证两条轨指向同一个视频同一 P。
  let embedUrl = typeof input.embedUrl === 'string' && input.embedUrl !== '' ? input.embedUrl : null;
  if (embedUrl === null && typeof input.bvid === 'string' && input.bvid !== '') {
    embedUrl = buildPlayerUrl({ bvid: input.bvid, aid: '', page: input.page || 1 });
  }

  const title = typeof input.title === 'string' && input.title.trim() !== ''
    ? input.title.trim()
    : input.bvid ? `Bilibili ${input.bvid}` : 'Bilibili 音频';

  const track = baseTrack({
    id: input.id || nextTrackId('bili'),
    title,
    artist: typeof input.artist === 'string' && input.artist !== '' ? input.artist : 'Bilibili',
    // kind 保持 url-audio：主路径能进音频图。降级是运行时行为，不是入队时的属性。
    kind: KIND_URL_AUDIO,
    // 时长只用于显示；seekable 在主路径 metadata 到位后被真实时长覆盖。
    duration: safeSeconds(input.duration),
    seekable: true,
    source: 'bilibili',
    streamUrl,
    embedUrl,
    unavailableReason: streamUrl === null && embedUrl === null ? '该条目既没有可代理的 bvid/cid，也没有可嵌入的地址' : null,
  });
  track.bvid = typeof input.bvid === 'string' ? input.bvid : null;
  track.cid = input.cid === undefined ? null : input.cid;
  // 封面：宿主解析层从 view 接口的 data.pic 拿，已是 https 的 .jpg/.webp。
  // 只接受字符串形态，坏值一律置 null，让 UI 退回黑胶兜底图形。
  track.cover = typeof input.cover === 'string' && input.cover.trim() !== '' ? input.cover.trim() : null;

  track.load = function load() {
    if (streamUrl === null && embedUrl === null) {
      return Promise.reject(new Error(track.unavailableReason || '该 B 站条目不可播放'));
    }
    if (streamUrl !== null) return Promise.resolve({ src: streamUrl, kind: KIND_URL_AUDIO });
    // 只有 embed：交给 engine 走外部模式。
    return Promise.resolve({ src: null, kind: KIND_EXTERNAL_EMBED, embedUrl });
  };
  track.revoke = function revoke() {
    /* 流代理地址不持有本地资源 */
  };
  return track;
}

/**
 * 把 presets.play() 的返回值分流成 engine 认识的形态。
 *
 * presets.play() 返回 `{ mode: 'audio' | 'iframe' | 'external', spectrum: boolean }`，
 * 另外可能带 url / file / embedUrl / bvid / cid / loopStart / loopEnd。
 * 这里不直接建 Track，只给出「怎么播」的决策，让调用方挑对应的构造函数 ——
 * 因为 Track 还要带上清单条目的标题等元数据，那不是这个函数该知道的。
 *
 * @param {{ mode?: string, spectrum?: boolean, url?: string, file?: string,
 *           embedUrl?: string, bvid?: string, cid?: string|number }} played
 * @returns {{ route: 'audio'|'iframe'|'external', spectrum: boolean, reason: string|null }}
 */
export function resolvePresetRoute(played) {
  const input = played || {};
  const mode = typeof input.mode === 'string' ? input.mode : '';
  const spectrum = input.spectrum === true;
  if (mode === 'audio') {
    const hasSource =
      (typeof input.url === 'string' && input.url !== '') ||
      (typeof input.file === 'string' && input.file !== '') ||
      (typeof input.bvid === 'string' && input.bvid !== '');
    if (hasSource === false) {
      return { route: 'external', spectrum: false, reason: '该音景声明为音频，但没有给出可播地址' };
    }
    // spectrum:false 的 audio 说明宿主侧已知它进不了频谱（比如需要鉴权的流），
    // 尊重声明，但路由仍是 audio。
    return { route: 'audio', spectrum, reason: null };
  }
  if (mode === 'iframe') return { route: 'iframe', spectrum: false, reason: null };
  if (mode === 'external') return { route: 'external', spectrum: false, reason: null };
  return { route: 'external', spectrum: false, reason: `未知的音景模式：${mode || '空'}` };
}

/**
 * 从各种「文件集合」的诡异形状里取出 File[]。
 * 拖拽给 DataTransfer.files，input[type=file] 给 FileList（类数组无 forEach）。
 * 目录拖入只取顶层文件，不递归 —— 递归会把整张专辑目录拖成上千条队列。
 * @param {any} input
 * @returns {File[]}
 */
export function collectFiles(input) {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) return input.filter((item) => item && typeof item.name === 'string');
  if (typeof input.length === 'number' && typeof input.item === 'function') {
    const out = [];
    for (let index = 0; index < input.length; index += 1) {
      const file = input.item(index);
      if (file && typeof file.name === 'string') out.push(file);
    }
    return out;
  }
  return [];
}

/**
 * 把拖拽 DataTransfer 变成 Track 数组，并统计被跳过的非音频文件。
 * @param {DataTransfer} data
 * @param {{ idPrefix?: string }} [options]
 * @returns {{ tracks: object[], skipped: number, total: number }}
 */
export function tracksFromFiles(data, options) {
  const files = collectFiles(data && data.files ? data.files : data);
  const prefix = (options && options.idPrefix) || 'local';
  const stamp = Date.now().toString(36);
  const tracks = [];
  let skipped = 0;
  for (let index = 0; index < files.length; index += 1) {
    const track = createLocalTrack(files[index], { id: `${prefix}-${stamp}-${index}` });
    if (track === null) {
      skipped += 1;
      continue;
    }
    tracks.push(track);
  }
  return { tracks, skipped, total: files.length };
}

/**
 * 拖拽事件的分类入口：分拣出「文件」与「纯文本地址」。
 * 纯文本地址可能是 B 站链接，engine 侧再决定要不要做成 external-embed。
 * @param {DragEvent} event
 * @returns {{ files: File[], text: string }}
 */
export function readDataTransfer(event) {
  const data = event && event.dataTransfer;
  if (!data) return { files: [], text: '' };
  const files = collectFiles(data.files ? data.files : []);
  let text = '';
  try {
    if (typeof data.getData === 'function') {
      text = data.getData('text/uri-list') || data.getData('text/plain') || '';
    }
  } catch (_error) {
    /* 某些浏览器在 dragover 阶段禁止 getData，忽略即可 */
  }
  return { files, text };
}

/**
 * 把一个预置清单数组整体转成 Track 数组。
 * manifest.items 里 unavailable 的条目也入队并带原因。
 * @param {object[]} items
 * @param {{ baseUrl?: string }} [options]
 * @returns {object[]}
 */
export function tracksFromManifest(items, options) {
  if (Array.isArray(items) === false) return [];
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    out.push(createPresetTrack(item, options));
  }
  return out;
}

/**
 * 给 UI 用的轻量描述：不含 File / 函数，可安全放进 React state 做比较。
 * @param {object} track
 * @returns {object | null}
 */
export function describeTrack(track) {
  if (!track) return null;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    kind: track.kind,
    duration: track.duration,
    seekable: track.seekable,
    embedUrl: track.embedUrl,
    streamUrl: track.streamUrl,
    cover: track.cover,
    presetId: track.presetId,
    presetMode: track.presetMode,
    spectrumPossible: track.spectrumPossible,
    loopStart: track.loopStart,
    loopEnd: track.loopEnd,
    unavailableReason: track.unavailableReason,
    fileSize: track.fileSize,
    // 收藏与历史要用的「原始页面地址」。UI 不该自己去猜 track.url 是相对路径还是
    // blob:，那是本模块的知识。回推规则见 trackPageUrl。
    pageUrl: trackPageUrl(track),
    // 平台曲目的源歌单地址（票据过期后靠它重新解析）。本地文件与预置音景没有。
    sourceUrl: track.sourceUrl ?? null,
    platform: track.platform ?? null,
  };
}

/**
 * 一句话判定：这个 kind 的声音能不能进本页 AudioContext。
 * engine 与 visuals 都从这里取判断，杜绝两处各写一份 if。
 * @param {string} kind
 * @returns {boolean}
 */
export function isInternalKind(kind) {
  return kind === KIND_LOCAL_FILE || kind === KIND_URL_AUDIO;
}

/**
 * 曲目的「人可复制、可长期保存」的地址。
 *
 * 这是收藏与历史能成立的前提：那两个功能存的是链接，而 Track 内部的地址有四种
 * 形态，其中三种都不能直接拿去收藏 ——
 *   url-audio（含预置音景）  相对路径 `presets/xxx.wav` 或 blob:，重启后失效；
 *   external-embed           存的是 player.bilibili.com 的播放器壳地址；
 *   本地文件                  blob:，绝对不能序列化。
 * 所以这里统一回推成**原始页面地址**：B 站由 bvid 反拼 www.bilibili.com/video/<bvid>，
 * 其余按 url / embedUrl 取。拿不到就返回 null，调用方据此提示「这首没有可收藏的地址」。
 * @param {object} track 内部 Track 对象。
 * @returns {string|null} https 地址，或 null。
 */
export function trackPageUrl(track) {
  if (!track) return null;
  // 入队时就带上的原始页面地址优先 —— 平台曲目（网易云/QQ）的内部地址是
  // `/api/dsh-music-on/stream?mt=...` 这种相对票据路径，靠 url 回推永远拿不到原页。
  if (typeof track.pageUrl === 'string' && /^https?:\/\//i.test(track.pageUrl.trim())) {
    return track.pageUrl.trim();
  }
  const bvid = typeof track.bvid === 'string' ? track.bvid : '';
  if (/^BV[0-9A-Za-z]{10}$/.test(bvid)) {
    const page = Number.isFinite(track.page) && track.page > 1 ? `?p=${track.page}` : '';
    return `https://www.bilibili.com/video/${bvid}/${page}`;
  }
  const candidates = [track.url, track.embedUrl];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    // 只收绝对 http(s)。blob: / data: / 相对路径（预置音景、票据流）一律不算「可保存的地址」。
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}
