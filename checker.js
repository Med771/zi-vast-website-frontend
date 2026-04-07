'use strict';

// ─── Event definitions ────────────────────────────────────────────────────────
const EVENT_GROUPS = [
  {
    label: 'Показ',
    events: [
      { key: 'Impression',    label: 'Impression',     vast: 'Impression' },
    ],
  },
  {
    label: 'Прогресс воспроизведения',
    events: [
      { key: 'start',         label: 'Start',          vast: 'Tracking' },
      { key: 'firstQuartile', label: 'First Quartile', vast: 'Tracking' },
      { key: 'midpoint',      label: 'Midpoint',       vast: 'Tracking' },
      { key: 'thirdQuartile', label: 'Third Quartile', vast: 'Tracking' },
      { key: 'complete',      label: 'Complete',       vast: 'Tracking' },
    ],
  },
  {
    label: 'Взаимодействие',
    events: [
      { key: 'pause',         label: 'Pause',          vast: 'Tracking' },
      { key: 'resume',        label: 'Resume',         vast: 'Tracking' },
      { key: 'mute',          label: 'Mute',           vast: 'Tracking' },
      { key: 'unmute',        label: 'Unmute',         vast: 'Tracking' },
      { key: 'fullscreen',    label: 'Fullscreen',     vast: 'Tracking' },
      { key: 'exitFullscreen', label: 'Exit Fullscreen', vast: 'Tracking' },
      { key: 'playbackRate', label: 'playbackRate', vast: 'Tracking' },
      { key: 'skip',          label: 'Skip',           vast: 'Tracking' },
      { key: 'clickThrough',  label: 'Click Through',  vast: 'ClickThrough' },
      { key: 'clickTracking', label: 'Click Tracking', vast: 'ClickTracking' },
    ],
  },
  {
    label: 'Ошибки',
    events: [
      { key: 'error',         label: 'Error',          vast: 'Error' },
    ],
  },
  {
    label: 'VPAID / Интерактив',
    events: [
      { key: 'AdVideoStart',          label: 'AdVideoStart',          vast: 'Tracking' },
      { key: 'AdVideoFirstQuartile',  label: 'AdVideoFirstQuartile',  vast: 'Tracking' },
      { key: 'AdVideoMidpoint',       label: 'AdVideoMidpoint',       vast: 'Tracking' },
      { key: 'AdVideoThirdQuartile',  label: 'AdVideoThirdQuartile',  vast: 'Tracking' },
      { key: 'AdVideoComplete',       label: 'AdVideoComplete',       vast: 'Tracking' },
      { key: 'AdInteraction',         label: 'AdInteraction',         vast: 'Tracking' },
      { key: 'AdExpandedChange',      label: 'AdExpandedChange',      vast: 'Tracking' },
      { key: 'AdUserMinimize',        label: 'AdUserMinimize',        vast: 'Tracking' },
      { key: 'AdUserClose',           label: 'AdUserClose',           vast: 'Tracking' },
    ],
  },
];

const ALL_EVENTS_FLAT = EVENT_GROUPS.flatMap(g => g.events);

/**
 * Значение атрибута event у &lt;Tracking&gt; → канонический ключ из EVENT_GROUPS.
 * Иначе разный регистр (например PlaybackRate vs playbackRate) даёт отдельные ключи в eventMap и в схеме «не задан».
 */
function canonicalTrackingEventName(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return t;
  const lower = t.toLowerCase();
  for (const def of ALL_EVENTS_FLAT) {
    if (def.key.toLowerCase() === lower) return def.key;
  }
  return t;
}

/**
 * В VAST Linear трекеры задаются как &lt;Tracking event="start|firstQuartile|…"&gt;,
 * а VPAID 2.0 шлёт AdVideoStart / AdVideoFirstQuartile / … — те же этапы, разные имена.
 * AdImpression в плеере соответствует &lt;Impression&gt; в XML.
 */
/** @type {Record<string, string>} */
const VPAID_EVENT_TO_VAST_KEY = {
  AdVideoStart: 'start',
  AdVideoFirstQuartile: 'firstQuartile',
  AdVideoMidpoint: 'midpoint',
  AdVideoThirdQuartile: 'thirdQuartile',
  AdVideoComplete: 'complete',
  AdImpression: 'Impression',
};

/** URL из eventMap: прямой ключ VPAID или эквивалент из VAST (Linear / Impression). */
function vastEventMapUrls(/** @type {Record<string, string[]>|undefined} */ em, /** @type {string} */ vpaidKey) {
  if (!em) return [];
  const direct = em[vpaidKey];
  if (direct && direct.length) return direct;
  const vastKey = VPAID_EVENT_TO_VAST_KEY[vpaidKey];
  return vastKey && em[vastKey] ? em[vastKey] : [];
}

/** Линейные медиа: VPAID vs обычное видео (та же логика везде). */
function isVpaidLike(file) {
  return file.api?.toLowerCase() === 'vpaid' || /vpaid/i.test(file.type || '');
}

function getMediaBuckets(mediaFiles = []) {
  const linearFiles = mediaFiles.filter(m => m.kind === 'media');
  const vpaidFiles = linearFiles.filter(isVpaidLike);
  const videoFiles = linearFiles.filter(m => !isVpaidLike(m));
  return {
    linearFiles,
    vpaidFiles,
    videoFiles,
    interactives: mediaFiles.filter(m => m.kind === 'interactive'),
    nonLinears: mediaFiles.filter(m => m.kind === 'nonlinear'),
  };
}

/** В Linear только VPAID (нет отдельного video MediaFile): Impression / Linear Tracking часто зашиты в vpaid.js, не в VAST. */
function isVpaidOnlyLinearCreative(mediaFiles) {
  const { vpaidFiles, videoFiles } = getMediaBuckets(mediaFiles || []);
  return vpaidFiles.length > 0 && videoFiles.length === 0;
}

let _nativeHlsCached;
/** Нативный HLS (Safari / iOS и часть WebView). */
function browserSupportsNativeHls() {
  if (_nativeHlsCached !== undefined) return _nativeHlsCached;
  const v = document.createElement('video');
  _nativeHlsCached = v.canPlayType('application/vnd.apple.mpegurl') !== ''
    || v.canPlayType('application/x-mpegURL') !== '';
  return _nativeHlsCached;
}

/**
 * Классификация линейного MediaFile для UI и выбора источника.
 * @param {{ url?: string, type?: string }} file
 */
function classifyLinearMediaFile(file) {
  const type = (file.type || '').toLowerCase();
  const url = (file.url || '').toLowerCase();
  const ext = (url.match(/\.([\w]+)(\?|#|$)/) || [])[1] || '';

  const isHls = /mpegurl|x-mpegurl|vnd\.apple\.mpegurl/i.test(type)
    || ext === 'm3u8' || /\.m3u8(\?|#|$)/i.test(url);
  const isMp4 = /mp4|avc1|iso\.avc|iso\.mp4|video\/mp4/i.test(type) || ext === 'mp4' || ext === 'm4v';
  const isWebm = /webm|vp8|vp9|video\/webm/i.test(type) || ext === 'webm';
  const isOgg = /ogg|theora|dirac|video\/ogg|audio\/ogg/i.test(type) || ext === 'ogv' || ext === 'ogg';
  const isMov = /quicktime|video\/quicktime|video\/mov/i.test(type) || ext === 'mov' || ext === 'qt';
  const isTs = /mp2t|video\/mp2t|video\/ts/i.test(type) || ext === 'ts' || ext === 'mts' || ext === 'm2ts';
  const is3gp = /3gpp|3gp|video\/3gpp/i.test(type) || ext === '3gp' || ext === '3g2';
  const isMkv = /matroska|x-matroska|video\/x-matroska/i.test(type) || ext === 'mkv' || ext === 'mks';
  const isAudio = /^audio\//i.test(type) || /^(mp3|aac|m4a|wav|flac|opus)$/i.test(ext);

  /** @type {string} */
  let formatKey = 'other';
  let formatLabel = (ext || type.split('/').pop() || '?').toUpperCase().slice(0, 8);
  if (isHls) { formatKey = 'hls'; formatLabel = 'HLS'; }
  else if (isMp4) { formatKey = 'mp4'; formatLabel = 'MP4'; }
  else if (isMov) { formatKey = 'mov'; formatLabel = 'MOV'; }
  else if (isWebm) { formatKey = 'webm'; formatLabel = 'WEBM'; }
  else if (isOgg) { formatKey = 'ogg'; formatLabel = 'OGG'; }
  else if (isTs) { formatKey = 'ts'; formatLabel = 'MPEG-TS'; }
  else if (is3gp) { formatKey = 'threegp'; formatLabel = '3GP'; }
  else if (isMkv) { formatKey = 'mkv'; formatLabel = 'MKV'; }
  else if (isAudio) { formatKey = 'audio'; formatLabel = 'AUDIO'; }

  let playRank = 60;
  if (isMp4) playRank = 0;
  else if (isHls && browserSupportsNativeHls()) playRank = 2;
  else if (isMov) playRank = 4;
  else if (isWebm) playRank = 5;
  else if (isOgg) playRank = 6;
  else if (isAudio) playRank = 8;
  else if (isHls) playRank = 45;
  else if (is3gp) playRank = 48;
  else if (isTs) playRank = 52;
  else if (isMkv) playRank = 55;
  else playRank = 30;

  return {
    formatKey, formatLabel, isHls, isMp4, isWebm, isOgg, isMov, isTs, is3gp, isMkv, isAudio, playRank,
  };
}

/**
 * @param {{ url?: string, type?: string }} file
 * @param {ReturnType<typeof classifyLinearMediaFile>} c
 */
function isProbablyPlayableInBrowser(file, c) {
  if (isVpaidLike(file)) return false;
  if (c.formatKey === 'mp4' || c.formatKey === 'webm' || c.formatKey === 'ogg') return true;
  if (c.formatKey === 'mov') return true;
  if (c.formatKey === 'audio') return true;
  if (c.formatKey === 'hls') return browserSupportsNativeHls();
  if (c.formatKey === 'mkv' || c.formatKey === 'ts' || c.formatKey === 'threegp') return false;
  return true;
}

/** @param {Array<{ url?: string, type?: string }>} videoFiles */
function pickBestLinearVideoFile(videoFiles) {
  if (!videoFiles.length) return null;
  const rows = videoFiles.map(file => ({ file, cls: classifyLinearMediaFile(file) }))
    .sort((a, b) => a.cls.playRank - b.cls.playRank);
  const hit = rows.find(r => isProbablyPlayableInBrowser(r.file, r.cls));
  return hit || rows[0];
}

/** Список вариантов для селектора плеера (обновляется в initPlayer). */
let playerVideoFileList = [];

const COPY_URL_BTN_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

/** Макс. строк в ленте событий (защита от раздувания DOM при длинном просмотре). */
const PLAYER_FEED_MAX_ENTRIES = 150;

const PLAYER_FEED_EMPTY_HTML = `<div class="player-feed-empty" id="player-feed-empty">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    Запустите воспроизведение
  </div>`;

// ─── Tracker colour map ───────────────────────────────────────────────────────
const TRACKER_COLORS = {
  impression:    '#ff3d3a',
  tracking:      '#00c47a',
  error:         '#e89a00',
  clickthrough:  '#9b7ee0',
  clicktracking: '#9b7ee0',
  other:         '#6870a0',
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
/** @param {string} id @returns {HTMLElement} */
function chk$(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`ZiChecker: элемент #${id} не найден`);
  return el;
}

const chkBtnParse    = chk$('chk-btn-parse');
const chkBtnClear    = chk$('chk-btn-clear');
const chkResults     = chk$('chk-results');
const chkSummary     = chk$('chk-summary');
const chkValBar      = chk$('chk-val-bar');
const chkFlow        = chk$('chk-flow');

/** Узлы схемы событий по data-event — без querySelector при каждой записи в ленту */
let flowNodeByEvent = new Map();

function rebuildFlowNodeCache() {
  flowNodeByEvent.clear();
  if (!chkFlow) return;
  chkFlow.querySelectorAll('[data-event]').forEach((el) => {
    const k = el.getAttribute('data-event');
    if (k) flowNodeByEvent.set(k, el);
  });
}
const chkTrackerList = chk$('chk-tracker-list');
const chkTrackerCount= chk$('chk-tracker-count');
const chkMediaList       = chk$('chk-media-list');
const chkMediaCount      = chk$('chk-media-count');
const chkDiagResult      = chk$('chk-diag-result');
const chkComplianceList  = chk$('chk-compliance-list');
const chkComplianceCount = chk$('chk-compliance-count');

// Mode switching
const chkModeUrl  = chk$('chk-mode-url');
const chkModeXml  = chk$('chk-mode-xml');
const chkUrlInput = /** @type {HTMLInputElement} */ (chk$('chk-url-input'));
const chkXmlInput = /** @type {HTMLTextAreaElement} */ (chk$('chk-xml-input'));
const chkXmlFormatBtn = chk$('chk-xml-format');
const chkXmlValidateBtn = chk$('chk-xml-validate');
const chkXmlStatus = chk$('chk-xml-status');
const chkSpecBody = chk$('chk-spec-body');

const vpaidPanel = chk$('player-vpaid-panel');
const vpaidSandboxFrame = /** @type {HTMLIFrameElement} */ (chk$('vpaid-sandbox-frame'));
const vpaidSandboxWrap = chk$('vpaid-sandbox-wrap');
const adfoxYandexWrap = chk$('adfox-yandex-wrap');
const adfoxYandexVideo = /** @type {HTMLVideoElement} */ (chk$('adfox-yandex-video'));
const adfoxYandexVideoParent = chk$('adfox-yandex-video-parent');
const vpaidStatus = chk$('vpaid-status');
const vpaidInteractiveMounts = document.getElementById('vpaid-interactive-mounts');
const vpaidToggleMountsBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('vpaid-toggle-mounts-btn'));
const vpaidReloadBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('vpaid-reload-btn'));
const vpaidDeferredLoadRow = document.getElementById('vpaid-deferred-load-row');
const vpaidDeferredLoadBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('vpaid-deferred-load-btn'));
const vpaidMountFullscreenBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('vpaid-mount-fullscreen-btn'));

/** @type {Promise<void> | null} */
let yandexAdsdkLoadPromise = null;
/** @type {any} */
let yandexAdViewer = null;
/** @type {any} */
let yandexAdPlaybackController = null;
/** @type {null | (() => void)} */
let yandexAdVideoDomCleanup = null;

/** URL для click: в VAST и ClickThrough, и ClickTracking — как у основного плеера */
function vastClickUrlsForFeed(/** @type {any} */ vd) {
  if (!vd || !vd.eventMap) return [];
  const a = vd.eventMap.clickThrough || [];
  const b = vd.eventMap.clickTracking || [];
  return [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean);
}

/**
 * Pause / resume по &lt;video&gt; (как у основного плеера). ClickThrough не вешаем на контейнер:
 * у Yandex Ad SDK своя панель в родителе — клики по громкости/паузе не отличить от «перехода».
 * Реальный переход — только по событию SDK AdClickThrough (см. loadYandexVastAdPlayback).
 */
function attachYandexAdVideoDomFeedListeners() {
  const vid = adfoxYandexVideo;
  try {
    if (yandexAdVideoDomCleanup) {
      yandexAdVideoDomCleanup();
      yandexAdVideoDomCleanup = null;
    }
  } catch { /* ignore */ }

  let firstPlay = true;
  let paused = false;

  const onPause = () => {
    paused = true;
    if (vastData) addFeedEntry('pause', 'pause', vastData.eventMap.pause || []);
  };
  const onPlay = () => {
    if (firstPlay) {
      firstPlay = false;
      return;
    }
    if (paused) {
      paused = false;
      if (vastData) addFeedEntry('resume', 'resume', vastData.eventMap.resume || []);
    }
  };

  vid.addEventListener('pause', onPause);
  vid.addEventListener('play', onPlay);

  yandexAdVideoDomCleanup = () => {
    vid.removeEventListener('pause', onPause);
    vid.removeEventListener('play', onPlay);
  };
}

/** Как в https://banners.adfox.ru/files/vast_checker.html — загрузка adsdk.js */
function ensureYandexAdsdkLoaded() {
  if (typeof window !== 'undefined' && /** @type {any} */ (window).ya?.videoAd) return Promise.resolve();
  if (yandexAdsdkLoadPromise) return yandexAdsdkLoadPromise;
  yandexAdsdkLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.charset = 'utf-8';
    s.async = true;
    s.src = 'https://yandex.ru/ads/system/adsdk.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Не удалось загрузить https://yandex.ru/ads/system/adsdk.js'));
    document.head.appendChild(s);
  });
  return yandexAdsdkLoadPromise;
}

function destroyYandexAdPlayback() {
  try {
    if (yandexAdVideoDomCleanup) {
      yandexAdVideoDomCleanup();
      yandexAdVideoDomCleanup = null;
    }
  } catch { /* ignore */ }
  try {
    if (yandexAdPlaybackController && typeof yandexAdPlaybackController.destroy === 'function') {
      yandexAdPlaybackController.destroy();
    }
  } catch { /* ignore */ }
  yandexAdPlaybackController = null;
  try {
    if (yandexAdViewer && typeof yandexAdViewer.destroy === 'function') {
      yandexAdViewer.destroy();
    }
  } catch { /* ignore */ }
  yandexAdViewer = null;
}

/** Минимальные параметры UI; полный пример — vast_checker Adfox */
const DEFAULT_YANDEX_PLAYBACK_PARAMS = {
  controlsSettings: {
    visibility: true,
    controlsVisibility: {
      skip: true,
      mute: true,
      timeline: true,
      adLabel: true,
      play: true,
      pause: true,
    },
  },
};

/**
 * VPAID через Yandex AdLoader (не iframe): весь VAST — vastUrl или vast XML.
 * @see https://banners.adfox.ru/files/vast_checker.html
 */
async function loadYandexVastAdPlayback() {
  try {
  destroyYandexAdPlayback();
  try { vpaidSandboxFrame.src = 'about:blank'; } catch { /* ignore */ }
  try {
    vpaidSandboxFrame.srcdoc = '';
    vpaidSandboxFrame.removeAttribute('srcdoc');
  } catch { /* ignore */ }
  vpaidSandboxWrap.classList.add('hidden');
  vpaidSandboxWrap.setAttribute('aria-hidden', 'true');
  revokeVpaidBlobIfAny();
  vpaidLastLoadContext = null;

  adfoxYandexWrap.classList.remove('hidden');
  adfoxYandexWrap.setAttribute('aria-hidden', 'false');

  const videoTimeout = 15000;
  /** @type {Record<string, unknown>} */
  let adConfig;
  if (chkMode === 'url' && lastChkVastPageUrl && String(lastChkVastPageUrl).trim()) {
    adConfig = {
      vastUrl: String(lastChkVastPageUrl).trim(),
      adBreakType: 'preroll',
      videoTimeout,
    };
  } else {
    const vast = getXmlText().trim();
    if (!vast || (!/\<VAST[\s>]/i.test(vast) && !/\<vast[\s>]/i.test(vast))) {
      vpaidStatus.textContent = 'Нет VAST в редакторе: выполните «Анализировать» по URL или вставьте XML.';
      return;
    }
    adConfig = {
      vast,
      adBreakType: 'preroll',
      videoTimeout,
    };
  }

  vpaidStatus.textContent = 'Загрузка Yandex Ad SDK…';
  try {
    await ensureYandexAdsdkLoaded();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    vpaidStatus.textContent = msg;
    return;
  }

  const ya = /** @type {any} */ (window).ya;
  if (!ya || !ya.videoAd || typeof ya.videoAd.loadModule !== 'function') {
    vpaidStatus.textContent = 'После загрузки скрипта ya.videoAd недоступен (блокировка сети или расширение).';
    return;
  }

  vpaidStatus.textContent = 'AdLoader: загрузка объявления…';

  try {
    const module = await ya.videoAd.loadModule('AdLoader');
    const adLoader = await module.AdLoader.create(adConfig);
    const adViewer = await adLoader.loadAd();
    yandexAdViewer = adViewer;

    const adPlaybackController = adViewer.createPlaybackController(
      adfoxYandexVideo,
      adfoxYandexVideoParent,
      DEFAULT_YANDEX_PLAYBACK_PARAMS,
    );
    yandexAdPlaybackController = adPlaybackController;

    const sdkFeed = [
      ['AdStarted', 'AdStarted'],
      ['AdPodStarted', 'AdPodStarted'],
      ['AdPodVideoFirstQuartile', 'AdPodVideoFirstQuartile'],
      ['AdPodVideoMidpoint', 'AdPodVideoMidpoint'],
      ['AdPodVideoThirdQuartile', 'AdPodVideoThirdQuartile'],
      ['AdPodStopped', 'AdPodStopped'],
      ['AdStopped', 'AdStopped'],
      ['AdPodImpression', 'AdPodImpression'],
      ['AdPodSkipped', 'AdPodSkipped'],
      ['AdVolumeChange', 'AdVolumeChange'],
      ['AdPaused', 'AdPaused'],
      ['AdResumed', 'AdResumed'],
      ['AdPlaying', 'AdPlaying'],
      ['AdClicked', 'AdClicked'],
      ['AdUserInteraction', 'AdUserInteraction'],
    ];
    sdkFeed.forEach(([ev, feedKey]) => {
      try {
        adPlaybackController.subscribe(ev, () => {
          vpaidStatus.textContent = `Yandex Ad SDK: ${ev}`;
          if (vastData) addFeedEntry(feedKey, ev, null);
        });
      } catch { /* ignore */ }
    });
    try {
      adPlaybackController.subscribe('AdClickThrough', () => {
        vpaidStatus.textContent = 'Yandex Ad SDK: AdClickThrough';
        if (!vastData) return;
        const urls = vastClickUrlsForFeed(vastData);
        addFeedEntry('clickThrough', 'AdClickThrough', urls.length ? urls : (vastData.eventMap.clickThrough || []));
      });
    } catch { /* ignore */ }
    try {
      adPlaybackController.subscribe('AdError', (/** @type {any} */ err) => {
        const t = err && (err.message || err.code) ? String(err.message || err.code) : 'AdError';
        vpaidStatus.textContent = `Yandex Ad SDK: AdError — ${t}`;
        if (vastData) addFeedEntry('error', t, null);
      });
    } catch { /* ignore */ }

    adPlaybackController.playAd();
    attachYandexAdVideoDomFeedListeners();
    vpaidStatus.textContent = 'Yandex Ad SDK: реклама запущена (без принудительной паузы — иначе ломается логика части креативов).';
  } catch (err) {
    const e = /** @type {any} */ (err);
    const t = e && e.message != null ? String(e.message) : String(err);
    const code = e && e.code != null ? String(e.code) : '';
    vpaidStatus.textContent = code ? `AdLoader: ${t} [${code}]` : `AdLoader: ${t}`;
    console.error(err);
  }
  } finally {
    refreshVpaidMountFullscreenBtn();
  }
}

/** @type {any} */
let xmlCm = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let xmlCmResizeRefreshTimer;

/**
 * CodeMirror 5 не перерисовывается, если при setValue или init контейнер был с display:none
 * (свёрнут XML, другая вкладка). Двойной rAF — после применения layout.
 */
function scheduleXmlCmRefresh() {
  if (!xmlCm) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try { xmlCm.refresh(); } catch { /* ignore */ }
    });
  });
}

function getXmlText() {
  return xmlCm ? xmlCm.getValue() : chkXmlInput.value;
}

function setXmlText(/** @type {string} */ s) {
  if (xmlCm) {
    xmlCm.setValue(s);
    scheduleXmlCmRefresh();
  } else chkXmlInput.value = s;
}

function initXmlCodeEditor() {
  if (typeof CodeMirror === 'undefined') return;
  xmlCm = CodeMirror.fromTextArea(chkXmlInput, {
    mode: 'xml',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    indentUnit: 2,
    viewportMargin: 80,
    extraKeys: {
      'Cmd-Enter': () => { doChkParse(); },
      'Ctrl-Enter': () => { doChkParse(); },
      Tab: (cm) => { cm.replaceSelection('  ', 'end'); },
    },
  });
  xmlCm.on('paste', () => setTimeout(() => doChkParse(), 80));
  try {
    new MutationObserver(() => { if (xmlCm) xmlCm.refresh(); }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  } catch { /* ignore */ }

  const xmlWrap = document.getElementById('chk-xml-wrap');
  if (xmlWrap && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (!xmlCm) return;
      clearTimeout(xmlCmResizeRefreshTimer);
      xmlCmResizeRefreshTimer = setTimeout(() => {
        try { xmlCm.refresh(); } catch { /* ignore */ }
      }, 32);
    }).observe(xmlWrap);
  }

  scheduleXmlCmRefresh();
}

let chkMode = 'url'; // 'url' | 'xml'

function switchChkMode(mode) {
  chkMode = mode;
  chkModeUrl.classList.toggle('active', mode === 'url');
  chkModeXml.classList.toggle('active', mode === 'xml');
  if (mode === 'xml') lastChkVastPageUrl = '';
  const block = document.querySelector('#panel-zichecker .chk-input-block');
  if (block instanceof HTMLElement) {
    block.classList.toggle('chk-mode-is-url', mode === 'url');
    block.classList.toggle('chk-mode-is-xml', mode === 'xml');
  }
  const hint = document.getElementById('chk-mode-hint');
  if (hint) {
    hint.textContent = mode === 'url'
      ? '«Анализировать» загружает VAST по URL выше и подставляет ответ в XML ниже (блок XML можно свернуть).'
      : 'Режим только XML: вставьте VAST в редактор ниже и нажмите «Анализировать» (поле URL скрыто).';
  }
}

chkModeUrl.addEventListener('click', () => switchChkMode('url'));
chkModeXml.addEventListener('click', () => switchChkMode('xml'));
switchChkMode('url');

const CHK_XML_COLLAPSE_KEY = 'zitag_chk_xml_collapsed_v1';
const chkXmlPanel = document.getElementById('chk-xml-panel');
const chkXmlToggle = document.getElementById('chk-xml-toggle');
const chkXmlPanelBody = document.getElementById('chk-xml-panel-body');

function applyChkXmlCollapsed(collapsed) {
  if (!chkXmlPanel || !chkXmlToggle || !chkXmlPanelBody) return;
  chkXmlPanel.classList.toggle('is-collapsed', collapsed);
  chkXmlToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const label = chkXmlToggle.querySelector('.chk-xml-toggle-text');
  if (label instanceof HTMLElement) label.textContent = collapsed ? 'Показать XML' : 'Свернуть';
  try { localStorage.setItem(CHK_XML_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch {}
  if (!collapsed) scheduleXmlCmRefresh();
}

if (chkXmlToggle instanceof HTMLElement && chkXmlPanel instanceof HTMLElement) {
  let startCollapsed = false;
  try { startCollapsed = localStorage.getItem(CHK_XML_COLLAPSE_KEY) === '1'; } catch {}
  applyChkXmlCollapsed(startCollapsed);
  chkXmlToggle.addEventListener('click', () => {
    applyChkXmlCollapsed(!chkXmlPanel.classList.contains('is-collapsed'));
  });
}

// ─── Диагностика HTTP-ответа при загрузке VAST ────────────────────────────────
/**
 * @param {number} status
 * @param {string} contentType
 * @param {string} body
 * @param {(level:'error'|'warn'|'info', msg:string) => void} push
 * @param {string} prefix — метка источника (прямой запрос / прокси / Wrapper N)
 */
function analyzeVastHttpResponse(status, contentType, body, push, prefix) {
  const t = body.trim();
  if (!t) {
    push('error', `${prefix}: пустой ответ сервера`);
    return;
  }
  if (status >= 500) push('error', `${prefix}: HTTP ${status} — ошибка на стороне рекламного сервера`);
  else if (status === 429) push('warn', `${prefix}: HTTP 429 (rate limit) — возможны отказы при частых запросах`);
  else if (status >= 400) push('error', `${prefix}: HTTP ${status} — VAST недоступен по этому URL`);
  else if (status >= 300 && status !== 304) push('warn', `${prefix}: HTTP ${status} (редирект) — убедитесь, что конечный URL стабилен для плеера`);

  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  if (ct.includes('json')) push('error', `${prefix}: ответ с Content-Type JSON — ожидался XML/VAST`);
  else if (ct && !/xml|text\/plain|text\/html|application\/octet-stream/.test(ct)) {
    push('warn', `${prefix}: нестандартный Content-Type (${ct}) — по IAB обычно application/xml или text/xml`);
  }

  const head = t.slice(0, 2500);
  if (/^<!DOCTYPE\s+html/i.test(t) || /^<\s*html[\s>]/i.test(t)) {
    push('error', `${prefix}: в ответе HTML-страница, а не VAST (часто логин, CAPTCHA или 404)`);
  }
  if (/^<\?xml/i.test(t) === false && !/<VAST[\s>/]/i.test(head)) {
    push('warn', `${prefix}: нет ни XML-декларации, ни корня VAST в начале ответа`);
  }
  if (!/<VAST[\s>]/i.test(t.slice(0, 8000))) {
    push('warn', `${prefix}: тег <VAST> не найден в первых 8 КБ — возможно неверный endpoint или обёртка`);
  }
  if (t.startsWith('{') && /"(errors?|error_code|fault|message|status)"/i.test(t.slice(0, 1200))) {
    push('warn', `${prefix}: тело похоже на JSON-ошибку API вместо VAST`);
  }
}

/** Убирает BOM, мешающий парсеру XML. */
function stripUtf8Bom(/** @type {string} */ s) {
  return String(s).replace(/^\uFEFF/, '');
}

/** Пространство имён Word 2003 XML (текст креатива часто режется по &lt;w:t&gt; с экранированным VAST внутри). */
const WORDML_2003_NS = 'http://schemas.microsoft.com/office/word/2003/wordml';

/**
 * Извлекает склеенный VAST из «Word XML» (.xml из «Сохранить как Word 2003 XML» и аналогов):
 * в узлах w:t лежит текст с &lt;VAST…&gt;; в DOM он уже декодирован в угловые скобки.
 * NBSP (U+00A0) между токенами разметки заменяем на обычный пробел — иначе XML 1.0 не считает его пробельным.
 * @returns {string|null}
 */
function tryExtractVastFromWordMl(/** @type {string} */ raw) {
  const s = String(raw);
  if (!/<\s*w:wordDocument\b/i.test(s) && !/schemas\.microsoft\.com\/office\/word\/2003\/wordml/i.test(s)) return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(s.trim(), 'text/xml');
  } catch {
    return null;
  }
  if (doc.querySelector('parsererror')) return null;
  const nodes = doc.getElementsByTagNameNS(WORDML_2003_NS, 't');
  if (!nodes.length) return null;
  let out = '';
  for (let i = 0; i < nodes.length; i++) out += nodes[i].textContent || '';
  const trimmed = out.replace(/\u00A0/g, ' ').trim();
  if (!/<VAST[\s>]/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Вырезает документ VAST из произвольного текста (например .txt / text/plain с префиксом или комментарием до XML).
 * VMAP (корень vmap:VMAP / VMAP с вложенным VAST): нельзя начинать с &lt;?xml и обрезать по &lt;/VAST&gt; — остаются незакрытые теги VMAP, XML невалиден.
 * Поэтому при наличии &lt;VAST&gt; всегда берём фрагмент от первого &lt;VAST до последнего &lt;/VAST&gt; в этом срезе.
 * @returns {string|null} well-formed фрагмент VAST или хвост с &lt;?xml без VAST, либо null
 */
function extractVastXmlFromText(/** @type {string} */ raw) {
  const t0 = stripUtf8Bom(String(raw));
  const fromWord = tryExtractVastFromWordMl(t0);
  const t = fromWord != null ? fromWord : t0;
  const vastIdx = t.search(/<VAST[\s>]/i);
  if (vastIdx !== -1) {
    const slice = t.slice(vastIdx);
    const re = /<\/VAST\s*>/gi;
    let m;
    let end = -1;
    while ((m = re.exec(slice)) !== null) end = m.index + m[0].length;
    if (end === -1) return slice.trimEnd();
    return slice.slice(0, end).trim();
  }
  const declIdx = t.search(/<\?xml\s/i);
  if (declIdx !== -1) return t.slice(declIdx).trimEnd();
  return null;
}

/**
 * Тело ответа для редактора: только BOM и trim — без обрезания до &lt;VAST&gt;.
 * Для разбора используйте {@link extractVastXmlFromText} внутри {@link parseVAST}.
 * @returns {{ text: string, hadLeadingJunk: boolean }}
 */
function normalizeVastResponseText(/** @type {string} */ raw) {
  const t0 = stripUtf8Bom(String(raw)).trim();
  return { text: t0, hadLeadingJunk: false };
}

/**
 * Загрузка VAST по URL с накоплением замечаний в loadIssues (для цепочки Wrapper).
 * @param {string} url
 * @param {Array<{level:string,msg:string}>} [loadIssues]
 * @param {string} [label]
 * @returns {Promise<string>}
 */
async function fetchVASTXmlWithDiagnostics(url, loadIssues = [], label = 'Загрузка VAST') {
  const push = (/** @type {'error'|'warn'|'info'} */ level, msg) => {
    loadIssues.push({ level, msg });
  };

  try {
    const resp = await fetch(url, { cache: 'no-store' });
    const ct = resp.headers.get('content-type') || '';
    const raw = await resp.text();
    if (/<\s*vmap\s*:\s*VMAP\b/i.test(raw) || /<VMAP[\s>]/i.test(raw)) {
      push('info', `${label}: ответ VMAP — для разбора извлекается вложенный VAST`);
    }
    const { text } = normalizeVastResponseText(raw);
    analyzeVastHttpResponse(resp.status, ct, text, push, label);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push('info', `${label}: прямой запрос недоступен (${msg}) — пробуем прокси allorigins`);
    try {
      const r2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      const json = await r2.json();
      const bodyRaw = json && typeof json.contents === 'string' ? json.contents : '';
      if (!bodyRaw.trim()) throw new Error('Прокси вернул пустой ответ');
      if (/<\s*vmap\s*:\s*VMAP\b/i.test(bodyRaw) || /<VMAP[\s>]/i.test(bodyRaw)) {
        push('info', `${label} (прокси): ответ VMAP — для разбора извлекается вложенный VAST`);
      }
      const { text: body } = normalizeVastResponseText(bodyRaw);
      analyzeVastHttpResponse(r2.ok ? 200 : r2.status, 'text/plain', body, push, `${label} (прокси)`);
      return body;
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(msg2);
    }
  }
}

/** @param {string} s */
function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * @param {Element} el
 * @param {number} depth
 */
function serializeXmlElement(el, depth) {
  const pad = '  '.repeat(depth);
  const name = el.tagName;
  const attrs = [...el.attributes].map(a => ` ${a.name}="${escapeXmlAttr(a.value)}"`).join('');
  const childEls = [...el.childNodes].filter(n => n.nodeType === Node.ELEMENT_NODE);
  const textBits = [...el.childNodes].filter(n => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim().length > 0;
    if (n.nodeType === Node.CDATA_SECTION_NODE) return true;
    return false;
  });
  if (!childEls.length && !textBits.length) return `${pad}<${name}${attrs}/>\n`;
  let inner = '';
  for (const n of el.childNodes) {
    if (n.nodeType === Node.ELEMENT_NODE) inner += serializeXmlElement(/** @type {Element} */(n), depth + 1);
    else if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) inner += `${pad}  ${t}\n`;
    } else if (n.nodeType === Node.CDATA_SECTION_NODE) {
      inner += `${pad}  <![CDATA[${n.textContent}]]>\n`;
    }
  }
  return `${pad}<${name}${attrs}>\n${inner}${pad}</${name}>\n`;
}

/** Форматирует VAST/XML с отступами (только well-formed). */
function formatVastXml(xmlStr) {
  const trimmed = xmlStr.trim();
  const fromWord = tryExtractVastFromWordMl(trimmed);
  const toParse = fromWord != null ? extractVastXmlFromText(fromWord) || fromWord : trimmed;
  const doc = new DOMParser().parseFromString(toParse, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Невалидный XML');
  const root = doc.documentElement;
  if (!root) throw new Error('Пустой документ');
  const decl = toParse.match(/^<\?xml[\s\S]*?\?>\s*/i);
  const body = serializeXmlElement(root, 0);
  return (decl ? decl[0].trimEnd() + '\n' : '') + body;
}

/** @param {Document} doc @param {string} declaredVersion */
function buildVastProfile(doc, declaredVersion) {
  const numeric = parseFloat(String(declaredVersion).replace(',', '.')) || 0;
  const qa = (sel) => doc.querySelectorAll(sel);

  const counts = {
    ads: qa('Ad').length,
    creatives: qa('Creative').length,
    linear: qa('Linear').length,
    mediaFiles: qa('MediaFile').length,
    tracking: qa('Tracking').length,
    impression: qa('Impression').length,
    errorUrls: qa('Error').length,
    nonlinearAds: qa('NonLinearAds').length,
    companions: qa('Companion').length,
    companionAds: qa('CompanionAds').length,
    icons: qa('Icon').length,
    extensions: qa('Extensions Extension').length,
  };

  const has = {
    wrapper: !!doc.querySelector('Wrapper'),
    inline: !!doc.querySelector('InLine'),
    adVerifications: !!doc.querySelector('AdVerifications'),
    verification: !!doc.querySelector('Verification'),
    universalAdId: !!doc.querySelector('UniversalAdId'),
    adServingId: !!doc.querySelector('AdServingId'),
    pricing: !!doc.querySelector('Pricing'),
    mezzanine: !!doc.querySelector('Mezzanine'),
    interactiveCreativeFile: !!doc.querySelector('InteractiveCreativeFile'),
    blockedAdCategories: !!doc.querySelector('BlockedAdCategories'),
    viewableImpression: !!doc.querySelector('ViewableImpression'),
    adParameters: !!doc.querySelector('AdParameters'),
    skipOffset: !!doc.querySelector('Linear[skipoffset]'),
  };

  const notes = [];
  const add = (/** @type {'info'|'warn'} */ level, title, detail) => notes.push({ level, title, detail });

  if (numeric > 0 && numeric < 2) add('warn', 'VAST 1.x', 'Устаревшая версия; ожидайте отказ у большинства SSP/плееров.');
  if (numeric >= 2 && numeric < 3) add('info', 'VAST 2.x', 'Нет обязательного skip в спецификации 3.0+; часть событий может отличаться.');
  if (numeric >= 3 && numeric < 4) add('info', 'VAST 3.x', 'Актуально для большинства интеграций; для OMID/расширенной верификации смотрите 4.x.');

  if (has.adVerifications && numeric > 0 && numeric < 4) {
    add('warn', 'AdVerifications при version < 4', 'Блок из VAST 4.x; строгие SDK могут игнорировать или ломать разбор.');
  }
  if (has.mezzanine && numeric > 0 && numeric < 4) add('warn', 'Mezzanine', 'Поле введено в VAST 4.x; при меньшей версии в атрибуте — несоответствие спецификации.');
  if (has.interactiveCreativeFile && numeric > 0 && numeric < 4) {
    add('info', 'InteractiveCreativeFile', 'SIMID/интерактив в типичном виде для VAST 4.x.');
  }
  if (has.universalAdId && numeric > 0 && numeric < 4) add('info', 'UniversalAdId', 'Распространён в VAST 4.x для идентификации креатива.');
  if (numeric >= 4 && counts.linear > 0 && !has.universalAdId) {
    add('info', 'UniversalAdId', 'В VAST 4.x рекомендуется уникальный идентификатор креатива (Creative/UniversalAdId).');
  }
  if (has.skipOffset && numeric > 0 && numeric < 3) {
    add('warn', 'skipoffset', 'Атрибут Linear skipoffset формализован в VAST 3.0; при объявленной 2.x возможны расхождения.');
  }

  let inferredHint = '';
  const score4 = (has.adVerifications ? 2 : 0) + (has.adServingId ? 1 : 0) + (has.mezzanine ? 1 : 0)
    + (has.universalAdId ? 1 : 0) + (has.interactiveCreativeFile ? 1 : 0);
  const score3 = (has.skipOffset ? 1 : 0) + (has.viewableImpression ? 1 : 0);
  if (numeric >= 4 && score4 === 0 && counts.linear > 0) inferredHint = 'Разметка минимальная для заявленной 4.x — без типичных элементов 4.0+.';
  else if (numeric > 0 && numeric < 4 && score4 >= 2) inferredHint = 'По элементам документ ближе к VAST 4.x, чем к объявленной версии.';
  else if (numeric > 0 && numeric < 3 && score3 >= 1) inferredHint = 'Есть признаки VAST 3.x (skip/viewable) при более низкой объявленной версии.';

  return {
    declared: declaredVersion,
    numeric,
    counts,
    has,
    notes,
    inferredHint,
  };
}

/**
 * SSP (в т.ч. Яндекс) иногда передают MP4/HLS/WebM в JSON внутри &lt;AdParameters&gt;,
 * а в &lt;MediaFile&gt; оставляют только VPAID-loader.
 * Поддерживаются массивы <code>mediaFiles</code> и <code>videos</code> (как у MediaVitrina: mimetype + url).
 * @param {string|null|undefined} raw
 */
function extractLinearMediaFromAdParametersJson(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  /** CDATA часто даёт отступы/переносы до «{» — иначе MP4 из videos[] не мержится и плеер пуст при одном VPAID MediaFile. */
  let slice = trimmed;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const iBrace = trimmed.indexOf('{');
    const iBracket = trimmed.indexOf('[');
    let start = -1;
    if (iBrace >= 0 && iBracket >= 0) start = Math.min(iBrace, iBracket);
    else start = Math.max(iBrace, iBracket);
    if (start < 0) return [];
    slice = trimmed.slice(start);
  }
  let parsed;
  try {
    parsed = JSON.parse(slice);
  } catch {
    const i = slice.indexOf('{');
    const j = slice.lastIndexOf('}');
    if (i < 0 || j <= i) return [];
    try {
      parsed = JSON.parse(slice.slice(i, j + 1));
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const out = [];
  const seen = new Set();

  function pushItem(/** @type {Record<string, unknown>} */ item) {
    if (!item || typeof item !== 'object') return;
    const url = String(item.url || '').trim();
    if (!url || seen.has(url)) return;
    const type = String(
      item.type || item.mimetype || item.mimeType || item.mime || '',
    ).trim();
    const lowType = type.toLowerCase();
    if (lowType.includes('javascript') || /vpaid/i.test(lowType)) return;
    const probe = { url, type, api: String(item.apiFramework || item.api || '').trim(), kind: 'media' };
    if (isVpaidLike(probe)) return;
    seen.add(url);
    out.push({
      url,
      type,
      delivery: String(item.delivery || 'progressive').trim(),
      width: item.width != null && item.width !== '' ? String(item.width) : '',
      height: item.height != null && item.height !== '' ? String(item.height) : '',
      bitrate: item.bitrate != null && item.bitrate !== '' ? String(item.bitrate) : '',
      api: '',
      kind: 'media',
      source: 'adParameters',
    });
  }

  const mf = Array.isArray(parsed.mediaFiles) ? parsed.mediaFiles : null;
  const vids = Array.isArray(parsed.videos) ? parsed.videos : null;
  if (mf) mf.forEach((it) => pushItem(/** @type {Record<string, unknown>} */ (it)));
  if (vids) vids.forEach((it) => pushItem(/** @type {Record<string, unknown>} */ (it)));

  return out;
}

function mergeMediaFileLists(xmlList, fromJson) {
  const seen = new Set(xmlList.map(m => m.url).filter(Boolean));
  const merged = [...xmlList];
  for (const m of fromJson) {
    if (!m.url || seen.has(m.url)) continue;
    seen.add(m.url);
    merged.push(m);
  }
  return merged;
}

// ─── Parse a single VAST XML string ──────────────────────────────────────────
function parseVAST(xmlStr) {
  const raw = String(xmlStr || '');
  const forParse = extractVastXmlFromText(raw) || raw.trim();
  let doc;
  try {
    doc = new DOMParser().parseFromString(forParse.trim(), 'text/xml');
  } catch {
    return { error: 'Ошибка парсинга XML' };
  }
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) return { error: 'Невалидный XML: ' + parseErr.textContent.slice(0, 120) };

  const vastEl = doc.querySelector('VAST');
  if (!vastEl) return { error: 'Элемент <VAST> не найден' };

  const version    = vastEl.getAttribute('version') || '?';
  const inlineEl   = doc.querySelector('InLine');
  const wrapperEl  = doc.querySelector('Wrapper');
  const adType     = inlineEl ? 'InLine' : wrapperEl ? 'Wrapper' : 'Unknown';

  // Wrapper URL
  const wrapperUrl = wrapperEl
    ? (doc.querySelector('VASTAdTagURI')?.textContent?.trim() || null)
    : null;

  const linearEl   = doc.querySelector('Linear');
  const duration   = doc.querySelector('Duration')?.textContent?.trim() || null;
  const skipOffset = linearEl?.getAttribute('skipoffset') || null;
  const adTitle    = doc.querySelector('AdTitle')?.textContent?.trim() || null;
  const adSystem   = doc.querySelector('AdSystem')?.textContent?.trim() || null;
  const adParamsEl = doc.querySelector('Linear AdParameters') || doc.querySelector('Creative AdParameters');
  const adParameters = adParamsEl?.textContent?.trim() || null;

  // ── Event map ──
  const eventMap = {};

  const impressionEls = [...doc.querySelectorAll('Impression')];
  const impressions = impressionEls.map(el => el.textContent.trim()).filter(Boolean);
  if (impressions.length) eventMap['Impression'] = impressions;

  const errors = [...doc.querySelectorAll('Error')].map(el => el.textContent.trim()).filter(Boolean);
  if (errors.length) eventMap['error'] = errors;

  doc.querySelectorAll('Tracking').forEach(el => {
    const evRaw = el.getAttribute('event');
    const url = el.textContent.trim();
    if (!evRaw || !url) return;
    const ev = canonicalTrackingEventName(evRaw);
    if (!eventMap[ev]) eventMap[ev] = [];
    eventMap[ev].push(url);
  });

  const clickThroughs  = [...doc.querySelectorAll('ClickThrough')].map(el => el.textContent.trim()).filter(Boolean);
  if (clickThroughs.length)  eventMap['clickThrough']  = clickThroughs;
  const clickTrackings = [...doc.querySelectorAll('ClickTracking')].map(el => el.textContent.trim()).filter(Boolean);
  if (clickTrackings.length) eventMap['clickTracking'] = clickTrackings;

  // ── Media files (Linear): XML + JSON в AdParameters (частый у VPAID+каталог Яндекса) ──
  const mediaFilesXml = [...doc.querySelectorAll('MediaFile')].map(el => ({
    url:      el.textContent.trim(),
    type:     el.getAttribute('type') || '',
    delivery: el.getAttribute('delivery') || '',
    width:    el.getAttribute('width') || '',
    height:   el.getAttribute('height') || '',
    bitrate:  el.getAttribute('bitrate') || '',
    api:      el.getAttribute('apiFramework') || '',
    kind:     'media',
  }));
  const mediaFromAdParameters = extractLinearMediaFromAdParametersJson(adParameters);
  const mediaFiles = mergeMediaFileLists(mediaFilesXml, mediaFromAdParameters);

  // ── Interactive creative files (VAST 4.x / SIMID) ──
  const interactiveFiles = [...doc.querySelectorAll('InteractiveCreativeFile')].map(el => ({
    url:  el.textContent.trim(),
    type: el.getAttribute('type') || 'text/javascript',
    api:  el.getAttribute('apiFramework') || 'SIMID',
    kind: 'interactive',
  }));

  // ── Non-linear ads ──
  const nonLinears = [...doc.querySelectorAll('NonLinear')].map(el => {
    const staticEl = el.querySelector('StaticResource');
    const htmlEl   = el.querySelector('HTMLResource');
    const iframeEl = el.querySelector('IFrameResource');
    return {
      url:    (staticEl || htmlEl || iframeEl)?.textContent?.trim() || '',
      type:   staticEl?.getAttribute('creativeType') || (htmlEl ? 'html' : 'iframe'),
      width:  el.getAttribute('width') || '',
      height: el.getAttribute('height') || '',
      kind:   'nonlinear',
    };
  });

  const allFiles = [...mediaFiles, ...interactiveFiles, ...nonLinears];

  // ── VPAID detection ──
  const isVPAID = mediaFiles.some(isVpaidLike) || interactiveFiles.length > 0;
  const hasVpaidLinear = mediaFiles.some(isVpaidLike);
  const hasNonVpaidLinear = mediaFiles.some(m => !isVpaidLike(m));
  const vpaidOnlyLinear = hasVpaidLinear && !hasNonVpaidLinear;

  // ── Flat trackers list ──
  const trackers = buildTrackers(eventMap);

  const ads = [...doc.querySelectorAll('Ad')];
  const vastVersionAttr = vastEl.getAttribute('version');
  const durationOk = !duration || /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(duration.trim());

  // ── Validation (IAB VAST + распространённые требования SSP/плееров) ──
  const issues = [];
  if (!vastVersionAttr || vastVersionAttr.trim() === '' || vastVersionAttr === '?') {
    issues.push({ level: 'warn', msg: 'У <VAST> не задан атрибут version — по спецификации IAB он обязателен' });
  }
  if (!ads.length) {
    issues.push({ level: 'error', msg: 'Нет элементов <Ad> — пустой VAST или неверная структура документа' });
  } else if (ads.length > 1) {
    issues.push({ level: 'warn', msg: `Несколько <Ad> (${ads.length}) — многие плееры обрабатывают только первое объявление` });
  }
  if (!impressionEls.length) {
    if (adType === 'InLine' && vpaidOnlyLinear) {
      issues.push({
        level: 'info',
        msg: 'Нет элемента <Impression> в XML — для VPAID-only креатива пиксель показа и метки часто вызываются из vpaid.js (AdImpression и др.); в ленте трекеров URL не будет, пока не отдаёте их в VAST.',
      });
    } else {
      issues.push({ level: 'error', msg: 'Нет элемента <Impression> — по VAST обязателен URL пикселя показа' });
    }
  } else if (!impressions.length) {
    if (adType === 'InLine' && vpaidOnlyLinear) {
      issues.push({
        level: 'info',
        msg: '<Impression> без URL в XML — пустой тег; при VPAID-only показ и события нередко уходят из скрипта плеера. Для явного пикселя в отчётах SSP добавьте URL в <Impression>.',
      });
    } else {
      issues.push({
        level: 'error',
        msg: '<Impression> без URL (пустой тег) — Impression в ленте не к чему привязать; в вашем XML тег есть, CDATA с URL нет',
      });
    }
  }
  if (!errors.length) {
    issues.push({
      level: adType === 'InLine' && vpaidOnlyLinear ? 'info' : 'warn',
      msg: 'Не задан <Error> URL — по IAB рекомендуется для передачи кодов ошибок ([ERRORCODE])',
    });
  }
  if (!eventMap['start']) {
    issues.push({
      level: adType === 'InLine' && vpaidOnlyLinear ? 'info' : 'warn',
      msg: adType === 'InLine' && vpaidOnlyLinear
        ? 'В XML нет трекера start — у VPAID прогресс часто шлётся событиями AdVideoStart / VPAID из vpaid.js, а не <Tracking event="start">.'
        : 'Отсутствует трекер события start',
    });
  }
  if (!eventMap['complete']) {
    issues.push({
      level: adType === 'InLine' && vpaidOnlyLinear ? 'info' : 'warn',
      msg: adType === 'InLine' && vpaidOnlyLinear
        ? 'В XML нет трекера complete — для VPAID типичен AdVideoComplete из скрипта; в ленте checker без URL в VAST это не видно.'
        : 'Отсутствует трекер события complete',
    });
  }

  if (adType === 'InLine' && linearEl && hasVpaidLinear && !linearEl.querySelector('Tracking')) {
    issues.push({
      level: 'info',
      msg: 'В <Linear> нет <Tracking> — в XML не заданы URL событий. У VPAID счётчики часто шлют из vpaid.js: в ленте будет пометка «пиксели в VPAID»; сами запросы — вкладка Network (F12). Чтобы URL появились в ленте, добавьте <Tracking> в VAST.',
    });
  }

  const missingQuartiles = ['firstQuartile', 'midpoint', 'thirdQuartile'].filter(k => !eventMap[k]);
  if (adType === 'InLine' && linearEl && hasNonVpaidLinear && missingQuartiles.length) {
    issues.push({
      level: 'warn',
      msg: `Не хватает квартильных трекеров: ${missingQuartiles.join(', ')}. Обычно нужны все три (25% / 50% / 75%) плюс start и complete.`,
    });
  } else if (adType === 'InLine' && linearEl && vpaidOnlyLinear && missingQuartiles.length) {
    issues.push({
      level: 'info',
      msg: `В XML нет квартильных <Tracking> (${missingQuartiles.join(', ')}). Для VPAID-only квартали часто уходят как AdVideoFirstQuartile / Midpoint / ThirdQuartile из vpaid.js — checker не извлекает URL из JS.`,
    });
  }

  if (adType === 'InLine' && linearEl && hasNonVpaidLinear && !eventMap['clickThrough']?.length) {
    issues.push({ level: 'warn', msg: 'Нет <ClickThrough> у линейного креатива — клик по видео может быть недоступен в части SDK' });
  }

  if (adType === 'InLine' && !doc.querySelector('Creative')) {
    issues.push({ level: 'error', msg: 'InLine без блока <Creative> — не соответствует ожидаемой структуре VAST' });
  }

  if (duration && !durationOk) {
    issues.push({ level: 'warn', msg: `Формат <Duration> «${duration}» — по VAST ожидается HH:MM:SS или HH:MM:SS.mmm` });
  }

  const emptyMediaUrl = mediaFiles.some(m => !String(m.url || '').trim());
  if (emptyMediaUrl) {
    issues.push({ level: 'error', msg: 'Есть <MediaFile> с пустым URL — воспроизведение невозможно' });
  }

  const badDelivery = mediaFiles.filter(m => {
    const d = (m.delivery || '').trim().toLowerCase();
    return d && d !== 'progressive' && d !== 'streaming';
  });
  if (badDelivery.length) {
    issues.push({ level: 'warn', msg: `У ${badDelivery.length} MediaFile нестандартный delivery="${badDelivery[0].delivery}" — допустимы progressive | streaming` });
  }

  if (adType === 'Wrapper' && wrapperUrl && !/\[/.test(wrapperUrl) && wrapperUrl.length > 2048) {
    issues.push({ level: 'warn', msg: 'VASTAdTagURI очень длинный (>2048 символов) — часть клиентов обрежет URL' });
  }

  if (adType === 'InLine') {
    if (!allFiles.length) issues.push({ level: 'error', msg: 'Не найдено ни одного <MediaFile> / интерактивного ресурса для линейного показа' });
    if (!duration && linearEl) issues.push({ level: 'warn', msg: 'Не указана длительность <Duration> (обязательна для Linear в VAST 3+)' });
  }

  if (adType === 'Wrapper' && !wrapperUrl) {
    issues.push({ level: 'error', msg: 'Wrapper без URL в <VASTAdTagURI> — цепочка не может продолжиться' });
  }

  const vastProfile = buildVastProfile(doc, version);

  return {
    version, adType, wrapperUrl, adTitle, adSystem, adParameters,
    duration, skipOffset, isVPAID,
    eventMap, mediaFiles: allFiles, trackers, issues,
    chain: [],
    vastProfile,
  };
}

// ─── Build flat tracker list from eventMap ────────────────────────────────────
function buildTrackers(eventMap) {
  const trackers = [];
  const add = (type, urls) => urls.forEach(url => trackers.push({ type, url }));
  if (eventMap['Impression'])    add('impression',    eventMap['Impression']);
  if (eventMap['error'])         add('error',         eventMap['error']);
  if (eventMap['clickThrough'])  add('clickthrough',  eventMap['clickThrough']);
  if (eventMap['clickTracking']) add('clicktracking', eventMap['clickTracking']);
  ALL_EVENTS_FLAT
    .filter(e => e.vast === 'Tracking' && eventMap[e.key])
    .forEach(e => add('tracking', eventMap[e.key]));
  return trackers;
}

// ─── Media file compatibility analysis ───────────────────────────────────────
// Returns { desktop, mobile, ctv: 'good'|'warn'|'bad', warnings: string[] }
function analyzeFileCompat(file) {
  const type    = (file.type || '').toLowerCase();
  const url     = file.url || '';
  const bitrate = parseInt(file.bitrate) || 0;
  const width   = parseInt(file.width)   || 0;
  const height  = parseInt(file.height)  || 0;
  const isVpaid = isVpaidLike(file);
  const isSimid = file.kind === 'interactive' || file.api?.toLowerCase() === 'simid';
  const isNonLin = file.kind === 'nonlinear';
  const lin       = file.kind === 'media' ? classifyLinearMediaFile(file) : null;
  const isMP4     = lin ? lin.isMp4 : (/mp4/i.test(type) || /\.mp4(\?|$)/i.test(url));
  const isWebM    = lin ? lin.isWebm : (/webm/i.test(type) || /\.webm(\?|$)/i.test(url));
  const warnings = [];

  if (isVpaid) {
    return { desktop: 'warn', mobile: 'bad', ctv: 'bad',
      warnings: ['VPAID — только desktop-браузер', 'Не поддерживается в mobile in-app и CTV'] };
  }
  if (isSimid) {
    return { desktop: 'good', mobile: 'warn', ctv: 'bad',
      warnings: ['SIMID: слабая поддержка на mobile', 'Не поддерживается на CTV'] };
  }
  if (isNonLin) {
    return { desktop: 'warn', mobile: 'warn', ctv: 'bad',
      warnings: ['NonLinear: поддержка зависит от плеера', 'CTV-плееры обычно не поддерживают NonLinear'] };
  }

  let desktop = 'good', mobile = 'good', ctv = 'good';

  if (lin) {
    if (lin.isHls && !browserSupportsNativeHls()) {
      desktop = 'warn'; mobile = 'warn'; ctv = 'warn';
      warnings.push('HLS без нативной поддержки — в Chrome/Firefox нужен HLS.js; в Safari обычно ОК');
    }
    if (lin.formatKey === 'mkv' || lin.formatKey === 'ts') {
      desktop = 'warn'; mobile = 'bad'; ctv = 'bad';
      warnings.push(`${lin.formatLabel}: в браузере почти не воспроизводится, нужен транскод в MP4`);
    }
    if (lin.formatKey === 'threegp') {
      if (mobile !== 'bad') mobile = 'warn';
      if (ctv !== 'bad') ctv = 'warn';
      warnings.push('3GP — ограниченная поддержка в desktop-браузерах');
    }
    if (lin.formatKey === 'mov') {
      warnings.push('MOV/QuickTime — проверьте кодек (часто H.264+AAC совместим с браузером)');
    }
    if (lin.formatKey === 'audio') {
      warnings.push('Аудио-трек: в превью плеере будет только звук (без видео)');
    }
  }

  const knownBrowserFriendly = lin && (
    lin.isMp4 || lin.isWebm || lin.isOgg
    || (lin.isHls && browserSupportsNativeHls())
    || lin.isMov || lin.isAudio
  );

  const skipGenericFmtWarn = lin && (
    lin.isHls || lin.formatKey === 'mkv' || lin.formatKey === 'ts'
    || lin.formatKey === 'threegp' || lin.formatKey === 'audio'
  );

  if (!isMP4 && !isWebM && !knownBrowserFriendly && !skipGenericFmtWarn) {
    desktop = 'warn'; mobile = 'warn'; ctv = 'warn';
    const fmt = lin?.formatLabel || type.split('/')[1] || (url.match(/\.(\w+)(\?|$)/)?.[1]) || '?';
    warnings.push(`Формат ${fmt} — плеер может не поддержать`);
  }

  if (isWebM) {
    if (mobile !== 'bad') mobile = 'warn';
    if (ctv   !== 'bad') ctv   = 'warn';
    warnings.push('WebM не поддерживается на iOS и большинстве CTV');
  }

  if (bitrate > 0) {
    if (bitrate < 300) {
      desktop = 'warn'; mobile = 'warn'; if (ctv === 'good') ctv = 'warn';
      warnings.push(`Битрейт ${bitrate} kbps — очень низкое качество`);
    } else if (bitrate < 800) {
      if (ctv === 'good') ctv = 'warn';
      warnings.push(`Битрейт ${bitrate} kbps — мало для CTV (рек. ≥1000)`);
    } else if (bitrate > 8000) {
      if (mobile === 'good') mobile = 'warn';
      warnings.push(`Битрейт ${bitrate} kbps — возможна буферизация на mobile`);
    }
  }

  if (width > 0 && height > 0) {
    if (width < 320 || height < 180) {
      if (ctv === 'good') ctv = 'warn';
      warnings.push(`Малое разрешение ${width}×${height} — плохо на CTV-экране`);
    }
    const ar = width / height;
    if (ar < 1.2 || ar > 2.1) {
      warnings.push(`Нестандартное соотношение сторон (${width}×${height})`);
    }
  }

  if (file.delivery === 'streaming') {
    warnings.push('Delivery: streaming — убедитесь, что плеер поддерживает HLS/DASH');
  }

  return { desktop, mobile, ctv, warnings };
}

function renderCompatBadges(compat) {
  const labels = { desktop: 'Desktop', mobile: 'Mobile', ctv: 'CTV' };
  const icons  = { good: '✓', warn: '⚠', bad: '✗' };
  let html = '<div class="media-compat-row">';
  ['desktop', 'mobile', 'ctv'].forEach(p => {
    const lvl = compat[p];
    html += `<span class="compat-badge ${lvl}">${labels[p]} ${icons[lvl]}</span>`;
  });
  if (compat.warnings.length) {
    const tip = escChk(compat.warnings.join(' · '));
    html += `<span class="compat-note" title="${tip}">${escChk(compat.warnings[0])}${compat.warnings.length > 1 ? ` <em>+${compat.warnings.length - 1}</em>` : ''}</span>`;
  }
  html += '</div>';
  return html;
}

// ─── Merge event maps (from wrappers) ────────────────────────────────────────
function mergeEventMaps(base, additional) {
  Object.entries(additional).forEach(([key, urls]) => {
    if (!base[key]) base[key] = [];
    urls.forEach(u => { if (!base[key].includes(u)) base[key].push(u); });
  });
}

// ─── Wrapper chain resolution ─────────────────────────────────────────────────
async function resolveWrapperChain(initialXml, /** @type {Array<{level:string,msg:string}>} */ loadIssueAcc = []) {
  const chain = [];
  let currentXml = initialXml;
  const inheritedEvents = {}; // events accumulated from wrapper levels

  for (let depth = 0; depth < 6; depth++) {
    const data = parseVAST(currentXml);
    if (data.error) return { ...data, chain };

    if (data.adType === 'Wrapper') {
      chain.push({ type: 'Wrapper', depth, wrapperUrl: data.wrapperUrl });
      // Accumulate tracking events from this wrapper level
      mergeEventMaps(inheritedEvents, data.eventMap);

      if (!data.wrapperUrl) {
        return { ...data, error: 'Wrapper не содержит <VASTAdTagURI>', chain };
      }

      showWrapperProgress(depth + 1, data.wrapperUrl);
      try {
        currentXml = await fetchVASTXmlWithDiagnostics(
          data.wrapperUrl,
          loadIssueAcc,
          `Wrapper · уровень ${depth + 1}`,
        );
      } catch (e) {
        return { ...data, error: `Не удалось загрузить Wrapper уровень ${depth + 1}: ${e.message}`, chain };
      }
    } else {
      // Final level (InLine or Unknown)
      chain.push({ type: data.adType || 'InLine', depth });
      // Merge all inherited wrapper events into the final InLine
      mergeEventMaps(data.eventMap, inheritedEvents);
      // Rebuild tracker list with merged events
      data.trackers = buildTrackers(data.eventMap);
      data.chain = chain;
      data.resolvedXml = currentXml;
      return data;
    }
  }

  return { error: 'Превышена максимальная глубина цепочки врапперов (5)', chain };
}

// ─── Show wrapper resolution progress ────────────────────────────────────────
function showWrapperProgress(depth, url) {
  chkResults.classList.remove('hidden');
  chkSummary.innerHTML = `
    <div class="wrapper-progress">
      <span class="wp-spin"></span>
      Загрузка Wrapper уровень ${depth}… <span class="wp-url">${escChk(url.slice(0, 70))}${url.length > 70 ? '…' : ''}</span>
    </div>`;
}

/**
 * Блок «Инфраструктура» (карточки SSP/DSP по URL из VAST).
 * @param {{ withHeading?: boolean }} [opts] withHeading=false — без подписи (заголовок в карточке ZiChecker).
 * @returns {string} HTML или пустая строка
 */
function buildAdInfraHtml(data, opts = {}) {
  const withHeading = opts.withHeading !== false;
  const infra = data.adInfra;
  if (!infra || (!infra.items?.length && !(infra.scannedUrls > 0))) return '';
  let html = '<div class="chk-ad-infra">';
  if (withHeading) html += '<span class="chk-ad-infra-label">Инфраструктура</span>';
  if (infra.items && infra.items.length) {
    html += '<div class="ad-infra-grid">';
    infra.items.forEach((it, i) => {
      const regCls = it.region === 'RU' ? 'ru' : 'int';
      const regLbl = it.region === 'RU' ? 'РФ / СНГ' : 'Международные';
      html += `<div class="ad-infra-card" style="animation-delay:${i * 40}ms">
          <div class="ad-infra-card-top">
            <span class="ad-infra-region ${regCls}">${regLbl}</span>
            <span class="ad-infra-name">${escChk(it.name)}</span>
            <span class="ad-infra-role">${escChk(it.role)}</span>
          </div>
          <p class="ad-infra-hint">${escChk(it.hint)}</p>
          ${it.sampleHost ? `<div class="ad-infra-host" title="${escChk(it.sampleHost)}">↳ ${escChk(it.sampleHost)}</div>` : ''}
        </div>`;
    });
    html += '</div>';
  } else {
    const n = infra.scannedUrls || 0;
    const adSys = data.adSystem ? escChk(String(data.adSystem)) : '';
    const adSysLine = adSys
      ? ` В ответе указан AdSystem: <strong>${adSys}</strong>.`
      : '';
    html += `<p class="ad-infra-empty">По ${n} ссылкам из VAST знакомых площадок в справочнике нет.${adSysLine}</p>`;
  }
  html += '</div>';
  return html;
}

/** Карточка «Инфраструктура» под блоком «Медиафайлы». */
function renderInfraPanel(data) {
  const body = document.getElementById('chk-infra-body');
  const card = document.getElementById('chk-infra-card');
  if (!body || !card) return;
  const block = buildAdInfraHtml(data, { withHeading: false });
  if (!block) {
    body.innerHTML = '';
    card.classList.add('hidden');
    return;
  }
  body.innerHTML = block;
  card.classList.remove('hidden');
}

// ─── Render summary ───────────────────────────────────────────────────────────
function renderSummary(data) {
  let html = '';

  // Wrapper chain display
  if (data.chain && data.chain.length > 1) {
    html += '<div class="wrapper-chain">';
    data.chain.forEach((node, i) => {
      if (i > 0) html += '<span class="wc-arrow">→</span>';
      const cls = i === data.chain.length - 1 ? 'wc-node final' : 'wc-node';
      html += `<span class="${cls}">${node.type}</span>`;
    });
    html += '</div>';
  }

  const chips = [
    { label: 'VAST',  val: data.version, cls: 'red' },
    { label: 'ТИП',   val: data.adType,  cls: data.adType === 'InLine' ? 'green' : data.adType === 'Wrapper' ? 'yellow' : '' },
  ];
  if (data.chain && data.chain.length > 1) {
    chips.push({ label: 'ЦЕПОЧКА', val: `${data.chain.length} ур.`, cls: 'cyan' });
  }
  if (data.isVPAID)    chips.push({ label: 'VPAID/SIMID', val: 'Да', cls: 'purple' });
  if (data.duration)   chips.push({ label: 'ДЛИТ.',  val: data.duration, cls: '' });
  if (data.skipOffset) chips.push({ label: 'SKIP',   val: data.skipOffset, cls: 'yellow' });
  if (data.adTitle)    chips.push({ label: 'TITLE',  val: data.adTitle.slice(0, 30), cls: '' });
  if (data.adSystem)   chips.push({ label: 'SYSTEM', val: data.adSystem, cls: 'cyan' });

  html += chips.map(c =>
    `<div class="chk-chip ${c.cls}"><span class="chk-chip-lbl">${c.label}</span>${escChk(c.val)}</div>`
  ).join('');

  chkSummary.innerHTML = html;
}

// ─── Render validation ────────────────────────────────────────────────────────
function renderVastSpecPanel(data) {
  const vp = data.vastProfile;
  if (!vp) {
    chkSpecBody.innerHTML = '';
    return;
  }
  const row = (k, v) => `<tr><td class="spec-k">${escChk(k)}</td><td class="spec-v">${escChk(String(v))}</td></tr>`;
  const { counts, has, declared, numeric, notes, inferredHint } = vp;
  let html = '<div class="spec-grid">';
  html += '<table class="spec-table"><tbody>';
  html += row('Атрибут version', declared || '—');
  html += row('Числовое значение', numeric || '—');
  html += row('Рекламы (Ad)', counts.ads);
  html += row('Креативы (Creative)', counts.creatives);
  html += row('Linear', counts.linear);
  html += row('MediaFile', counts.mediaFiles);
  html += row('Tracking', counts.tracking);
  html += row('Impression', counts.impression);
  html += row('Error URL', counts.errorUrls);
  html += row('NonLinearAds', counts.nonlinearAds);
  html += row('Companion', counts.companions);
  html += row('CompanionAds', counts.companionAds);
  html += row('Icon', counts.icons);
  html += row('Extensions', counts.extensions);
  html += '</tbody></table>';
  html += '<div class="spec-flags"><span class="section-label sm">ПРИЗНАКИ</span><ul class="spec-flag-list">';
  Object.entries(has).forEach(([key, on]) => {
    html += `<li class="${on ? 'on' : 'off'}"><span class="spec-dot"></span>${escChk(key)}</li>`;
  });
  html += '</ul></div></div>';
  if (inferredHint) {
    html += `<div class="spec-inferred">${escChk(inferredHint)}</div>`;
  }
  if (notes.length) {
    html += '<ul class="spec-notes">';
    notes.forEach(n => {
      const cls = n.level === 'warn' ? 'warn' : 'info';
      html += `<li class="spec-note ${cls}"><strong>${escChk(n.title)}</strong> — ${escChk(n.detail)}</li>`;
    });
    html += '</ul>';
  }
  chkSpecBody.innerHTML = html;
}

function renderChkValidation(issues) {
  if (!issues.length) {
    chkValBar.className = 'val-bar ok';
    chkValBar.innerHTML = '<span class="vt">✓ Структура VAST корректна</span>';
    chkValBar.classList.remove('hidden');
    return;
  }
  const errs  = issues.filter(i => i.level === 'error');
  const warns = issues.filter(i => i.level === 'warn');
  const infos = issues.filter(i => i.level === 'info');
  const cls   = errs.length ? 'error' : warns.length ? 'warn' : 'ok';
  const icon  = errs.length ? '✗' : warns.length ? '⚠' : infos.length ? 'ⓘ' : '✓';
  let title;
  if (errs.length) {
    title = `${errs.length} ошибк${errs.length === 1 ? 'а' : errs.length < 5 ? 'и' : ''}`;
  } else if (warns.length) {
    title = `${warns.length} предупреждени${warns.length === 1 ? 'е' : warns.length < 5 ? 'я' : 'й'}`;
  } else if (infos.length) {
    title = `${infos.length} информационных сообщений`;
  } else {
    title = 'Замечания';
  }
  chkValBar.className = `val-bar ${cls}`;
  chkValBar.innerHTML = `<div class="vt">${icon} ${title}</div><ul>${issues.map(i => `<li>${escChk(i.msg)}</li>`).join('')}</ul>`;
  chkValBar.classList.remove('hidden');
}

/** URL для узла схемы: прямой ключ + совпадение без учёта регистра (наследие до canonicalTrackingEventName). */
function urlsFromEventMapForKey(/** @type {Record<string, string[]>|undefined} */ em, /** @type {string} */ key) {
  if (!em || !key) return [];
  const direct = em[key];
  if (direct && direct.length) return direct;
  const lower = key.toLowerCase();
  for (const k of Object.keys(em)) {
    if (k.toLowerCase() === lower && em[k]?.length) return em[k];
  }
  return [];
}

// ─── Render event flow ────────────────────────────────────────────────────────
function renderFlow(data) {
  const { eventMap, isVPAID } = data;
  let html = '';

  const groups = isVPAID ? EVENT_GROUPS : EVENT_GROUPS.filter(g => !g.label.includes('VPAID'));

  html += '<div class="flow-columns">';
  groups.forEach((group, gi) => {
    const groupCls = group.label === 'Показ' ? 'flow-group flow-group--impression' : 'flow-group';
    html += `<div class="${groupCls}">`;
    if (group.label !== 'Показ') {
      html += `<div class="flow-group-label">${group.label}</div>`;
    }
    group.events.forEach((ev, i) => {
      const urls   = group.label === 'VPAID / Интерактив'
        ? vastEventMapUrls(eventMap, ev.key)
        : urlsFromEventMapForKey(eventMap, ev.key);
      const count  = urls.length;
      const hasIt  = count > 0;
      const isErr  = group.label === 'Ошибки';
      const dotCls = hasIt ? (isErr ? 'error' : 'hit') : 'miss';
      const nodeCls= hasIt ? (isErr ? '' : 'hit') : 'miss';
      const delay  = (gi * 5 + i) * 30;
      html += `
        <div class="flow-node ${nodeCls}" data-event="${ev.key}" style="animation-delay:${delay}ms">
          <div class="flow-dot ${dotCls}">${hasIt ? (count > 9 ? '9+' : count) : '—'}</div>
          <div class="flow-info">
            <div class="flow-name">${ev.label}</div>
            ${ev.flowHint ? `<div class="flow-hint">${escChk(ev.flowHint)}</div>` : ''}
            ${hasIt
              ? `<div class="flow-count has">${count} URL${count > 1 ? 's' : ''}</div>`
              : `<div class="flow-count">не задан</div>`}
          </div>
        </div>`;
    });
    html += `</div>`;
  });
  html += '</div>';

  chkFlow.innerHTML = html;
  rebuildFlowNodeCache();
}

// ─── Render trackers ──────────────────────────────────────────────────────────
function renderTrackers(trackers) {
  chkTrackerCount.textContent = trackers.length;
  if (!trackers.length) {
    chkTrackerList.innerHTML = '<div class="chk-empty-msg">Трекеры не найдены</div>';
    return;
  }

  const groups = {};
  trackers.forEach(t => {
    if (!groups[t.type]) groups[t.type] = [];
    groups[t.type].push(t.url);
  });

  const labels = {
    impression:    'Impression',
    tracking:      'Tracking Events',
    error:         'Error',
    clickthrough:  'Click Through',
    clicktracking: 'Click Tracking',
  };

  let html = '';
  let delay = 0;
  Object.entries(groups).forEach(([type, urls]) => {
    const color = TRACKER_COLORS[type] || TRACKER_COLORS.other;
    html += `<div class="tracker-group-hd">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
      ${labels[type] || type}
      <span class="tg-badge">${urls.length}</span>
    </div>`;
    urls.forEach(url => {
      html += `<div class="tracker-row" style="animation-delay:${delay}ms" data-copy-url="${escChk(url)}">
        <span class="tracker-type-dot" style="background:${color}"></span>
        <span class="tracker-url" title="${escChk(url)}">${escChk(url)}</span>
        <button class="copy-url-btn" title="Копировать URL">${COPY_URL_BTN_SVG}</button>
      </div>`;
      delay += 15;
    });
  });
  chkTrackerList.innerHTML = html;
}

// Copy delegation for tracker list
chkTrackerList.addEventListener('click', e => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const btn = t.closest('.copy-url-btn');
  if (!btn) return;
  const row = btn.closest('[data-copy-url]');
  if (row instanceof HTMLElement && row.dataset.copyUrl) copy(row.dataset.copyUrl, 'Скопировано!');
});

// ─── Render media files ───────────────────────────────────────────────────────
function renderMedia(mediaFiles) {
  chkMediaCount.textContent = mediaFiles.length;
  if (!mediaFiles.length) {
    chkMediaList.innerHTML = '<div class="chk-empty-msg">MediaFile не найдены</div>';
    return;
  }

  let html = '';
  mediaFiles.forEach((m, i) => {
    const isInteractive = m.kind === 'interactive';
    const isNonLinear   = m.kind === 'nonlinear';
    const isVpaid       = isVpaidLike(m);
    const isSimid       = m.api?.toLowerCase() === 'simid' || isInteractive;

    let typeKey, typeLabel;
    if (isSimid || isInteractive) {
      typeKey   = 'simid';
      typeLabel = (m.api || 'SIMID').toUpperCase().slice(0, 6);
    } else if (isVpaid) {
      typeKey   = 'vpaid';
      typeLabel = 'VPAID';
    } else if (isNonLinear) {
      typeKey   = 'nonlinear';
      typeLabel = 'NONLIN';
    } else {
      const cls = classifyLinearMediaFile(m);
      typeKey   = cls.formatKey;
      typeLabel = cls.formatLabel.length > 6 ? cls.formatLabel.slice(0, 6) : cls.formatLabel;
    }

    const dims    = m.width && m.height ? `${m.width}×${m.height}` : '';
    const bitrate = m.bitrate ? `${m.bitrate} kbps` : '';
    const meta    = [dims, bitrate, m.delivery, m.source === 'adParameters' ? 'из AdParameters' : '']
      .filter(Boolean).join(' · ');

    const compat     = analyzeFileCompat(m);
    const compatHtml = renderCompatBadges(compat);

    html += `<div class="media-row" style="animation-delay:${i * 30}ms" data-copy-url="${escChk(m.url)}">
      <span class="media-type ${typeKey}">${typeLabel}</span>
      <div class="media-body">
        <span class="media-meta" title="${escChk(m.url)}">${escChk(m.url)}${meta ? ` <span>· ${meta}</span>` : ''}</span>
        ${compatHtml}
      </div>
      <button class="copy-url-btn" title="Копировать URL">${COPY_URL_BTN_SVG}</button>
    </div>`;
  });
  chkMediaList.innerHTML = html;
}

// Copy delegation for media list
chkMediaList.addEventListener('click', e => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const btn = t.closest('.copy-url-btn');
  if (!btn) return;
  const row = btn.closest('[data-copy-url]');
  if (row instanceof HTMLElement && row.dataset.copyUrl) copy(row.dataset.copyUrl, 'Скопировано!');
});

// ─── Root cause analysis ("Почему не играет?") ───────────────────────────────
function generateRootCause(data) {
  const findings = [];
  const add = (level, title, detail = '') => findings.push({ level, title, detail });

  const loadIssues = data.loadIssues || [];
  loadIssues.forEach((n) => {
    const lvl = n.level === 'error' ? 'error' : n.level === 'warn' ? 'warn' : 'info';
    add(lvl, 'Загрузка / HTTP', n.msg);
  });

  const { linearFiles, vpaidFiles, videoFiles, interactives } = getMediaBuckets(data.mediaFiles);
  const vpaidOnlyLinear = isVpaidOnlyLinearCreative(data.mediaFiles);

  // No media at all
  if (!linearFiles.length && !interactives.length) {
    add('error', 'Нет медиафайлов', 'VAST не содержит ни одного <MediaFile> — воспроизведение невозможно');
  }

  // VPAID-only
  if (vpaidFiles.length > 0 && videoFiles.length === 0 && interactives.length === 0) {
    add('error', 'Только VPAID', `${vpaidFiles.length} файл(ов) VPAID, видеофайлов нет — воспроизведение зависит от SDK плеера`);
  }

  // Impression missing
  if (!data.eventMap['Impression']?.length) {
    if (vpaidOnlyLinear && data.adType === 'InLine') {
      add('info', 'Нет URL показа в <Impression>', 'Для VPAID-only в XML часто пустой <Impression>; пиксель и метки могут вызываться из vpaid.js (IAB VPAID 2.0). Проверяйте Network при проигровке или требуйте явные URL у поставщика.');
    } else {
      add('error', 'Нет <Impression> пикселя', 'Показ рекламы не будет засчитан — обязательный элемент отсутствует');
    }
  }

  // Error URL missing
  if (!data.eventMap['error']?.length) {
    add(vpaidOnlyLinear && data.adType === 'InLine' ? 'info' : 'warn', 'Нет <Error> URL', 'Ошибки плеера не будут отслежены — <Error> URL не задан');
  }

  // Start/Complete
  if (!data.eventMap['start']) {
    add(
      vpaidOnlyLinear && data.adType === 'InLine' ? 'info' : 'warn',
      'Нет трекера start в VAST',
      vpaidOnlyLinear && data.adType === 'InLine'
        ? 'Для VPAID-only start/прогресс часто идут из vpaid.js (AdVideoStart и др.), а не из <Tracking event="start"> в XML.'
        : 'Начало воспроизведения не будет подтверждено — верификация невозможна',
    );
  }
  if (!data.eventMap['complete']) {
    add(
      vpaidOnlyLinear && data.adType === 'InLine' ? 'info' : 'warn',
      'Нет трекера complete в VAST',
      vpaidOnlyLinear && data.adType === 'InLine'
        ? 'Для VPAID-only завершение часто шлётся как AdVideoComplete из скрипта плеера.'
        : 'Досмотр до конца не будет зафиксирован',
    );
  }

  // Duration
  if (!data.duration && linearFiles.length > 0) {
    add('warn', 'Нет <Duration>', 'Некоторые плееры (IAB-совместимые) отклоняют VAST без длительности');
  }

  // Wrapper chain depth
  if (data.chain && data.chain.length > 2) {
    add('warn', `Цепочка враперов: ${data.chain.length} уровня`, 'Каждый уровень добавляет задержку. Глубокие цепочки вызывают таймаут у SSP/DSP');
  }

  // HTTP trackers
  const allUrls    = Object.values(data.eventMap).flat();
  const httpUrls   = allUrls.filter(u => u.startsWith('http://'));
  if (httpUrls.length > 0) {
    add('error', `${httpUrls.length} трекер(ов) по HTTP`, 'HTTP-пиксели блокируются на HTTPS-страницах — браузер/SDK выдаст Mixed Content error');
  }

  // Missing MIME type
  const unknownMime = videoFiles.filter(m => !m.type || m.type === 'video/');
  if (unknownMime.length > 0) {
    add('warn', `${unknownMime.length} MediaFile без type=""`, 'Без MIME-типа плеер может не знать, как декодировать файл');
  }

  // Codec variety — only one file total (fragile)
  if (videoFiles.length === 1) {
    add('info', 'Только один MediaFile', 'Рекомендуется предоставить несколько форматов (MP4 + WebM) для совместимости');
  }

  // Skip offset present
  if (data.skipOffset) {
    add('info', `Skip offset: ${data.skipOffset}`, 'Реклама пропускаемая — убедитесь, что плеер поддерживает skipoffset');
  }

  // All clear
  const hasErrors = findings.some(f => f.level === 'error');
  const hasWarns  = findings.some(f => f.level === 'warn');
  if (!hasErrors && !hasWarns) {
    add('ok', 'Проблем не обнаружено', 'Структура VAST выглядит корректной для воспроизведения');
  } else if (!hasErrors) {
    add('ok', 'Критических ошибок нет', 'Воспроизведение возможно, но есть предупреждения выше');
  }

  return findings;
}

const DIAG_ICONS = {
  ok:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  warn:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function renderRootCause(data) {
  const findings = generateRootCause(data);
  let html = '<div class="diag-list">';
  findings.forEach((f, i) => {
    html += `<div class="diag-item level-${f.level}" style="animation-delay:${i * 40}ms">
      <span class="diag-icon">${DIAG_ICONS[f.level] || DIAG_ICONS.info}</span>
      <div class="diag-body">
        <div class="diag-title">${escChk(f.title)}</div>
        ${f.detail ? `<div class="diag-detail">${escChk(f.detail)}</div>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  chkDiagResult.innerHTML = html;
}

// ─── Compliance diff ──────────────────────────────────────────────────────────
function generateCompliance(data) {
  const items = [];
  const add = (platform, level, rule, detail = '') => items.push({ platform, level, rule, detail });

  (data.loadIssues || []).forEach((n) => {
    const lvl = n.level === 'error' ? 'error' : n.level === 'warn' ? 'warn' : 'info';
    add('Загрузка / HTTP', lvl, n.msg, 'Проверка ответа сервера до разбора XML (IAB не нормирует transport, но это влияет на все SDK)');
  });

  const adInfra = data.adInfra;
  if (adInfra && adInfra.items && adInfra.items.length) {
    const preview = adInfra.items.slice(0, 4).map(i => i.name).join(', ');
    add('Платформы', 'info', `Распознано: ${preview}${adInfra.items.length > 4 ? '…' : ''}`, '');
  }

  const { linearFiles, vpaidFiles, videoFiles } = getMediaBuckets(data.mediaFiles);
  const allUrls      = Object.values(data.eventMap).flat();
  const hasHttp      = allUrls.some(u => u.startsWith('http://'));
  const webmOnly     = videoFiles.length > 0 && videoFiles.every(m => /webm/i.test(m.type) || /\.webm(\?|$)/i.test(m.url));
  const lowBitrateOnly = videoFiles.length > 0 && videoFiles.every(m => { const b = parseInt(m.bitrate)||0; return b > 0 && b < 800; });

  // ── IAB VAST spec ──
  if (!data.adSystem) add('IAB VAST', 'warn', '<AdSystem> отсутствует', 'Элемент обязателен по спецификации VAST для идентификации рекламной системы');
  if (!data.adTitle && data.adType === 'InLine') add('IAB VAST', 'info', '<AdTitle> отсутствует', 'Рекомендован для идентификации объявления');
  if (!data.eventMap['Impression']?.length) {
    if (isVpaidOnlyLinearCreative(data.mediaFiles) && data.adType === 'InLine') {
      add('IAB VAST', 'info', 'Нет URL в <Impression> (VPAID-only Linear)', 'По IAB в VAST элемент ожидается; на практике при одном VPAID MediaFile показ и счётчики нередко реализованы внутри vpaid.js. Для бирж, требующих явный пиксель в XML, добавьте URL в <Impression>.');
    } else {
      add('IAB VAST', 'error', 'Нет <Impression>', 'Обязательный элемент — без него показ не засчитается');
    }
  }
  if (!data.duration && linearFiles.length) add('IAB VAST', 'warn', 'Нет <Duration>', 'Обязателен в <Linear> согласно VAST 3+');
  if (!data.eventMap['error']?.length) add('IAB VAST', 'info', 'Нет <Error> URL', 'Рекомендован для отслеживания ошибок воспроизведения');

  const em = data.eventMap || {};
  const missQ = ['firstQuartile', 'midpoint', 'thirdQuartile'].filter(k => !em[k]);
  if (data.adType === 'InLine' && missQ.length && videoFiles.length) {
    add('IAB / биржи', 'warn', `Нет квартилей: ${missQ.join(', ')}`, 'Часто требуют first/mid/third и ещё start + complete для отчётности');
  }
  if (data.adType === 'InLine' && videoFiles.length && !em.clickThrough?.length) {
    add('IAB VAST', 'warn', 'Нет ClickThrough у видеокреатива', 'Для кликабельной in-stream рекламы элемент рекомендован; без него часть SDK не откроет целевую страницу');
  }
  if (data.duration && !/^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(String(data.duration).trim())) {
    add('IAB VAST', 'warn', 'Нестандартный формат Duration', 'Ожидается HH:MM:SS или HH:MM:SS.mmm — иначе плеер может отклонить креатив');
  }
  const noMime = videoFiles.filter(m => !m.type || m.type === 'video/');
  if (noMime.length) {
    add('IAB / плееры', 'warn', `${noMime.length} MediaFile без корректного type`, 'Укажите MIME (например video/mp4), чтобы плеер стабильнее выбирал декодер.');
  }

  // ── Google IMA SDK ──
  if (hasHttp) add('Google IMA', 'error', 'HTTP URLs (Mixed Content)', 'Google IMA на HTTPS-страницах блокирует все http:// пиксели и медиафайлы');

  // ── CTV / OTT (в сводке остаются жёсткие случаи; ориентиры по VPAID+MP4, SIMID, NonLinear — в справке) ──
  if (vpaidFiles.length > 0 && videoFiles.length === 0) {
    add('CTV / OTT', 'error', 'Только VPAID — не воспроизведётся', 'VPAID не поддерживается ни на одной CTV-платформе (Roku, Fire TV, Apple TV)');
  }
  if (lowBitrateOnly) add('CTV / OTT', 'warn', 'Низкий битрейт для CTV', 'Все файлы <800 kbps — на большом экране будет видно артефакты (рек. ≥1500)');
  if (webmOnly) add('CTV / OTT', 'error', 'Только WebM — не воспроизведётся', 'WebM не поддерживается на большинстве CTV-устройств');

  // ── Mobile / In-App (дубли «только WebM / только VPAID» убраны — те же кейсы в CTV; HTTP — отдельно) ──
  if (hasHttp) add('Mobile', 'error', 'HTTP трекеры/медиа', 'Мобильные приложения (iOS ATS, Android Network Policy) требуют HTTPS');

  return items;
}

function renderCompliance(data) {
  const items = generateCompliance(data);
  const issueCount = items.filter(i => i.level === 'error' || i.level === 'warn').length;
  chkComplianceCount.textContent = String(issueCount);

  if (!items.length) {
    chkComplianceList.innerHTML = '<div class="compliance-empty">Нарушений не найдено</div>';
    return;
  }

  // Sort by severity within each platform group
  const levelOrder = { error: 0, warn: 1, info: 2 };
  const platforms = {};
  items.forEach(item => {
    if (!platforms[item.platform]) platforms[item.platform] = [];
    platforms[item.platform].push(item);
  });

  let html = '';
  let delay = 0;
  Object.entries(platforms).forEach(([platform, pItems]) => {
    pItems.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));
    pItems.forEach(item => {
      html += `<div class="compliance-item level-${item.level}" style="animation-delay:${delay}ms">
        <span class="compliance-platform">${escChk(platform)}</span>
        <div class="compliance-body">
          <div class="compliance-rule">${escChk(item.rule)}</div>
          ${item.detail ? `<div class="compliance-detail">${escChk(item.detail)}</div>` : ''}
        </div>
        <span class="compliance-level-badge">${item.level.toUpperCase()}</span>
      </div>`;
      delay += 20;
    });
  });

  chkComplianceList.innerHTML = html;
}

// ─── Main parse action ────────────────────────────────────────────────────────
function showChkError(msg, /** @type {Array<{level:string,msg:string}>} */ loadIssues = []) {
  chkValBar.className = 'val-bar error';
  const loadList = loadIssues.length
    ? `<ul class="chk-error-load">${loadIssues.map(i => `<li>${escChk(i.msg)}</li>`).join('')}</ul>`
    : '';
  chkValBar.innerHTML = `<span class="vt">✗ ${escChk(msg)}</span>${loadList}`;
  chkValBar.classList.remove('hidden');
  chkResults.classList.add('hidden');
}

function processResults(data) {
  data.adInfra = analyzeAdInfrastructure(data);
  const load = Array.isArray(data.loadIssues) ? data.loadIssues : [];
  const structural = Array.isArray(data.issues) ? data.issues : [];
  const mergedIssues = [...load, ...structural];
  renderSummary(data);
  renderChkValidation(mergedIssues);
  renderVastSpecPanel(data);
  renderFlow(data);
  renderTrackers(data.trackers);
  renderMedia(data.mediaFiles);
  renderInfraPanel(data);
  renderRootCause(data);
  renderCompliance(data);
  /** Сначала показываем результаты — иначе плеер/iframe VPAID в display:none могут не получить размеры и не стартовать; повторный анализ тоже. */
  chkResults.classList.remove('hidden');
  /** Два rAF: reflow после снятия .hidden, затем init — иначе video/iframe иногда остаются с нулевой геометрией. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initPlayer(data);
    });
  });
}

const BTN_PARSE_INNER = `<svg width="9" height="9" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg> Анализировать`;

/** После загрузки по URL показываем полученный XML в редакторе (финальный документ при цепочке Wrapper). */
function showFetchedXmlInEditor(/** @type {string} */ rawXml, /** @type {{ resolvedXml?: string }} */ data) {
  const body = (data && data.resolvedXml) || rawXml;
  try {
    setXmlText(formatVastXml(body));
    setXmlEditorStatus('Загружено по URL · отформатировано', 'ok');
  } catch {
    setXmlText(body);
    setXmlEditorStatus('Загружено по URL', 'ok');
  }
}

async function doChkParse() {
  chkBtnParse.classList.add('scanning');
  chkBtnParse.innerHTML = 'Загрузка…';
  chkValBar.classList.add('hidden');

  const parsedFromUrl = chkMode === 'url' && !!chkUrlInput.value.trim();
  /** @type {Array<{level:string,msg:string}>} */
  const loadAcc = [];

  try {
    let xmlStr;
    /** Исходное содержимое редактора до извлечения VAST (режим XML). */
    let chkXmlRawBeforeNorm = /** @type {string|null} */ (null);

    if (chkMode === 'url') {
      const url = chkUrlInput.value.trim();
      if (!url) return;
      lastChkVastPageUrl = url;
      xmlStr = await fetchVASTXmlWithDiagnostics(url, loadAcc);
    } else {
      lastChkVastPageUrl = '';
      chkXmlRawBeforeNorm = getXmlText().trim();
      if (!chkXmlRawBeforeNorm) return;
      xmlStr = normalizeVastResponseText(chkXmlRawBeforeNorm).text;
    }

    // Quick peek — is it a Wrapper? If so resolve chain
    if (/<\s*w:wordDocument\b/i.test(xmlStr) && /schemas\.microsoft\.com\/office\/word\/2003\/wordml/i.test(xmlStr)) {
      loadAcc.push({ level: 'info', msg: 'Распознан Word 2003 XML: VAST собран из текста в элементах w:t.' });
    }

    const quick = parseVAST(xmlStr);
    if (quick.error) { showChkError(quick.error, loadAcc); return; }

    let data;
    if (quick.adType === 'Wrapper' && quick.wrapperUrl) {
      chkResults.classList.remove('hidden');
      showWrapperProgress(1, quick.wrapperUrl);
      data = await resolveWrapperChain(xmlStr, loadAcc);
    } else {
      data = quick;
      data.chain = [{ type: data.adType, depth: 0 }];
    }

    if (data.error) { showChkError(data.error, loadAcc); return; }
    data.loadIssues = loadAcc;
    await enrichDataWithVpaidBundledLinearVideo(data);
    processResults(data);
    if (parsedFromUrl) showFetchedXmlInEditor(xmlStr, data);

  } catch (e) {
    showChkError(`Ошибка загрузки: ${e.message}. Попробуйте вставить XML напрямую.`);
  } finally {
    chkBtnParse.innerHTML = BTN_PARSE_INNER;
    chkBtnParse.classList.remove('scanning');
  }
}

/**
 * HTML-документ для изолированной загрузки VPAID 2.0 (application/javascript).
 * Порядок: handshakeVersion → initAd → AdLoaded → startAd; повторные попытки getVPAID; postMessage type zi-vpaid.
 */
function buildVpaidSrcdoc(scriptUrl, width, height, creativeData) {
  const w = Number(width) > 0 ? Number(width) : 640;
  const h = Number(height) > 0 ? Number(height) : 360;
  const cd = String(creativeData || '');
  /** Нативные controls у videoSlot — пауза/громкость, если креатив не рисует свой UI (часть поставщиков полагается на это). */
  const cfg = JSON.stringify({ scriptUrl, w, h, cd, videoControls: true }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:100%;min-height:100%;height:100%;background:#0a0a0f;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center}#s{flex-shrink:0;position:relative;overflow:hidden}
/* Chromium/WebKit: нативная панель video[controls] при play обычно скрывается до паузы/конца — мешает проверке VPAID. Держим панель видимой (DOM креатива в slot не трогаем). */
video::-webkit-media-controls-panel{opacity:1!important;visibility:visible!important;transition:none!important}
video::-webkit-media-controls-enclosure{overflow:visible!important}
video::-webkit-media-controls-timeline-container{opacity:1!important}
video::-webkit-media-controls-current-time-display,video::-webkit-media-controls-time-remaining-display{opacity:1!important}
/* Видео поверх креатива; pointer-events на video задаётся из JS (полоса снизу + focus) — иначе Chrome не показывает нативный toolbar при pointer-events:none на всём элементе. */
#s>[data-vpaid-ui-root]{z-index:2}
#s>video[data-zi-vpaid-slot-video],#s [data-vpaid-ui-root]>video[data-zi-vpaid-slot-video]{z-index:3!important}
video[data-zi-vpaid-slot-video]::-webkit-media-controls-enclosure{pointer-events:auto!important}
/* Родитель: fullscreen только на #vpaid-sandbox-wrap — заполняем вьюпорт, видео без letterbox */
html.zi-mount-fs body{align-items:stretch!important;justify-content:stretch!important}
html.zi-mount-fs #s{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;flex-shrink:1}
html.zi-mount-fs video{object-fit:cover!important}
</style></head><body><div id="s"></div><script>
(function(){
var C=${cfg};
function send(m,x){try{parent.postMessage({type:'zi-vpaid',msg:m,extra:x!=null?String(x):''},'*');}catch(e){}}
var outer=document.getElementById('s');
outer.style.cssText='width:'+C.w+'px;height:'+C.h+'px;position:relative;overflow:hidden';
var v=document.createElement('video');
v.setAttribute('playsinline','');
v.setAttribute('tabindex','0');
v.setAttribute('data-zi-vpaid-slot-video','1');
/** Видео — верхний слой; по умолчанию pointer-events:none (клики в основную область — в креатив). Внизу ~88px и при Tab-фокусе — auto, чтобы жить нативный toolbar. */
v.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;background:#000;z-index:3;pointer-events:none';
if(C.videoControls){try{v.setAttribute('controls','');}catch(e){}}
if(C.videoControls){
  v.addEventListener('play',function(){try{v.controls=true;}catch(_){}});
  v.addEventListener('playing',function(){try{v.controls=true;}catch(_){}});
}
var uiRoot=document.createElement('div');
uiRoot.setAttribute('data-vpaid-ui-root','1');
/** pointer-events:none — иначе пустая подложка перехватывает клики: не видны нативные controls video и часть UI сторонних VPAID. Дочерние узлы креатива с pointer-events:auto по-прежнему кликабельны. */
uiRoot.style.cssText='position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden';
outer.appendChild(uiRoot);
outer.appendChild(v);
/** Креативы с detached video (prepend в slot) оставляют Preact-root поверх video — поднимаем video в конец родителя. */
function ziEnsureVideoOnTop(){
  try{
    var p=v.parentNode;
    if(!p||p===document.body)return;
    if(p.lastElementChild!==v)p.appendChild(v);
  }catch(_){}
}
var ziVideoTopMo=new MutationObserver(function(){ziEnsureVideoOnTop();});
try{
  ziVideoTopMo.observe(uiRoot,{childList:true,subtree:true});
  ziVideoTopMo.observe(outer,{childList:true,subtree:false});
}catch(_){}
[0,48,120,400,1200,2800].forEach(function(ms){setTimeout(ziEnsureVideoOnTop,ms);});
var ZI_VIDEO_CTRL_BAND=88;
var ziLastMouseClientY=null;
function ziSyncVideoPointerEvents(){
  try{
    if(document.activeElement===v){v.style.pointerEvents='auto';return;}
    if(ziLastMouseClientY==null){v.style.pointerEvents='none';return;}
    var r=outer.getBoundingClientRect();
    var y=ziLastMouseClientY-r.top;
    var inBottom=y>=r.height-ZI_VIDEO_CTRL_BAND&&y<=r.height+24;
    v.style.pointerEvents=inBottom?'auto':'none';
  }catch(_){}
}
outer.addEventListener('mousemove',function(e){
  ziLastMouseClientY=e.clientY;
  ziSyncVideoPointerEvents();
},false);
outer.addEventListener('mouseleave',function(){
  if(document.activeElement!==v){
    ziLastMouseClientY=null;
    v.style.pointerEvents='none';
  }
});
outer.addEventListener('touchstart',function(e){
  try{
    var t=e.touches&&e.touches[0];
    if(!t)return;
    ziLastMouseClientY=t.clientY;
    ziSyncVideoPointerEvents();
  }catch(_){}
},{passive:true});
v.addEventListener('focus',function(){v.style.pointerEvents='auto';});
v.addEventListener('blur',function(){ziSyncVideoPointerEvents();});
var firstNativePlay=true,nativePaused=false;
v.addEventListener('pause',function(){send('native-pause');nativePaused=true;});
v.addEventListener('play',function(){
  if(firstNativePlay){firstNativePlay=false;return;}
  if(nativePaused){send('native-resume');nativePaused=false;}
});
function isInteractiveNode(t){
  if(!t)return false;
  if(t.nodeType===3)t=t.parentElement;
  if(!t||t.nodeType!==1)return false;
  var U=t.tagName?t.tagName.toUpperCase():'';
  if(U==='INPUT'||U==='TEXTAREA'||U==='SELECT'||U==='BUTTON'||U==='OPTION'||U==='LABEL')return true;
  if(U==='A'&&(t.getAttribute('href')||t.href))return true;
  try{if(t.isContentEditable)return true;}catch(_){}
  var r=t.getAttribute&&t.getAttribute('role');
  if(r){r=r.toLowerCase();if(/^(textbox|searchbox|combobox|listbox|spinbutton|slider|menuitem)$/.test(r))return true;}
  return false;
}
function pathTouchesInteractive(ev){
  var path=typeof ev.composedPath==='function'?ev.composedPath():[];
  if(!path||!path.length){if(ev.target)path=[ev.target];else return false;}
  for(var i=0;i<path.length;i++){
    var n=path[i];
    if(n===window||n===document||!n)continue;
    if(n===outer)break;
    if(isInteractiveNode(n))return true;
  }
  return false;
}
outer.addEventListener('click',function(e){
  if(e.button!==0)return;
  if(uiRoot.contains(e.target))return;
  if(pathTouchesInteractive(e))return;
  var path=typeof e.composedPath==='function'?e.composedPath():[e.target];
  var vi=-1;
  for(var i=0;i<path.length;i++){if(path[i]===v){vi=i;break;}}
  if(vi!==0)return;
  send('native-click',e.isTrusted?'1':'0');
},true);
var lastMuted=v.muted||v.volume===0;
v.addEventListener('volumechange',function(){
  var m=v.muted||v.volume===0;
  if(m===lastMuted)return;
  lastMuted=m;
  send(m?'native-mute':'native-unmute');
});
v.addEventListener('loadeddata',function(){
  lastMuted=v.muted||v.volume===0;
});
var lastRate=v.playbackRate;
v.addEventListener('ratechange',function(){
  if(v.playbackRate===lastRate)return;
  lastRate=v.playbackRate;
  send('native-rate',String(v.playbackRate));
});
var fsInsideSlot=false;
var ziVpaidInstance=null;
function applyVpaidResizeAfterLayout(){
  var full=document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement;
  var w=C.w,h=C.h,view='normal';
  var innerFs=false,parentFs=false,mountParentFs=false;
  try{
    if(full&&outer.contains(full)){
      innerFs=true;
      view='fullscreen';
      w=full.clientWidth||full.offsetWidth||window.innerWidth||C.w;
      h=full.clientHeight||full.offsetHeight||window.innerHeight||C.h;
    }else if(window.parent&&window.parent!==window){
      try{
        var d=window.parent.document;
        var pel=d.fullscreenElement||d.webkitFullscreenElement||d.mozFullScreenElement||d.msFullscreenElement;
        var root=d.getElementById('player-stage-root');
        var sw=d.getElementById('vpaid-sandbox-wrap');
        var aw=d.getElementById('adfox-yandex-wrap');
        if(pel&&root&&pel===root){
          parentFs=true;
          view='fullscreen';
          w=window.innerWidth||C.w;
          h=window.innerHeight||C.h;
        }else if(pel&&((sw&&pel===sw)||(aw&&pel===aw))){
          mountParentFs=true;
          parentFs=true;
          view='fullscreen';
          w=window.innerWidth||C.w;
          h=window.innerHeight||C.h;
        }
      }catch(_){}
    }
  }catch(_){}
  try{
    if(typeof document!=='undefined'&&document.documentElement){
      if(mountParentFs)document.documentElement.classList.add('zi-mount-fs');
      else document.documentElement.classList.remove('zi-mount-fs');
    }
  }catch(_){}
  try{
    if(innerFs||parentFs){
      outer.style.width='100%';
      outer.style.height='100%';
    }else{
      outer.style.width=C.w+'px';
      outer.style.height=C.h+'px';
    }
  }catch(_){}
  var vp=ziVpaidInstance;
  if(!vp||typeof vp.resizeAd!=='function'){
    ziEnsureVideoOnTop();
    ziSyncVideoPointerEvents();
    return;
  }
  requestAnimationFrame(function(){
    try{vp.resizeAd(w,h,view);}catch(_){}
    ziEnsureVideoOnTop();
    ziSyncVideoPointerEvents();
  });
}
document.addEventListener('fullscreenchange',function(){
  var el=document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement;
  var inFs=!!(el&&outer.contains(el));
  if(inFs&&!fsInsideSlot){fsInsideSlot=true;send('native-fs-enter');}
  if(!inFs&&fsInsideSlot){fsInsideSlot=false;send('native-fs-exit');}
  setTimeout(applyVpaidResizeAfterLayout,inFs?0:60);
});
window.addEventListener('message',function(ev){
  try{
    var d=ev.data;
    if(!d||d.type!=='zi-chk-parent-layout')return;
    setTimeout(applyVpaidResizeAfterLayout,0);
  }catch(_){}
});
window.addEventListener('resize',function(){
  setTimeout(applyVpaidResizeAfterLayout,48);
});
var env={slot:uiRoot,videoSlot:v,videoSlotCanAutoPlay:function(){return true;}};
var playbackStarted=false;
/** Яндекс vpaid_loader подгружает VpaidPlayer асинхронно — startAd до готовности даёт WITHOUT_VPAID; повторяем с интервалом. */
function safeStartAd(vp, attempt){
  if(playbackStarted)return;
  var maxAttempts=150;
  var delayMs=attempt<55?200:attempt<100?350:500;
  try{
    vp.startAd();
    playbackStarted=true;
    send('sandbox-started');
    setTimeout(applyVpaidResizeAfterLayout,0);
  }catch(e){
    var msg=e&&e.message!=null?String(e.message):String(e);
    var retryable=/WITHOUT_VPAID|VPAID_PLAYER_LOADER|ACTION_METHOD_CALLED|DEFAULT_ERROR_MESSAGE|not\s*ready|VAS\s+Error/i.test(msg);
    if(attempt<maxAttempts&&(retryable||attempt<50)){
      setTimeout(function(){safeStartAd(vp,attempt+1);},delayMs);
    }else{
      send('startAd-error',msg);
    }
  }
}
function boot(vp){
  if(!vp||typeof vp.initAd!=='function'){send('vpaid-invalid');return;}
  ziVpaidInstance=vp;
  var hv;try{hv=vp.handshakeVersion('2.0');}catch(e){send('handshake-error',e.message);hv='2.0';}
  send('handshake',String(hv));
  try{vp.subscribe(function(){
    send('AdLoaded');
    setTimeout(function(){safeStartAd(vp,0);},500);
  },'AdLoaded');}catch(e){}
  var evs=['AdStarted','AdStopped','AdError','AdSkipped','AdImpression','AdVideoStart','AdVideoFirstQuartile','AdVideoMidpoint','AdVideoThirdQuartile','AdVideoComplete','AdPaused','AdPlaying','AdVolumeChange','AdClickThru','AdInteraction'];
  evs.forEach(function(ev){try{vp.subscribe(function(){send(ev);},ev);}catch(_){}});
  try{vp.initAd(C.w,C.h,'normal',0,{AdParameters:C.cd||''},env);send('initAd-called');setTimeout(applyVpaidResizeAfterLayout,0);}catch(e){send('initAd-error',e.message);return;}
  setTimeout(function(){if(!playbackStarted){send('AdLoaded-timeout');safeStartAd(vp,0);}},12000);
}
/** IAB: getVPAID; Яндекс vpaid_loader.js: window.getVPAIDAd (см. бандл VpaidLoader). */
function tryGet(){
  if(typeof window.getVPAID==='function')try{return window.getVPAID();}catch(e){}
  if(typeof window.getVPAIDAd==='function')try{return window.getVPAIDAd();}catch(e){}
  if(window.VPAID&&typeof window.VPAID.getVPAID==='function')try{return window.VPAID.getVPAID();}catch(e){}
  if(window.VPAIDAd&&typeof window.VPAIDAd.getVPAID==='function')try{return window.VPAIDAd.getVPAID();}catch(e){}
  return tryDiscoverVpaidApi();
}
/** Обход нестандартных имён глобала (минификация, вендоры). */
function tryDiscoverVpaidApi(){
  var k,fn,vp;
  var names=['getVpaidAd','getVpaid','vpaid_getVPAID'];
  for(var i=0;i<names.length;i++){
    k=names[i];
    if(typeof window[k]!=='function')continue;
    try{vp=window[k]();if(vp&&typeof vp.initAd==='function')return vp;}catch(e){}
  }
  for(k in window){
    if(!/^getVPAID/i.test(k)&&!/^getVpaid/i.test(k))continue;
    if(typeof window[k]!=='function')continue;
    try{
      vp=window[k]();
      if(vp&&typeof vp.initAd==='function')return vp;
    }catch(e){}
  }
  return null;
}
var n=0,delays=[0,16,50,100,200,400,800,1200,2000,3200,5000];
function step(){
  var vp=tryGet();
  if(vp){boot(vp);return;}
  if(n>=delays.length){send('no-getVPAID');return;}
  setTimeout(step,delays[n++]);
}
var sc=document.createElement('script');
sc.src=C.scriptUrl;
sc.async=true;
sc.onerror=function(){send('script-load-error');};
sc.onload=function(){step();};
document.body.appendChild(sc);
})();
<\/script></body></html>`;
}

/** URL последнего запроса VAST в режиме «По URL» — разрешение относительных MediaFile и прокси. */
let lastChkVastPageUrl = '';
let vpaidBlobUrlToRevoke = null;
/**
 * @type {null | {
 *   item: { mode: string, file: object, label: string },
 *   w: number, h: number, cd: string,
 *   resolvedScriptUrl: string,
 *   usedBlob: boolean,
 * }}
 */
let vpaidLastLoadContext = null;
/** Прореживание AdInteraction в ленте (часть VPAID шлёт на каждый ввод в поле). */
let vpaidLastAdInteractionFeedAt = 0;

function revokeVpaidBlobIfAny() {
  if (vpaidBlobUrlToRevoke) {
    try { URL.revokeObjectURL(vpaidBlobUrlToRevoke); } catch { /* ignore */ }
    vpaidBlobUrlToRevoke = null;
  }
}

/**
 * В &lt;MediaFile&gt; иногда пишут aspect как width="16" height="9" вместо пикселей — слот 16×9 px ломает VPAID (крошечная картинка).
 * @returns {{ w: number, h: number }}
 */
function normalizeVpaidSlotDimensions(/** @type {unknown} */ widthAttr, /** @type {unknown} */ heightAttr) {
  const w = parseInt(String(widthAttr ?? '').trim(), 10);
  const h = parseInt(String(heightAttr ?? '').trim(), 10);
  const MIN_W = 200;
  const MIN_H = 120;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < MIN_W || h < MIN_H) return { w: 640, h: 360 };
  return { w, h };
}

/**
 * Часть VPAID-бандлов (GetShop и др.) держит URL прогрессивного видео внутри JS, без &lt;MediaFile&gt; video/mp4.
 * Паттерн из открытых креативов: <code>video:"https://…mp4"</code> в минифицированном конфиге.
 */
async function enrichDataWithVpaidBundledLinearVideo(/** @type {any} */ data) {
  if (!data || !Array.isArray(data.mediaFiles)) return;
  const { vpaidFiles, videoFiles } = getMediaBuckets(data.mediaFiles);
  if (videoFiles.length || !vpaidFiles.length) return;
  const f = vpaidFiles[0];
  if (!f?.url) return;
  const scriptUrl = resolveMediaFileUrl(f.url, lastChkVastPageUrl);
  let text = '';
  try {
    const r = await fetch(scriptUrl, { mode: 'cors', credentials: 'omit' });
    if (r.ok) text = await r.text();
  } catch { /* часто CORS */ }
  if (!text.trim()) {
    try {
      const r2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(scriptUrl)}`);
      const j = await r2.json();
      text = j && typeof j.contents === 'string' ? j.contents : '';
    } catch { /* ignore */ }
  }
  if (!text.trim()) return;
  const re = /\bvideo\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(text)) !== null) {
    const u = String(m[1] || '').trim();
    if (!u || seen.has(u)) continue;
    if (!/\.(mp4|webm|m3u8)(\?|#|$)/i.test(u)) continue;
    seen.add(u);
    const low = u.toLowerCase();
    const type = low.includes('.m3u8') ? 'application/vnd.apple.mpegurl'
      : low.includes('.webm') ? 'video/webm' : 'video/mp4';
    data.mediaFiles.push({
      url: u,
      type,
      delivery: 'progressive',
      width: '',
      height: '',
      bitrate: '',
      api: '',
      kind: 'media',
      source: 'vpaidScript',
    });
    break;
  }
}

/**
 * Абсолютный URL ресурса: относительные пути (часто в Wrapper) — от базы URL тега VAST.
 * @param {string|null|undefined} raw
 * @param {string} baseUrl
 */
function resolveMediaFileUrl(raw, baseUrl) {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (!baseUrl) return s;
  try {
    return new URL(s, baseUrl).href;
  } catch {
    return s;
  }
}

function isHttpsPageLoadingHttpResource(url) {
  try {
    if (typeof location === 'undefined') return false;
    if (location.protocol !== 'https:') return false;
    return new URL(url).protocol === 'http:';
  } catch {
    return false;
  }
}

/** Тот же прокси, что и для VAST — обход mixed content и части блокировок. */
async function fetchJavascriptViaProxyAsBlobUrl(scriptUrl) {
  const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(scriptUrl)}`);
  const json = await r.json();
  const contents = json && typeof json.contents === 'string' ? json.contents : '';
  if (!contents.trim()) throw new Error('пустой ответ прокси');
  const blob = new Blob([contents], { type: 'application/javascript;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/** @type {Array<{ mode: 'vpaid-sandbox'|'vpaid-yandex'|'html'|'vpaid-js', file: object, label: string }>} */
let vpaidInteractiveList = [];
/** Защита от повторного старта отложенной загрузки VPAID (двойной клик по Click / кнопке). */
let vpaidDeferredLoadInFlight = false;

/**
 * MP4 из vpaid.js уже идёт в верхний плеер — автоматический startAd в iframe дублирует сценарий
 * (GetShop Vitrina и др.: сразу «стороний» UI и автоплей). Интерактив подгружаем только по кнопке.
 */
function shouldDeferVpaidInteractiveLoad(/** @type {any} */ data) {
  if (!data || !Array.isArray(data.mediaFiles)) return false;
  const { vpaidFiles, videoFiles } = getMediaBuckets(data.mediaFiles);
  if (!vpaidFiles.length) return false;
  return videoFiles.some(f => f.source === 'vpaidScript');
}

/**
 * Yandex Ad SDK (AdLoader) имеет смысл только для VAST/креативов экосистемы Яндекса.
 * Остальной VPAID (MediaVitrina, GetShop и т.д.) — IAB-песочница в iframe.
 */
function shouldUseYandexAdSdkForVpaid(/** @type {{ url?: string }} */ file, /** @type {any} */ data) {
  const u = (file.url || '').toLowerCase();
  if (/yandex\.ru\/ads|yastatic\.net\/.*\/ads|\/ads\/system\/adsdk|adfox\.ru/i.test(u)) return true;
  const sys = String(data?.adSystem || '').toLowerCase();
  if (/yandex|adfox|яндекс/.test(sys)) return true;
  return false;
}

/** Активная область VPAID (Yandex или iframe-песочница), если она видима. */
function getActiveVpaidMountElement() {
  if (!vpaidPanel || vpaidPanel.classList.contains('hidden')) return null;
  if (!adfoxYandexWrap.classList.contains('hidden') && adfoxYandexWrap.getAttribute('aria-hidden') !== 'true')
    return adfoxYandexWrap;
  if (!vpaidSandboxWrap.classList.contains('hidden') && vpaidSandboxWrap.getAttribute('aria-hidden') !== 'true')
    return vpaidSandboxWrap;
  return null;
}

function refreshVpaidMountFullscreenBtn() {
  if (!vpaidMountFullscreenBtn) return;
  vpaidMountFullscreenBtn.disabled = !getActiveVpaidMountElement();
}

function clearVpaidSandbox() {
  destroyYandexAdPlayback();
  adfoxYandexWrap.classList.add('hidden');
  adfoxYandexWrap.setAttribute('aria-hidden', 'true');
  vpaidLastLoadContext = null;
  revokeVpaidBlobIfAny();
  try {
    vpaidSandboxFrame.srcdoc = '';
    vpaidSandboxFrame.removeAttribute('srcdoc');
    vpaidSandboxFrame.src = 'about:blank';
  } catch { /* ignore */ }
  vpaidSandboxWrap.classList.add('hidden');
  vpaidSandboxWrap.setAttribute('aria-hidden', 'true');
  refreshVpaidMountFullscreenBtn();
}

function setupVpaidPanel(data, opts = {}) {
  const forceLoadInteractive = !!(opts && opts.forceLoadInteractive);
  vpaidDeferredLoadInFlight = false;
  vpaidInteractiveList = [];
  const { vpaidFiles, interactives } = getMediaBuckets(data.mediaFiles);
  vpaidFiles.forEach((f) => {
    if (!f.url) return;
    const useYa = shouldUseYandexAdSdkForVpaid(f, data);
    vpaidInteractiveList.push({
      mode: useYa ? 'vpaid-yandex' : 'vpaid-sandbox',
      file: f,
      label: useYa
        ? `VPAID · Yandex Ad SDK ${f.width || '?'}×${f.height || '?'}`
        : `VPAID · песочница ${f.width || '?'}×${f.height || '?'}`,
    });
  });
  interactives.forEach((f) => {
    if (!f.url) return;
    const asHtml = /html/i.test(f.type || '') || /\.html?(\?|#|$)/i.test(f.url);
    vpaidInteractiveList.push({
      mode: asHtml ? 'html' : 'vpaid-js',
      file: f,
      label: asHtml ? 'SIMID / HTML' : 'SIMID / JS',
    });
  });

  if (!vpaidInteractiveList.length) {
    vpaidPanel.classList.add('hidden');
    clearVpaidSandbox();
    if (vpaidDeferredLoadRow) vpaidDeferredLoadRow.classList.add('hidden');
    refreshVpaidMountFullscreenBtn();
    return;
  }

  vpaidPanel.classList.remove('hidden');
  clearVpaidSandbox();
  refreshVpaidMountFullscreenBtn();

  const deferInteractive = !forceLoadInteractive && shouldDeferVpaidInteractiveLoad(data);
  if (deferInteractive) {
    vpaidStatus.textContent = 'Линейное видео — в плеере выше (по умолчанию на паузе). Полный VPAID с баннером и кнопкой «Продолжить» не загружается, пока вы не нажмёте кнопку — воспроизведение сверху остаётся отдельным.';
    if (vpaidDeferredLoadRow) vpaidDeferredLoadRow.classList.remove('hidden');
    refreshVpaidMountFullscreenBtn();
    return;
  }
  if (vpaidDeferredLoadRow) vpaidDeferredLoadRow.classList.add('hidden');

  vpaidStatus.textContent = 'Автозагрузка интерактива…';
  /** Небольшая задержка после clearVpaidSandbox: iframe успевает сброситься при повторном «Анализировать». */
  setTimeout(() => {
    void loadVpaidIntoSandbox().catch((e) => {
      const s = e instanceof Error ? e.message : String(e);
      vpaidStatus.textContent = `Ошибка загрузки VPAID: ${s}`;
      console.error(e);
    });
  }, 48);
}

/** Повторная загрузка iframe / Yandex SDK с тем же разобранным VAST (без нового «Анализировать»). */
function reloadVpaidInteractive() {
  if (!vastData) {
    vpaidStatus.textContent = 'Нет данных VAST — нажмите «Анализировать».';
    return;
  }
  setupVpaidPanel(vastData, { forceLoadInteractive: true });
}

async function retryVpaidLoadViaProxy() {
  const ctx = vpaidLastLoadContext;
  if (!ctx || ctx.usedBlob) return;
  const { w, h, cd, resolvedScriptUrl } = ctx;
  vpaidStatus.textContent = 'Повторная загрузка скрипта через прокси…';
  revokeVpaidBlobIfAny();
  try {
    const blob = await fetchJavascriptViaProxyAsBlobUrl(resolvedScriptUrl);
    vpaidBlobUrlToRevoke = blob;
    vpaidLastLoadContext = { ...ctx, usedBlob: true };
    try { vpaidSandboxFrame.src = 'about:blank'; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 48));
    vpaidSandboxFrame.srcdoc = buildVpaidSrcdoc(blob, w, h, cd);
    vpaidStatus.textContent = 'Загрузка VPAID (JS) в песочницу…';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    vpaidStatus.textContent = `Прокси не помог: ${msg}`;
  }
}

async function loadVpaidIntoSandbox() {
  try {
  const item = vpaidInteractiveList[0];
  if (!item) return;
  if (item.mode === 'vpaid-yandex') {
    try {
      await loadYandexVastAdPlayback();
    } catch (e) {
      const s = e instanceof Error ? e.message : String(e);
      vpaidStatus.textContent = `Yandex Ad SDK: ${s}`;
      console.error(e);
    }
    return;
  }

  if (!item.file?.url) return;

  const f = item.file;
  const { w, h } = normalizeVpaidSlotDimensions(f.width, f.height);
  const cd = vastData && vastData.adParameters ? vastData.adParameters : '';

  adfoxYandexWrap.classList.add('hidden');
  adfoxYandexWrap.setAttribute('aria-hidden', 'true');
  destroyYandexAdPlayback();

  vpaidSandboxWrap.classList.remove('hidden');
  vpaidSandboxWrap.setAttribute('aria-hidden', 'false');
  vpaidLastLoadContext = null;

  if (item.mode === 'html') {
    try { vpaidSandboxFrame.removeAttribute('srcdoc'); } catch { /* ignore */ }
    revokeVpaidBlobIfAny();
    try { vpaidSandboxFrame.src = 'about:blank'; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 48));
    const htmlUrl = resolveMediaFileUrl(f.url, lastChkVastPageUrl);
    if (isHttpsPageLoadingHttpResource(htmlUrl)) {
      vpaidStatus.textContent = 'HTTP-страница в iframe на HTTPS заблокирована браузером. Нужен HTTPS-URL ресурса или вставка XML в режиме «Только XML».';
      return;
    }
    vpaidSandboxFrame.src = htmlUrl;
    vpaidStatus.textContent = 'Загрузка HTML в iframe…';
    return;
  }

  try { vpaidSandboxFrame.src = 'about:blank'; } catch { /* ignore */ }
  revokeVpaidBlobIfAny();
  /** Дать iframe сброситься (перезапуск при повторном анализе). */
  await new Promise((r) => setTimeout(r, 48));

  const resolvedScriptUrl = resolveMediaFileUrl(f.url, lastChkVastPageUrl);
  vpaidStatus.textContent = 'Подготовка VPAID…';

  let scriptUrlForIframe = resolvedScriptUrl;
  let usedBlob = false;

  try {
    if (isHttpsPageLoadingHttpResource(resolvedScriptUrl)) {
      vpaidStatus.textContent = 'HTTP-скрипт на HTTPS-странице — загрузка через прокси…';
      const blob = await fetchJavascriptViaProxyAsBlobUrl(resolvedScriptUrl);
      vpaidBlobUrlToRevoke = blob;
      scriptUrlForIframe = blob;
      usedBlob = true;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    vpaidStatus.textContent = `Прокси: ${msg}`;
    return;
  }

  vpaidLastLoadContext = { item, w, h, cd, resolvedScriptUrl, usedBlob };

  vpaidSandboxFrame.srcdoc = buildVpaidSrcdoc(scriptUrlForIframe, w, h, cd);
  vpaidStatus.textContent = 'Загрузка VPAID (JS) в песочницу…';
  } finally {
    refreshVpaidMountFullscreenBtn();
  }
}

function onVpaidSandboxMessage(/** @type {MessageEvent} */ e) {
  const d = e.data;
  if (!d || d.type !== 'zi-vpaid') return;
  try {
    const cw = vpaidSandboxFrame.contentWindow;
    if (cw && e.source && e.source !== cw) return;
  } catch { /* ignore */ }
  const msg = d.msg || '';
  const extra = d.extra ? String(d.extra) : '';

  if (msg === 'sandbox-started') {
    vpaidStatus.textContent = 'VPAID: startAd выполнен — кнопки креатива и видео работают; не ставьте ролик на паузу сразу (часть сценариев GetShop и др. ждёт воспроизведения).';
  } else if (msg === 'initAd-called') {
    vpaidStatus.textContent = 'initAd вызван; ожидание AdLoaded (или таймаут 8 с → fallback startAd).';
  } else if (msg === 'script-load-error') {
    vpaidStatus.textContent = 'Скрипт не загрузился (сеть, CSP, 404, блокировка).';
    if (vpaidLastLoadContext && !vpaidLastLoadContext.usedBlob) {
      void retryVpaidLoadViaProxy();
    }
  } else if (msg === 'no-getVPAID') {
    vpaidStatus.textContent = 'Не найден API объекта VPAID (getVPAID / getVPAIDAd и др.) после ожидания — проверьте CSP, блокировку скрипта или другой экспорт креатива.';
  } else if (msg === 'vpaid-invalid') {
    vpaidStatus.textContent = 'Объект без initAd — ожидается VPAID 2.0.';
  } else if (msg === 'initAd-error' || msg === 'startAd-error') {
    vpaidStatus.textContent = `${msg}: ${extra}`;
  } else if (msg === 'handshake-timeout') {
    vpaidStatus.textContent = 'handshakeVersion не ответил за 4 с — переход к initAd.';
  } else if (msg === 'AdLoaded-timeout') {
    vpaidStatus.textContent = 'AdLoaded не пришёл за 8 с — вызван startAd в режиме совместимости.';
  } else if (msg === 'handshake' || msg === 'handshake-error') {
    vpaidStatus.textContent = msg + (extra ? `: ${extra}` : '');
  } else if (
    msg === 'native-pause' || msg === 'native-resume' || msg === 'native-click'
    || msg === 'native-mute' || msg === 'native-unmute' || msg === 'native-rate'
    || msg === 'native-fs-enter' || msg === 'native-fs-exit'
  ) {
    /* только лента событий; не затираем статус строкой «native-pause» */
  } else {
    vpaidStatus.textContent = msg + (extra ? ` — ${extra}` : '');
  }

  /** Нативные pause/play/click/mute/fs/rate по video в песочнице — URL из VAST */
  if (vastData && msg === 'native-mute') {
    addFeedEntry('mute', 'mute', vastData.eventMap.mute || []);
    return;
  }
  if (vastData && msg === 'native-unmute') {
    addFeedEntry('unmute', 'unmute', vastData.eventMap.unmute || []);
    return;
  }
  if (vastData && msg === 'native-fs-enter') {
    addFeedEntry('fullscreen', 'fullscreen', vastData.eventMap.fullscreen || []);
    return;
  }
  if (vastData && msg === 'native-fs-exit') {
    addFeedEntry('exitFullscreen', 'exitFullscreen', vastData.eventMap.exitFullscreen || []);
    return;
  }
  if (vastData && msg === 'native-rate') {
    addFeedEntry('playbackRate', `playbackRate ×${extra}`, urlsFromEventMapForKey(vastData.eventMap, 'playbackRate'));
    return;
  }
  if (vastData && (msg === 'native-pause' || msg === 'native-resume' || msg === 'native-click')) {
    if (msg === 'native-pause') {
      addFeedEntry('pause', 'pause', vastData.eventMap.pause || []);
    } else if (msg === 'native-resume') {
      addFeedEntry('resume', 'resume', vastData.eventMap.resume || []);
    } else if (extra === '1') {
      /** extra: доверенный клик из песочницы; «0» — синтетический (креатив) — не дублируем clickThrough с AdInteraction */
      const urls = vastClickUrlsForFeed(vastData);
      addFeedEntry('clickThrough', 'clickThrough', urls.length ? urls : (vastData.eventMap.clickThrough || []));
    }
    return;
  }

  /** События VPAID 2.0 из песочницы (iframe), попадающие в ленту */
  const sandboxVpaidEvents = new Set([
    'AdStarted', 'AdVideoStart', 'AdVideoFirstQuartile', 'AdVideoMidpoint', 'AdVideoThirdQuartile',
    'AdVideoComplete', 'AdStopped', 'AdError', 'AdSkipped', 'AdLoaded', 'AdImpression',
    'AdPaused', 'AdPlaying', 'AdVolumeChange', 'AdClickThru', 'AdInteraction',
  ]);
  /** Диагностика загрузки/ошибок — в ленту без URL трекеров */
  const sandboxDiagMessages = new Set([
    'handshake', 'sandbox-started', 'initAd-called', 'AdLoaded-timeout', 'handshake-error',
    'vpaid-invalid', 'no-getVPAID', 'script-load-error', 'initAd-error', 'startAd-error',
  ]);
  const toFeed = sandboxVpaidEvents.has(msg) || sandboxDiagMessages.has(msg)
    || msg === 'handshake-timeout' || (msg.endsWith('-error') && msg !== 'handshake-error');
  if (!toFeed || !vastData) return;

  if (msg === 'AdInteraction') {
    const now = Date.now();
    if (now - vpaidLastAdInteractionFeedAt < 320) return;
    vpaidLastAdInteractionFeedAt = now;
  }

  const label = extra ? `${msg}: ${extra}` : msg;
  const useDiagUrls = sandboxDiagMessages.has(msg) || msg === 'handshake-timeout'
    || (msg.endsWith('-error') && !sandboxVpaidEvents.has(msg));
  let urls = null;
  if (!useDiagUrls) {
    if (msg === 'AdClickThru') {
      const merged = vastClickUrlsForFeed(vastData);
      urls = merged.length ? merged : vastEventMapUrls(vastData.eventMap, msg);
    } else {
      urls = vastEventMapUrls(vastData.eventMap, msg);
    }
  }
  const feedUrls = useDiagUrls ? null : urls;
  const feedOpts = !useDiagUrls && Array.isArray(urls) && urls.length === 0
    ? { feedHint: 'vpaid-js' }
    : undefined;
  addFeedEntry(msg, label, feedUrls, feedOpts);
}

window.addEventListener('message', onVpaidSandboxMessage);

// ─── Player ───────────────────────────────────────────────────────────────────
const video          = /** @type {HTMLVideoElement} */ (chk$('chk-video'));
const playerOverlay  = chk$('player-overlay');
const playerBigPlay  = chk$('player-big-play');
const playerBadge    = chk$('player-badge');
const playerTime     = chk$('player-time');
const playerFill     = chk$('player-progress-fill');
const playerProgBg   = chk$('player-progress-bg');
const feedList       = chk$('player-feed-list');
const feedLiveDot    = chk$('feed-live-dot');
const ctrlPlay       = chk$('ctrl-play');
const ctrlMute       = chk$('ctrl-mute');
const ctrlVol        = /** @type {HTMLInputElement} */ (chk$('ctrl-vol'));
const ctrlSkip       = chk$('ctrl-skip');
const ctrlClick      = chk$('ctrl-click');
const ctrlFullscreen = chk$('ctrl-fullscreen');
const vpaidNote      = chk$('player-vpaid-note');
const feedClearBtn   = chk$('player-feed-clear');
const playerStageRoot = chk$('player-stage-root');
const playerMainStack = chk$('player-main-stack');
const playerVideoWrap = chk$('player-video-wrap');
const playerSourceSelect = /** @type {HTMLSelectElement} */ (chk$('player-source-select'));
const playerSourceLabel = chk$('player-source-label');
const playerFormatBadge = chk$('player-format-badge');
const ctrlSeekBack   = chk$('ctrl-seek-back');
const ctrlSeekFwd    = chk$('ctrl-seek-fwd');
const ctrlCaptions   = chk$('ctrl-captions');
const ctrlPlaybackRate = /** @type {HTMLSelectElement|null} */ (document.getElementById('ctrl-playback-rate'));

const CHK_VPAID_NOTE_DISMISS_KEY = 'zi-chk-vpaid-note-dismissed';

/** Элемент в полноэкранном режиме (стандарт + webkit/moz/ms). */
function getDocumentFullscreenElement() {
  const d = document;
  return d.fullscreenElement
    || d.webkitFullscreenElement
    || d.mozFullScreenElement
    || d.msFullscreenElement
    || null;
}

function enterElementFullscreen(/** @type {HTMLElement} */ el) {
  const req = el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.webkitRequestFullScreen
    || el.mozRequestFullScreen
    || el.msRequestFullscreen;
  if (!req) return Promise.reject(new Error('Fullscreen API недоступен'));
  return Promise.resolve(req.call(el));
}

/** Полноэкран только основного плеера (chk-video + прогресс + тулбар), без панели VPAID / стороннего video. */
function enterChkMainPlayerFullscreen() {
  return enterElementFullscreen(playerMainStack);
}

function exitDocumentFullscreen() {
  const d = document;
  const exit = d.exitFullscreen
    || d.webkitExitFullscreen
    || d.webkitCancelFullScreen
    || d.mozCancelFullScreen
    || d.msExitFullscreen;
  if (!exit) return Promise.resolve();
  return Promise.resolve(exit.call(d)).catch(() => {});
}

/** Песочница VPAID не получает document.fullscreenElement родителя — дергаем resize после смены layout. */
function notifyVpaidIframeParentLayout() {
  try {
    if (vpaidSandboxWrap.classList.contains('hidden')) return;
    const cw = vpaidSandboxFrame.contentWindow;
    if (!cw) return;
    cw.postMessage({ type: 'zi-chk-parent-layout' }, '*');
  } catch { /* ignore */ }
}

/** Сброс inline-метрик fullscreen (ниже — правка под innerWidth/innerHeight). */
function clearZiChkMainPlayerFullscreenMetrics() {
  const propsStack = ['width', 'min-height', 'height', 'max-height', 'display', 'flex-direction', 'box-sizing'];
  const propsWrap = ['flex', 'min-height', 'max-height', 'width', 'height'];
  const propsVid = ['width', 'min-height', 'height', 'max-height'];
  propsStack.forEach((p) => { try { playerMainStack.style.removeProperty(p); } catch { /* ignore */ } });
  propsWrap.forEach((p) => { try { playerVideoWrap.style.removeProperty(p); } catch { /* ignore */ } });
  propsVid.forEach((p) => { try { video.style.removeProperty(p); } catch { /* ignore */ } });
}

/**
 * Chromium/Edge на части конфигов дают :fullscreen высоту ≈ половины экрана при height:100vh.
 * Жёстко выставляем размеры по innerWidth/innerHeight — как у реального вьюпорта окна.
 */
function applyZiChkMainPlayerFullscreenMetrics(/** @type {HTMLElement} */ fsEl) {
  const w = `${window.innerWidth}px`;
  const h = `${window.innerHeight}px`;
  if (fsEl === playerMainStack) {
    playerMainStack.style.setProperty('width', w, 'important');
    playerMainStack.style.setProperty('min-height', h, 'important');
    playerMainStack.style.setProperty('height', h, 'important');
    playerMainStack.style.setProperty('max-height', 'none', 'important');
    playerMainStack.style.setProperty('box-sizing', 'border-box', 'important');
    playerMainStack.style.setProperty('display', 'flex', 'important');
    playerMainStack.style.setProperty('flex-direction', 'column', 'important');
    playerVideoWrap.style.setProperty('flex', '1 1 0', 'important');
    playerVideoWrap.style.setProperty('min-height', '0', 'important');
    playerVideoWrap.style.setProperty('max-height', 'none', 'important');
    return;
  }
  if (fsEl === playerVideoWrap) {
    playerVideoWrap.style.setProperty('width', w, 'important');
    playerVideoWrap.style.setProperty('min-height', h, 'important');
    playerVideoWrap.style.setProperty('height', h, 'important');
    playerVideoWrap.style.setProperty('max-height', 'none', 'important');
    playerVideoWrap.style.setProperty('box-sizing', 'border-box', 'important');
    return;
  }
  if (fsEl === video) {
    video.style.setProperty('width', w, 'important');
    video.style.setProperty('min-height', h, 'important');
    video.style.setProperty('height', h, 'important');
    video.style.setProperty('max-height', 'none', 'important');
  }
}

function syncChkPlayerFullscreenState() {
  const el = getDocumentFullscreenElement();
  clearZiChkMainPlayerFullscreenMetrics();
  if (el === playerMainStack || el === playerVideoWrap || el === video) {
    applyZiChkMainPlayerFullscreenMetrics(/** @type {HTMLElement} */ (el));
  }

  const root = playerStageRoot;
  const inOurPlayer = Boolean(el && (
    el === root
    || (root.contains && root.contains(el))
    || el === playerMainStack
    || (playerMainStack.contains && playerMainStack.contains(el))
    || el === playerVideoWrap
    || el === video
    || (playerVideoWrap.contains && playerVideoWrap.contains(el))
    || el === adfoxYandexWrap
    || (adfoxYandexWrap.contains && adfoxYandexWrap.contains(el))
    || el === vpaidSandboxWrap
    || (vpaidSandboxWrap.contains && vpaidSandboxWrap.contains(el))
  ));
  if (inOurPlayer) {
    chkPlayerWasFullscreen = true;
    notifyVpaidIframeParentLayout();
    try {
      window.dispatchEvent(new Event('resize'));
    } catch { /* ignore */ }
    return;
  }
  if (!el && chkPlayerWasFullscreen && vastData) {
    chkPlayerWasFullscreen = false;
    fireRepeat('exitFullscreen', 'Exit fullscreen');
  }
  notifyVpaidIframeParentLayout();
  try {
    window.dispatchEvent(new Event('resize'));
  } catch { /* ignore */ }
}

function getCaptionLikeTracks() {
  if (!video.textTracks || !video.textTracks.length) return [];
  return Array.from(video.textTracks).filter(
    (t) => t.kind === 'subtitles' || t.kind === 'captions',
  );
}

function updateCaptionsBtnState() {
  if (!ctrlCaptions) return;
  const tracks = getCaptionLikeTracks();
  const has = tracks.length > 0;
  ctrlCaptions.disabled = !has;
  const showing = has && tracks.some((t) => t.mode === 'showing');
  ctrlCaptions.setAttribute('aria-pressed', showing ? 'true' : 'false');
  ctrlCaptions.title = has
    ? (showing ? 'Скрыть субтитры' : 'Показать субтитры')
    : 'В ролике нет дорожек субтитров';
}

function toggleCaptions() {
  const tracks = getCaptionLikeTracks();
  if (!tracks.length) return;
  const anyShowing = tracks.some((t) => t.mode === 'showing');
  if (anyShowing) {
    tracks.forEach((t) => { t.mode = 'hidden'; });
  } else {
    tracks.forEach((t) => { t.mode = 'hidden'; });
    tracks[0].mode = 'showing';
  }
  updateCaptionsBtnState();
}

/** Основной плеер: полноэкранный режим (для трека exitFullscreen при выходе). */
let chkPlayerWasFullscreen = false;

/** @type {ReturnType<typeof setTimeout>|undefined} */
let feedLiveDotTimer;

const QUARTILE_MARKS = document.querySelectorAll('.player-quartile-mark');
const QUARTILES = [
  { pct: 0.25, key: 'firstQuartile',  label: 'First Quartile', mark: QUARTILE_MARKS[0] },
  { pct: 0.50, key: 'midpoint',       label: 'Midpoint',       mark: QUARTILE_MARKS[1] },
  { pct: 0.75, key: 'thirdQuartile',  label: 'Third Quartile', mark: QUARTILE_MARKS[2] },
].filter(q => q.mark instanceof HTMLElement);

const EVENT_COLORS = {
  Impression:    '#ff3d3a',
  start:         '#00c47a',
  firstQuartile: '#00c47a',
  midpoint:      '#00c47a',
  thirdQuartile: '#00c47a',
  complete:      '#00c47a',
  pause:         '#e89a00',
  resume:        '#00c4bc',
  mute:          '#9b7ee0',
  unmute:        '#9b7ee0',
  fullscreen:    '#9b7ee0',
  exitFullscreen:'#9b7ee0',
  playbackRate:  '#00c4bc',
  skip:          '#ff3d3a',
  clickThrough:  '#9b7ee0',
  clickTracking: '#9b7ee0',
  error:         '#ff3d3a',
  AdPaused:       '#e89a00',
  AdPlaying:      '#00c4bc',
  AdResumed:      '#00c4bc',
  AdVolumeChange: '#9b7ee0',
  AdClickThru:    '#9b7ee0',
  AdClickThrough: '#9b7ee0',
  AdClicked:      '#9b7ee0',
  AdInteraction:  '#9b7ee0',
  AdSkipped:      '#ff3d3a',
  AdPodSkipped:   '#ff3d3a',
  AdUserInteraction: '#9b7ee0',
};

let vastData       = null;
let firedOnce      = new Set();
let isMutedState   = false;

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function applyVideoSource(file) {
  const c = classifyLinearMediaFile(file);
  try { video.autoplay = false; } catch { /* ignore */ }
  video.src = file.url || '';
  video.load();
  try { video.pause(); } catch { /* ignore */ }
  try {
    const r = ctrlPlaybackRate ? parseFloat(ctrlPlaybackRate.value) : 1;
    video.playbackRate = isFinite(r) && r > 0 ? r : 1;
  } catch { /* ignore */ }
  playerFormatBadge.textContent = c.formatLabel;
  playerFormatBadge.dataset.fmt = c.formatKey;
  let hint = file.url || '';
  if (c.isHls && !browserSupportsNativeHls()) {
    playerFormatBadge.textContent = `${c.formatLabel} · не в Chrome`;
    hint += ' — HLS: нативно в Safari; в Chromium без HLS.js не играет';
  }
  playerFormatBadge.title = hint;
  playerFormatBadge.classList.remove('hidden');
}

function playerSeekBy(deltaSec) {
  if (!video.duration || !isFinite(video.duration)) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSec));
  updateProgressUi();
}

function setPlayIcon(playing) {
  const icon = document.getElementById('ctrl-play-icon');
  if (!icon) return;
  icon.outerHTML = playing
    ? '<svg id="ctrl-play-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg id="ctrl-play-icon" width="14" height="14" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg>';
}

/**
 * @param {string|null} urls список URL трекеров из VAST; null — внешний плеер / диагностика, без строки URL
 * @param {{ feedHint?: 'vpaid-js' }} [opts] feedHint: событие из iframe VPAID, в XML нет URL
 */
function addFeedEntry(key, label, urls, opts) {
  const empty = document.getElementById('player-feed-empty');
  if (empty) empty.remove();

  while (feedList.children.length >= PLAYER_FEED_MAX_ENTRIES) {
    feedList.firstElementChild?.remove();
  }

  feedLiveDot.classList.add('active');
  clearTimeout(feedLiveDotTimer);
  feedLiveDotTimer = setTimeout(() => feedLiveDot.classList.remove('active'), 2000);

  const color  = EVENT_COLORS[key] || '#6870a0';
  const t      = fmtTime(video.currentTime);
  let urlStr;
  if (urls === null) {
    urlStr = '<span class="feed-no-urls">—</span>';
  } else if (urls.length) {
    urlStr = `<span class="feed-url-text" data-url="${escChk(urls[0])}">${escChk(urls[0].slice(0, 55))}${urls[0].length > 55 ? '…' : ''}</span>${urls.length > 1 ? ` <em>+${urls.length - 1}</em>` : ''}`;
  } else if (opts && opts.feedHint === 'vpaid-js') {
    urlStr = '<span class="feed-vpaid-js-hint" title="В VAST нет URL для этого события — запрос шлёт vpaid.js. Смотрите Network (F12).">пиксели из VPAID (не в XML)</span>';
  } else {
    urlStr = '<span class="feed-no-vast-url" style="color:var(--t4)" title="В VAST нет URL для этого события (нет &lt;Tracking&gt; в Linear и т.п.).">нет URL в VAST</span>';
  }

  const el = document.createElement('div');
  el.className = 'feed-entry';
  el.innerHTML = `
    <div class="feed-dot-wrap">
      <span class="feed-dot" style="background:${color}"></span>
      <span class="feed-dot-ping" style="background:${color}"></span>
    </div>
    <div class="feed-info">
      <div class="feed-name">${label}</div>
      <div class="feed-urls">${urlStr}</div>
    </div>
    <div class="feed-time">${t}</div>`;
  feedList.appendChild(el);
  feedList.scrollTop = feedList.scrollHeight;

  const node = flowNodeByEvent.get(key);
  if (node) {
    node.classList.add('flow-node-active');
    setTimeout(() => node.classList.remove('flow-node-active'), 1200);
  }
}

// Fire one-time event (impression, progress)
function fireOnce(key, label) {
  if (!vastData || firedOnce.has(key)) return;
  firedOnce.add(key);
  addFeedEntry(key, label, urlsFromEventMapForKey(vastData.eventMap, key));
}

// Fire repeatable event
function fireRepeat(key, label) {
  if (!vastData) return;
  addFeedEntry(key, label, urlsFromEventMapForKey(vastData.eventMap, key));
}

/** Обновление полосы и времени; реже ~60 Hz, чтобы не перегружать layout/рендер. */
const PROGRESS_UI_MIN_MS = 100;
let progressRafId = 0;
let lastProgressUiAt = 0;

function updateProgressVisual() {
  if (!video.duration || !isFinite(video.duration)) return;
  const pct = video.currentTime / video.duration;
  playerFill.style.width = `${pct * 100}%`;
  playerTime.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
}

function maybeFireQuartiles() {
  if (!video.duration || !isFinite(video.duration)) return;
  const pct = video.currentTime / video.duration;
  QUARTILES.forEach(q => {
    if (pct >= q.pct && !firedOnce.has(q.key)) {
      firedOnce.add(q.key);
      q.mark.classList.add('fired');
      addFeedEntry(q.key, q.label, vastData?.eventMap[q.key] || []);
    }
  });
}

function updateProgressUi() {
  updateProgressVisual();
  maybeFireQuartiles();
}

function progressTick() {
  if (video.paused || video.ended) return;
  const now = performance.now();
  if (now - lastProgressUiAt >= PROGRESS_UI_MIN_MS) {
    lastProgressUiAt = now;
    updateProgressVisual();
  }
  maybeFireQuartiles();
  progressRafId = requestAnimationFrame(progressTick);
}

function startProgressLoop() {
  cancelAnimationFrame(progressRafId);
  progressRafId = requestAnimationFrame(progressTick);
}

function stopProgressLoop() {
  cancelAnimationFrame(progressRafId);
  progressRafId = 0;
}

function initPlayer(data) {
  // Stop previous playback
  stopProgressLoop();
  try { video.pause(); } catch {}
  video.src = '';
  video.load();

  const onlyVpaidHintEl = document.getElementById('player-only-vpaid-hint');
  if (onlyVpaidHintEl) onlyVpaidHintEl.classList.add('hidden');
  const legacyMirror = document.getElementById('player-vpaid-mirror-hint');
  if (legacyMirror) legacyMirror.remove();
  playerBigPlay.classList.remove('hidden');

  if (vpaidInteractiveMounts) vpaidInteractiveMounts.classList.remove('hidden');
  if (vpaidToggleMountsBtn) {
    vpaidToggleMountsBtn.textContent = 'Скрыть блок';
    vpaidToggleMountsBtn.setAttribute('aria-expanded', 'true');
  }

  vastData       = data;
  firedOnce      = new Set();
  isMutedState   = false;
  chkPlayerWasFullscreen = false;

  feedList.innerHTML = PLAYER_FEED_EMPTY_HTML;

  QUARTILES.forEach(q => q.mark.classList.remove('fired'));
  playerFill.style.width  = '0%';
  playerBadge.textContent = 'ОЖИДАНИЕ';
  playerBadge.className   = 'player-badge';
  playerTime.textContent  = '0:00 / 0:00';
  playerOverlay.classList.remove('hidden');
  try {
    if (ctrlPlaybackRate) {
      ctrlPlaybackRate.value = '1';
      video.playbackRate = 1;
    }
  } catch { /* ignore */ }
  vpaidNote.classList.add('hidden');
  feedLiveDot.classList.remove('active');
  setPlayIcon(false);

  const { vpaidFiles, videoFiles, interactives } = getMediaBuckets(data.mediaFiles);

  playerVideoFileList = videoFiles;
  playerSourceSelect.innerHTML = '';
  playerSourceSelect.classList.add('hidden');
  playerSourceLabel.classList.add('hidden');
  playerFormatBadge.classList.add('hidden');
  playerFormatBadge.textContent = '';
  playerFormatBadge.removeAttribute('data-fmt');

  // Show VPAID/SIMID note but still play video if regular MediaFiles exist
  if (interactives.length > 0 || vpaidFiles.length > 0) {
    let hideVpNote = false;
    try {
      hideVpNote = sessionStorage.getItem(CHK_VPAID_NOTE_DISMISS_KEY) === '1';
    } catch { /* ignore */ }
    let noteLine = '';
    if (vpaidFiles.length) {
      const fromVpaidScript = videoFiles.some(f => f.source === 'vpaidScript');
      const hasAp = videoFiles.some(f => f.source === 'adParameters' || f.source === 'vpaidScript');
      if (videoFiles.length) {
        if (fromVpaidScript) {
          noteLine = 'Здесь только видео из VPAID (старт с паузы). Полный интерактив не подгружается сам — кнопка «Загрузить интерактив VPAID» в блоке ниже.';
        } else if (hasAp) {
          noteLine = `VPAID (${vpaidFiles.length}) — ниже. Ролик из AdParameters играет здесь.`;
        } else {
          noteLine = `VPAID (${vpaidFiles.length}) — ниже. Обычное видео — здесь, интерактив — в «VPAID / интерактив».`;
        }
      } else {
        noteLine = `VPAID (${vpaidFiles.length}) — только ниже: MP4/WebM в теге нет.`;
      }
    } else if (interactives.length) {
      noteLine = videoFiles.length
        ? `SIMID (${interactives.length}) — ниже. Видео — здесь.`
        : `SIMID (${interactives.length}) — только ниже: MP4/WebM в теге нет.`;
    }
    if (hideVpNote) {
      vpaidNote.classList.add('hidden');
      vpaidNote.innerHTML = '';
    } else {
      vpaidNote.classList.remove('hidden');
      const showScrollToVpaid = vpaidFiles.length > 0 && videoFiles.length > 0;
      const scrollBtnHtml = showScrollToVpaid
        ? '<button type="button" class="player-vpaid-note-scroll btn ghost sm">К блоку VPAID</button>'
        : '';
      vpaidNote.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
      <span class="player-vpaid-note-text">${noteLine}</span>
      ${scrollBtnHtml}
      <button type="button" class="player-vpaid-note-close" id="player-vpaid-note-close" aria-label="Скрыть подсказку" title="Скрыть">×</button>`;
      const scrollToVpaidBtn = vpaidNote.querySelector('.player-vpaid-note-scroll');
      if (scrollToVpaidBtn) {
        scrollToVpaidBtn.addEventListener('click', () => {
          try { vpaidPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* ignore */ }
        });
      }
    }
    if (!videoFiles.length) {
      playerBadge.textContent = 'ТОЛЬКО VPAID';
      playerBadge.className = 'player-badge paused';
      playerTime.textContent = '— / —';
      playerBigPlay.classList.add('hidden');
      let hintEl = document.getElementById('player-only-vpaid-hint');
      if (!hintEl) {
        hintEl = document.createElement('div');
        hintEl.id = 'player-only-vpaid-hint';
        hintEl.className = 'player-only-vpaid-hint hidden';
        hintEl.setAttribute('role', 'status');
        playerOverlay.appendChild(hintEl);
      }
      hintEl.textContent = 'В VAST нет линейного MP4/WebM — видео с баннером только в блоке «VPAID / интерактив» ниже.';
      hintEl.classList.remove('hidden');
      setupVpaidPanel(data);
      return;
    }
  }

  setupVpaidPanel(data);

  if (!videoFiles.length) return;

  if (videoFiles.length > 1) {
    playerSourceSelect.classList.remove('hidden');
    playerSourceLabel.classList.remove('hidden');
    videoFiles.forEach((f, idx) => {
      const c = classifyLinearMediaFile(f);
      const dims = f.width && f.height ? `${f.width}×${f.height}` : '';
      const br = f.bitrate ? `${f.bitrate} kbps` : '';
      const meta = [dims, br].filter(Boolean).join(' · ');
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${c.formatLabel}${meta ? ` · ${meta}` : ''}`;
      playerSourceSelect.appendChild(opt);
    });
    const best = pickBestLinearVideoFile(videoFiles);
    const bestIdx = best ? videoFiles.indexOf(best.file) : 0;
    playerSourceSelect.value = String(Math.max(0, bestIdx));
    applyVideoSource(videoFiles[Math.max(0, bestIdx)] || videoFiles[0]);
  } else {
    applyVideoSource(videoFiles[0]);
  }
  try {
    void video.pause();
    playerOverlay.classList.remove('hidden');
    setPlayIcon(false);
    playerBadge.textContent = 'PAUSED';
    playerBadge.className = 'player-badge paused';
  } catch { /* ignore */ }
}

// ── Video events ───────────────────────────────────────────────────────────────
video.addEventListener('play', () => {
  playerOverlay.classList.add('hidden');
  playerBadge.textContent = 'PLAYING';
  playerBadge.className   = 'player-badge playing';
  setPlayIcon(true);

  fireOnce('Impression', 'Impression');
  if (!firedOnce.has('start')) {
    fireOnce('start', 'Start');
  } else {
    fireRepeat('resume', 'Resume');
  }
  startProgressLoop();
});

video.addEventListener('pause', () => {
  stopProgressLoop();
  updateProgressUi();
  setPlayIcon(false);
  if (video.ended) return;
  playerBadge.textContent = 'PAUSED';
  playerBadge.className   = 'player-badge paused';
  fireRepeat('pause', 'Pause');
});

video.addEventListener('ended', () => {
  stopProgressLoop();
  playerOverlay.classList.remove('hidden');
  playerBadge.textContent = 'ENDED';
  playerBadge.className   = 'player-badge ended';
  setPlayIcon(false);
  QUARTILES.forEach(q => {
    if (!firedOnce.has(q.key)) {
      firedOnce.add(q.key);
      q.mark.classList.add('fired');
      addFeedEntry(q.key, q.label, vastData?.eventMap[q.key] || []);
    }
  });
  fireOnce('complete', 'Complete');
  playerFill.style.width = '100%';
});

video.addEventListener('volumechange', () => {
  const nowMuted = video.muted || video.volume === 0;
  if (nowMuted === isMutedState) return;
  isMutedState = nowMuted;
  ctrlMute.classList.toggle('active', nowMuted);
  const muteIcon = document.getElementById('ctrl-mute-icon');
  if (muteIcon) muteIcon.style.opacity = nowMuted ? '.35' : '1';
  if (nowMuted) fireRepeat('mute', 'Mute');
  else          fireRepeat('unmute', 'Unmute');
});

/**
 * Квартили: дублируем с rAF (на паузе rAF может не вызывать maybeFireQuartiles каждый кадр).
 * Фоновая вкладка: rAF почти не крутится — подстраховка прогресса и квартилей.
 */
video.addEventListener('timeupdate', () => {
  if (video.paused || video.ended) return;
  maybeFireQuartiles();
  if (document.visibilityState === 'hidden') {
    const now = performance.now();
    if (now - lastProgressUiAt >= PROGRESS_UI_MIN_MS) {
      lastProgressUiAt = now;
      updateProgressVisual();
    }
  }
});

video.addEventListener('seeked', () => {
  updateProgressUi();
});

video.addEventListener('loadedmetadata', () => {
  playerTime.textContent = `0:00 / ${fmtTime(video.duration)}`;
  playerFill.style.width = '0%';
  /** Синхронизация с реальным mute/volume — иначе первый volumechange после смены ролика теряется. */
  isMutedState = video.muted || video.volume === 0;
  try {
    ctrlVol.value = String(video.volume);
    } catch { /* ignore */ }
  /** Без автозапуска: ролик на паузе до действия пользователя (кнопка Play / большая кнопка на превью). */
  if (video.src) {
    playerBadge.textContent = 'PAUSED';
    playerBadge.className = 'player-badge paused';
  }
  updateCaptionsBtnState();
});

try {
  video.textTracks.addEventListener('addtrack', () => {
    queueMicrotask(() => updateCaptionsBtnState());
  });
} catch { /* ignore */ }
video.addEventListener('emptied', () => updateCaptionsBtnState());

video.addEventListener('error', () => {
  if (!vastData) return;
  playerBadge.textContent = 'ERROR';
  playerBadge.className   = 'player-badge ended';
  fireRepeat('error', 'Error (video load failed)');
});

// Progress bar — click to seek
playerProgBg.addEventListener('click', e => {
  if (!video.duration) return;
  const rect = playerProgBg.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  video.currentTime = pct * video.duration;
  updateProgressUi();
});

// ── Controls ──────────────────────────────────────────────────────────────────
function togglePlayerPlay() {
  if (!video.src) return;
  video.paused ? video.play() : video.pause();
}
ctrlPlay.addEventListener('click', togglePlayerPlay);
playerBigPlay.addEventListener('click', () => {
  togglePlayerPlay();
  queueMicrotask(() => { try { playerVideoWrap.focus({ preventScroll: true }); } catch {} });
});

ctrlMute.addEventListener('click', () => {
  video.muted = !video.muted;
  if (!video.muted && video.volume === 0) video.volume = 0.5;
});

if (ctrlCaptions) {
  ctrlCaptions.addEventListener('click', () => {
    if (ctrlCaptions.disabled) return;
    toggleCaptions();
  });
}

playerVideoWrap.addEventListener('click', (e) => {
  const btn = e.target.closest('#player-vpaid-note-close');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  vpaidNote.classList.add('hidden');
  vpaidNote.innerHTML = '';
  try {
    sessionStorage.setItem(CHK_VPAID_NOTE_DISMISS_KEY, '1');
  } catch { /* ignore */ }
});

ctrlVol.addEventListener('input', () => {
  video.volume = parseFloat(ctrlVol.value);
  if (video.volume > 0) video.muted = false;
});

ctrlSkip.addEventListener('click', () => {
  fireRepeat('skip', 'Skip');
  video.pause();
  if (video.duration) video.currentTime = video.duration;
});

ctrlClick.addEventListener('click', () => {
  if (!vastData) return;
  const em = vastData.eventMap;
  const through = em.clickThrough || [];
  const tracking = em.clickTracking || [];
  const seen = new Set();
  for (const u of through) {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    addFeedEntry('clickThrough', 'Click Through', [s]);
  }
  for (const u of tracking) {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    addFeedEntry('clickTracking', 'Click Tracking', [s]);
  }
  startDeferredVpaidInteractiveLoad();
});

ctrlFullscreen.addEventListener('click', () => {
  fireRepeat('fullscreen', 'Fullscreen');
  if (getDocumentFullscreenElement()) {
    void exitDocumentFullscreen();
    return;
  }
  enterChkMainPlayerFullscreen().catch(() => {
    const w = playerVideoWrap;
    const v = video;
    const rw = w.requestFullscreen || w.webkitRequestFullscreen || w.mozRequestFullScreen || w.msRequestFullscreen;
    if (rw) void Promise.resolve(rw.call(w)).catch(() => {});
    else {
      const rv = v.requestFullscreen || v.webkitRequestFullscreen || v.mozRequestFullScreen || v.msRequestFullscreen;
      if (rv) void Promise.resolve(rv.call(v)).catch(() => {});
    }
  });
});

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((ev) => {
  document.addEventListener(ev, syncChkPlayerFullscreenState);
});

window.addEventListener('resize', () => {
  try {
    const el = getDocumentFullscreenElement();
    if (el === playerMainStack || el === playerVideoWrap || el === video)
      applyZiChkMainPlayerFullscreenMetrics(/** @type {HTMLElement} */ (el));
  } catch { /* ignore */ }
});

if (ctrlPlaybackRate) {
  ctrlPlaybackRate.addEventListener('change', () => {
    if (!vastData || !video.src) return;
    const r = parseFloat(ctrlPlaybackRate.value);
    if (!isFinite(r) || r <= 0) return;
    video.playbackRate = r;
    fireRepeat('playbackRate', `playbackRate ×${r}`);
  });
}

ctrlSeekBack.addEventListener('click', () => playerSeekBy(-10));
ctrlSeekFwd.addEventListener('click', () => playerSeekBy(10));

playerSourceSelect.addEventListener('change', () => {
  const i = parseInt(playerSourceSelect.value, 10);
  const f = playerVideoFileList[i];
  if (!f) return;
  try { video.pause(); } catch {}
  firedOnce = new Set();
  QUARTILES.forEach(q => q.mark.classList.remove('fired'));
  playerFill.style.width = '0%';
  playerBadge.textContent = 'ОЖИДАНИЕ';
  playerBadge.className = 'player-badge';
  applyVideoSource(f);
  try {
    void video.pause();
    playerOverlay.classList.remove('hidden');
    setPlayIcon(false);
    playerBadge.textContent = 'PAUSED';
    playerBadge.className = 'player-badge paused';
  } catch { /* ignore */ }
});

playerVideoWrap.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'KeyK') {
    e.preventDefault();
    if (!video.src) return;
    video.paused ? video.play() : video.pause();
    return;
  }
  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    playerSeekBy(e.shiftKey ? -30 : -10);
    return;
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    playerSeekBy(e.shiftKey ? 30 : 10);
  }
});

feedClearBtn.addEventListener('click', () => {
  feedList.innerHTML = PLAYER_FEED_EMPTY_HTML;
  feedLiveDot.classList.remove('active');
});

if (vpaidReloadBtn) {
  vpaidReloadBtn.addEventListener('click', () => {
    reloadVpaidInteractive();
  });
}

if (vpaidMountFullscreenBtn) {
  vpaidMountFullscreenBtn.addEventListener('click', () => {
    if (!vastData) return;
    fireRepeat('fullscreen', 'Fullscreen (интерактив)');
    const mount = getActiveVpaidMountElement();
    if (!mount) return;
    const fs = getDocumentFullscreenElement();
    if (fs === mount || (mount.contains && fs && mount.contains(fs))) {
      void exitDocumentFullscreen();
      return;
    }
    void (async () => {
      if (fs) await exitDocumentFullscreen();
      try {
        await enterElementFullscreen(mount);
      } catch { /* ignore */ }
    })();
  });
}

if (vpaidToggleMountsBtn && vpaidInteractiveMounts) {
  vpaidToggleMountsBtn.addEventListener('click', () => {
    const collapsed = vpaidInteractiveMounts.classList.toggle('hidden');
    vpaidToggleMountsBtn.textContent = collapsed ? 'Показать блок' : 'Скрыть блок';
    vpaidToggleMountsBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}

/** Отложенный VPAID (MP4 сверху + скрипт): та же загрузка, что по кнопке «Загрузить интерактив VPAID». */
function startDeferredVpaidInteractiveLoad() {
  if (!vastData || !shouldDeferVpaidInteractiveLoad(vastData)) return;
  if (getActiveVpaidMountElement()) return;
  if (vpaidDeferredLoadInFlight) return;
  if (vpaidDeferredLoadRow) vpaidDeferredLoadRow.classList.add('hidden');
  vpaidStatus.textContent = 'Загрузка интерактива…';
  try {
    vpaidPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch { /* ignore */ }
  setTimeout(() => {
    vpaidDeferredLoadInFlight = true;
    void loadVpaidIntoSandbox()
      .catch((e) => {
        const s = e instanceof Error ? e.message : String(e);
        vpaidStatus.textContent = `Ошибка загрузки VPAID: ${s}`;
        if (vastData && shouldDeferVpaidInteractiveLoad(vastData) && vpaidDeferredLoadRow) {
          vpaidDeferredLoadRow.classList.remove('hidden');
        }
      })
      .finally(() => {
        vpaidDeferredLoadInFlight = false;
      });
  }, 48);
}

if (vpaidDeferredLoadBtn) {
  vpaidDeferredLoadBtn.addEventListener('click', () => {
    startDeferredVpaidInteractiveLoad();
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function escChk(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Events ───────────────────────────────────────────────────────────────────
initXmlCodeEditor();

(function setupCheckerTabVisibilityRefresh() {
  const panel = document.getElementById('panel-zichecker');
  if (!panel || typeof MutationObserver === 'undefined') return;
  new MutationObserver(() => {
    if (panel.classList.contains('active')) scheduleXmlCmRefresh();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
})();

chkBtnParse.addEventListener('click', doChkParse);

chkUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doChkParse();
});
chkUrlInput.addEventListener('paste', () => setTimeout(doChkParse, 80));

function setXmlEditorStatus(msg, kind) {
  chkXmlStatus.textContent = msg;
  chkXmlStatus.className = 'xml-editor-status' + (kind ? ` ${kind}` : '');
}

chkXmlFormatBtn.addEventListener('click', () => {
  const raw = getXmlText().trim();
  if (!raw) {
    setXmlEditorStatus('Нет текста для форматирования', 'bad');
    return;
  }
  try {
    setXmlText(formatVastXml(raw));
    setXmlEditorStatus('Отформатировано', 'ok');
  } catch {
    setXmlEditorStatus('Ошибка: XML не well-formed', 'bad');
  }
});

chkXmlValidateBtn.addEventListener('click', () => {
  const raw = getXmlText().trim();
  if (!raw) {
    setXmlEditorStatus('Пустое поле', 'bad');
    return;
  }
  const fromWord = tryExtractVastFromWordMl(raw);
  const base = fromWord != null ? fromWord : raw;
  const slice = extractVastXmlFromText(base) || base;
  const doc = new DOMParser().parseFromString(slice.trim(), 'text/xml');
  if (doc.querySelector('parsererror')) setXmlEditorStatus('XML не well-formed (ошибка парсера)', 'bad');
  else if (!doc.querySelector('VAST')) setXmlEditorStatus('XML корректен, но нет корня <VAST>', 'warn');
  else setXmlEditorStatus('Well-formed XML, корень VAST найден', 'ok');
});

if (!xmlCm) {
  chkXmlInput.addEventListener('paste', () => setTimeout(doChkParse, 80));
  chkXmlInput.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      doChkParse();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const start = chkXmlInput.selectionStart;
      const end = chkXmlInput.selectionEnd;
      const v = chkXmlInput.value;
      chkXmlInput.value = `${v.slice(0, start)}  ${v.slice(end)}`;
      chkXmlInput.selectionStart = chkXmlInput.selectionEnd = start + 2;
    }
  });
}

chkBtnClear.addEventListener('click', () => {
  lastChkVastPageUrl = '';
  chkUrlInput.value = '';
  setXmlText('');
  chkXmlStatus.textContent = '';
  chkXmlStatus.className = 'xml-editor-status';
  chkResults.classList.add('hidden');
  chkValBar.className = 'val-bar hidden';
  stopProgressLoop();
  try { video.pause(); video.src = ''; } catch {}
  vastData = null;
  clearVpaidSandbox();
  vpaidInteractiveList = [];
  try { vpaidPanel.classList.add('hidden'); } catch { /* ignore */ }
  const infraCard = document.getElementById('chk-infra-card');
  const infraBody = document.getElementById('chk-infra-body');
  if (infraBody) infraBody.innerHTML = '';
  if (infraCard) infraCard.classList.add('hidden');
});

// ─── Открытие по ссылке: ?tab=zichecker&url=https://… (или &vast=…) ───────────
(function initCheckerFromShareLink() {
  const sp = new URLSearchParams(window.location.search);
  const urlParam = sp.get('url') || sp.get('vast');
  const openChecker = sp.get('tab') === 'zichecker' || sp.has('checker');
  if (!openChecker || !urlParam) return;
  const u = urlParam.trim();
  if (!/^https?:\/\//i.test(u)) return;
  requestAnimationFrame(() => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="zichecker"]');
    if (tabBtn instanceof HTMLElement) tabBtn.click();
    chkUrlInput.value = u;
    switchChkMode('url');
    doChkParse();
  });
})();
