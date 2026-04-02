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

/** @type {any} */
let xmlCm = null;

function getXmlText() {
  return xmlCm ? xmlCm.getValue() : chkXmlInput.value;
}

function setXmlText(/** @type {string} */ s) {
  if (xmlCm) xmlCm.setValue(s);
  else chkXmlInput.value = s;
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
}

let chkMode = 'url'; // 'url' | 'xml'

function switchChkMode(mode) {
  chkMode = mode;
  chkModeUrl.classList.toggle('active', mode === 'url');
  chkModeXml.classList.toggle('active', mode === 'xml');
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

const CHK_XML_COLLAPSE_KEY = 'ziteg_chk_xml_collapsed_v1';
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
    const text = await resp.text();
    analyzeVastHttpResponse(resp.status, ct, text, push, label);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push('info', `${label}: прямой запрос недоступен (${msg}) — пробуем прокси allorigins`);
    try {
      const r2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      const json = await r2.json();
      const body = json && typeof json.contents === 'string' ? json.contents : '';
      if (!body.trim()) throw new Error('Прокси вернул пустой ответ');
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
  const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Невалидный XML');
  const root = doc.documentElement;
  if (!root) throw new Error('Пустой документ');
  const decl = trimmed.match(/^<\?xml[\s\S]*?\?>\s*/i);
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

// ─── Parse a single VAST XML string ──────────────────────────────────────────
function parseVAST(xmlStr) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlStr.trim(), 'text/xml');
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

  // ── Event map ──
  const eventMap = {};

  const impressions = [...doc.querySelectorAll('Impression')].map(el => el.textContent.trim()).filter(Boolean);
  if (impressions.length) eventMap['Impression'] = impressions;

  const errors = [...doc.querySelectorAll('Error')].map(el => el.textContent.trim()).filter(Boolean);
  if (errors.length) eventMap['error'] = errors;

  doc.querySelectorAll('Tracking').forEach(el => {
    const ev  = el.getAttribute('event');
    const url = el.textContent.trim();
    if (!ev || !url) return;
    if (!eventMap[ev]) eventMap[ev] = [];
    eventMap[ev].push(url);
  });

  const clickThroughs  = [...doc.querySelectorAll('ClickThrough')].map(el => el.textContent.trim()).filter(Boolean);
  if (clickThroughs.length)  eventMap['clickThrough']  = clickThroughs;
  const clickTrackings = [...doc.querySelectorAll('ClickTracking')].map(el => el.textContent.trim()).filter(Boolean);
  if (clickTrackings.length) eventMap['clickTracking'] = clickTrackings;

  // ── Media files (Linear) ──
  const mediaFiles = [...doc.querySelectorAll('MediaFile')].map(el => ({
    url:      el.textContent.trim(),
    type:     el.getAttribute('type') || '',
    delivery: el.getAttribute('delivery') || '',
    width:    el.getAttribute('width') || '',
    height:   el.getAttribute('height') || '',
    bitrate:  el.getAttribute('bitrate') || '',
    api:      el.getAttribute('apiFramework') || '',
    kind:     'media',
  }));

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
  if (!impressions.length)   issues.push({ level: 'error', msg: 'Нет ни одного <Impression> пикселя (обязательный элемент VAST)' });
  if (!errors.length)        issues.push({ level: 'warn',  msg: 'Не задан <Error> URL — по IAB рекомендуется для передачи кодов ошибок ([ERRORCODE])' });
  if (!eventMap['start'])    issues.push({ level: 'warn',  msg: 'Отсутствует трекер события start' });
  if (!eventMap['complete']) issues.push({ level: 'warn',  msg: 'Отсутствует трекер события complete' });

  const missingQuartiles = ['firstQuartile', 'midpoint', 'thirdQuartile'].filter(k => !eventMap[k]);
  if (adType === 'InLine' && linearEl && mediaFiles.length && missingQuartiles.length) {
    issues.push({
      level: 'warn',
      msg: `Нет квартильных Tracking: ${missingQuartiles.join(', ')} — для отчётности и бирж обычно требуются все три + start/complete`,
    });
  }

  const hasNonVpaidLinear = mediaFiles.some(m => !isVpaidLike(m));
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
    version, adType, wrapperUrl, adTitle, adSystem,
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

  const infra = data.adInfra;
  if (infra && (infra.items?.length || infra.scannedUrls > 0)) {
    html += '<div class="chk-ad-infra">';
    html += '<span class="chk-ad-infra-label">Инфраструктура</span>';
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
        ? ` &lt;AdSystem&gt;: <strong>${adSys}</strong>.`
        : '';
      html += `<p class="ad-infra-empty">Проверено ${n} URL — совпадений с каталогом SSP/DSP нет.${adSysLine}</p>`;
    }
    html += '</div>';
  }

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
  const cls   = errs.length ? 'error' : (warns.length || infos.length) ? 'warn' : 'ok';
  const icon  = errs.length ? '✗' : '⚠';
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

// ─── Render event flow ────────────────────────────────────────────────────────
function renderFlow(data) {
  const { eventMap, isVPAID } = data;
  let html = '';

  const groups = isVPAID ? EVENT_GROUPS : EVENT_GROUPS.filter(g => !g.label.includes('VPAID'));

  groups.forEach((group, gi) => {
    html += `<div class="flow-group">`;
    if (group.label !== 'Показ') {
      html += `<div class="flow-group-label">${group.label}</div>`;
    }
    group.events.forEach((ev, i) => {
      const urls   = eventMap[ev.key] || [];
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
            ${hasIt
              ? `<div class="flow-count has">${count} URL${count > 1 ? 's' : ''}</div>`
              : `<div class="flow-count">не задан</div>`}
          </div>
        </div>`;
    });
    html += `</div>`;
  });

  chkFlow.innerHTML = html;
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
    const meta    = [dims, bitrate, m.delivery].filter(Boolean).join(' · ');

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

  // No media at all
  if (!linearFiles.length && !interactives.length) {
    add('error', 'Нет медиафайлов', 'VAST не содержит ни одного <MediaFile> — воспроизведение невозможно');
  }

  // VPAID-only
  if (vpaidFiles.length > 0 && videoFiles.length === 0 && interactives.length === 0) {
    add('error', 'Только VPAID', `${vpaidFiles.length} файл(ов) VPAID, видеофайлов нет — воспроизведение зависит от SDK плеера`);
  } else if (vpaidFiles.length > 0) {
    add('warn', `VPAID + видео (${vpaidFiles.length}+${videoFiles.length})`, 'VPAID не воспроизводится в браузере напрямую, но обычные MediaFile присутствуют');
  }

  // Impression missing
  if (!data.eventMap['Impression']?.length) {
    add('error', 'Нет <Impression> пикселя', 'Показ рекламы не будет засчитан — обязательный элемент отсутствует');
  }

  // Error URL missing
  if (!data.eventMap['error']?.length) {
    add('warn', 'Нет <Error> URL', 'Ошибки плеера не будут отслежены — <Error> URL не задан');
  }

  // Start/Complete
  if (!data.eventMap['start']) {
    add('warn', 'Нет трекера start', 'Начало воспроизведения не будет подтверждено — верификация невозможна');
  }
  if (!data.eventMap['complete']) {
    add('warn', 'Нет трекера complete', 'Досмотр до конца не будет зафиксирован');
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
    add('Платформы', 'info', `Распознано: ${preview}${adInfra.items.length > 4 ? '…' : ''}`,
      'По доменам трекеров, медиа, врапперов и тексту <AdSystem> (популярные РФ/СНГ и международные SSP/DSP). Уточняйте требования у поставщика.');
  }

  const { linearFiles, vpaidFiles, videoFiles, interactives, nonLinears } = getMediaBuckets(data.mediaFiles);
  const allUrls      = Object.values(data.eventMap).flat();
  const hasHttp      = allUrls.some(u => u.startsWith('http://'));
  const mp4Files     = videoFiles.filter(m => /mp4/i.test(m.type) || /\.mp4(\?|$)/i.test(m.url));
  const webmOnly     = videoFiles.length > 0 && videoFiles.every(m => /webm/i.test(m.type) || /\.webm(\?|$)/i.test(m.url));
  const version      = parseFloat(data.version) || 0;
  const lowBitrateOnly = videoFiles.length > 0 && videoFiles.every(m => { const b = parseInt(m.bitrate)||0; return b > 0 && b < 800; });

  // ── IAB VAST spec ──
  if (!data.adSystem) add('IAB VAST', 'warn', '<AdSystem> отсутствует', 'Элемент обязателен по спецификации VAST для идентификации рекламной системы');
  if (!data.adTitle && data.adType === 'InLine') add('IAB VAST', 'info', '<AdTitle> отсутствует', 'Рекомендован для идентификации объявления');
  if (!data.eventMap['Impression']?.length) add('IAB VAST', 'error', 'Нет <Impression>', 'Обязательный элемент — без него показ не засчитается');
  if (!data.duration && linearFiles.length) add('IAB VAST', 'warn', 'Нет <Duration>', 'Обязателен в <Linear> согласно VAST 3+');
  if (!data.eventMap['error']?.length) add('IAB VAST', 'info', 'Нет <Error> URL', 'Рекомендован для отслеживания ошибок воспроизведения');
  if (version > 0 && version < 3.0) add('IAB VAST', 'warn', `VAST ${data.version} — устаревшая версия`, 'VAST 4.x рекомендован IAB. Некоторые SSP не поддерживают 2.x');

  const em = data.eventMap || {};
  const missQ = ['firstQuartile', 'midpoint', 'thirdQuartile'].filter(k => !em[k]);
  if (data.adType === 'InLine' && missQ.length && videoFiles.length) {
    add('IAB / биржи', 'warn', `Нет квартильных событий: ${missQ.join(', ')}`, 'OpenRTB/SSP часто ожидают полный набор progress + start/complete для биллинга');
  }
  if (data.adType === 'InLine' && videoFiles.length && !em.clickThrough?.length) {
    add('IAB VAST', 'warn', 'Нет ClickThrough у видеокреатива', 'Для кликабельной in-stream рекламы элемент рекомендован; без него часть SDK не откроет целевую страницу');
  }
  if (data.duration && !/^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(String(data.duration).trim())) {
    add('IAB VAST', 'warn', 'Нестандартный формат Duration', 'Ожидается HH:MM:SS или HH:MM:SS.mmm — иначе плеер может отклонить креатив');
  }
  const noMime = videoFiles.filter(m => !m.type || m.type === 'video/');
  if (noMime.length) {
    add('IAB / плееры', 'warn', `${noMime.length} MediaFile без корректного type`, 'MIME (например video/mp4) помогает выбрать декодер; без него растут отказы на CTV/TV-браузерах');
  }
  if (data.adType === 'InLine' && linearFiles.some(m => !isVpaidLike(m))) {
    const noWH = linearFiles.filter(m => !isVpaidLike(m) && (!m.width || !m.height));
    if (noWH.length) {
      add('IAB VAST', 'info', 'У MediaFile не заданы width/height', 'Атрибуты рекомендованы для подбора варианта под размер плеера');
    }
  }

  // ── Google IMA SDK ──
  if (hasHttp) add('Google IMA', 'error', 'HTTP URLs (Mixed Content)', 'Google IMA на HTTPS-страницах блокирует все http:// пиксели и медиафайлы');
  if (vpaidFiles.length > 0) add('Google IMA', 'warn', 'VPAID обнаружен', 'Google IMA SDK 3.x отключил VPAID по умолчанию — используйте OMID/SIMID');
  if (data.chain && data.chain.length > 3) add('Google IMA', 'warn', `Цепочка ${data.chain.length} уровней`, 'Google IMA имеет таймаут на разрешение враперов (~3 сек на уровень)');
  if (linearFiles.length > 0 && mp4Files.length === 0) add('Google IMA', 'warn', 'Нет MP4-файла', 'Google IMA SDK предпочитает video/mp4 — без него выбор формата нестабилен');

  // ── CTV / OTT ──
  if (vpaidFiles.length > 0 && videoFiles.length === 0) {
    add('CTV / OTT', 'error', 'Только VPAID — не воспроизведётся', 'VPAID не поддерживается ни на одной CTV-платформе (Roku, Fire TV, Apple TV)');
  } else if (vpaidFiles.length > 0) {
    add('CTV / OTT', 'warn', 'VPAID среди MediaFiles', 'VPAID-файлы будут проигнорированы CTV-плеером; воспроизведение продолжится через MP4');
  }
  if (interactives.length > 0) add('CTV / OTT', 'warn', 'SIMID/InteractiveCreativeFile', 'Большинство CTV SDK не поддерживают SIMID (Fire TV, Roku, LG, Samsung)');
  if (nonLinears.length > 0) add('CTV / OTT', 'warn', 'NonLinear-объявление', 'NonLinear не поддерживается CTV-плеерами — будет проигнорировано');
  if (lowBitrateOnly) add('CTV / OTT', 'warn', 'Низкий битрейт для CTV', 'Все файлы <800 kbps — на большом экране будет видно артефакты (рек. ≥1500)');
  if (webmOnly) add('CTV / OTT', 'error', 'Только WebM — не воспроизведётся', 'WebM не поддерживается на большинстве CTV-устройств');

  // ── Mobile / In-App ──
  if (hasHttp) add('Mobile', 'error', 'HTTP трекеры/медиа', 'Мобильные приложения (iOS ATS, Android Network Policy) требуют HTTPS');
  if (webmOnly) add('Mobile', 'error', 'Только WebM', 'WebM не поддерживается на iOS Safari/WKWebView — нужен MP4-фоллбэк');
  if (vpaidFiles.length > 0 && videoFiles.length === 0) add('Mobile', 'error', 'Только VPAID', 'VPAID не поддерживается в мобильных SDK (IMA, MAX, AppLovin)');

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
  renderRootCause(data);
  renderCompliance(data);
  initPlayer(data);
  chkResults.classList.remove('hidden');
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

    if (chkMode === 'url') {
      const url = chkUrlInput.value.trim();
      if (!url) return;
      xmlStr = await fetchVASTXmlWithDiagnostics(url, loadAcc);
    } else {
      xmlStr = getXmlText().trim();
      if (!xmlStr) return;
    }

    // Quick peek — is it a Wrapper? If so resolve chain
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
    processResults(data);
    if (parsedFromUrl) showFetchedXmlInEditor(xmlStr, data);

  } catch (e) {
    showChkError(`Ошибка загрузки: ${e.message}. Попробуйте вставить XML напрямую.`);
  } finally {
    chkBtnParse.innerHTML = BTN_PARSE_INNER;
    chkBtnParse.classList.remove('scanning');
  }
}

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
const playerVideoWrap = chk$('player-video-wrap');
const playerSourceSelect = /** @type {HTMLSelectElement} */ (chk$('player-source-select'));
const playerSourceLabel = chk$('player-source-label');
const playerFormatBadge = chk$('player-format-badge');
const ctrlSeekBack   = chk$('ctrl-seek-back');
const ctrlSeekFwd    = chk$('ctrl-seek-fwd');

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
  skip:          '#ff3d3a',
  clickThrough:  '#9b7ee0',
  clickTracking: '#9b7ee0',
  error:         '#ff3d3a',
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
  video.src = file.url || '';
  video.load();
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
}

function setPlayIcon(playing) {
  const icon = document.getElementById('ctrl-play-icon');
  if (!icon) return;
  icon.outerHTML = playing
    ? '<svg id="ctrl-play-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg id="ctrl-play-icon" width="14" height="14" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor"/></svg>';
}

function addFeedEntry(key, label, urls) {
  const empty = feedList.querySelector('.player-feed-empty');
  if (empty) empty.remove();

  feedLiveDot.classList.add('active');
  clearTimeout(feedLiveDotTimer);
  feedLiveDotTimer = setTimeout(() => feedLiveDot.classList.remove('active'), 2000);

  const color  = EVENT_COLORS[key] || '#6870a0';
  const t      = fmtTime(video.currentTime);
  const urlStr = urls.length
    ? `<span class="feed-url-text" data-url="${escChk(urls[0])}">${escChk(urls[0].slice(0, 55))}${urls[0].length > 55 ? '…' : ''}</span>${urls.length > 1 ? ` <em>+${urls.length - 1}</em>` : ''}`
    : '<span style="color:var(--t4)">трекер не задан</span>';

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

  // Highlight matching flow node
  const node = chkFlow.querySelector(`[data-event="${key}"]`);
  if (node) {
    node.classList.add('flow-node-active');
    setTimeout(() => node.classList.remove('flow-node-active'), 1200);
  }
}

// Fire one-time event (impression, progress)
function fireOnce(key, label) {
  if (!vastData || firedOnce.has(key)) return;
  firedOnce.add(key);
  addFeedEntry(key, label, vastData.eventMap[key] || []);
}

// Fire repeatable event
function fireRepeat(key, label) {
  if (!vastData) return;
  addFeedEntry(key, label, vastData.eventMap[key] || []);
}

function initPlayer(data) {
  // Stop previous playback
  try { video.pause(); } catch {}
  video.src = '';
  video.load();

  vastData       = data;
  firedOnce      = new Set();
  isMutedState   = false;

  feedList.innerHTML = PLAYER_FEED_EMPTY_HTML;

  QUARTILES.forEach(q => q.mark.classList.remove('fired'));
  playerFill.style.width  = '0%';
  playerBadge.textContent = 'ОЖИДАНИЕ';
  playerBadge.className   = 'player-badge';
  playerTime.textContent  = '0:00 / 0:00';
  playerOverlay.classList.remove('hidden');
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
    vpaidNote.classList.remove('hidden');
    const parts = [];
    if (interactives.length) parts.push(`SIMID/Интерактив (${interactives.length})`);
    if (vpaidFiles.length)   parts.push(`VPAID (${vpaidFiles.length})`);
    vpaidNote.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
      ${parts.join(' + ')} — не воспроизводится в браузере${videoFiles.length ? ' (видео доступно ниже)' : ''}`;
    if (!videoFiles.length) return; // no playable video at all
  }

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
});

video.addEventListener('pause', () => {
  setPlayIcon(false);
  if (video.ended) return;
  playerBadge.textContent = 'PAUSED';
  playerBadge.className   = 'player-badge paused';
  fireRepeat('pause', 'Pause');
});

video.addEventListener('ended', () => {
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

video.addEventListener('timeupdate', () => {
  if (!video.duration) return;
  const pct = video.currentTime / video.duration;
  playerFill.style.width = (pct * 100).toFixed(2) + '%';
  playerTime.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
  QUARTILES.forEach(q => {
    if (pct >= q.pct && !firedOnce.has(q.key)) {
      firedOnce.add(q.key);
      q.mark.classList.add('fired');
      addFeedEntry(q.key, q.label, vastData?.eventMap[q.key] || []);
    }
  });
});

video.addEventListener('loadedmetadata', () => {
  playerTime.textContent = `0:00 / ${fmtTime(video.duration)}`;
});

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
  fireRepeat('clickThrough',  'Click Through');
  fireRepeat('clickTracking', 'Click Tracking');
});

ctrlFullscreen.addEventListener('click', () => {
  fireRepeat('fullscreen', 'Fullscreen');
  if (playerVideoWrap.requestFullscreen) playerVideoWrap.requestFullscreen().catch(() => {});
  else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
});

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
  const doc = new DOMParser().parseFromString(raw, 'text/xml');
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
  chkUrlInput.value = '';
  setXmlText('');
  chkXmlStatus.textContent = '';
  chkXmlStatus.className = 'xml-editor-status';
  chkResults.classList.add('hidden');
  chkValBar.className = 'val-bar hidden';
  try { video.pause(); video.src = ''; } catch {}
  vastData = null;
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
