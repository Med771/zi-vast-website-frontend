'use strict';

// ─── Macro catalogue (фигурные скобки — типично для DSP/SDK в query и шаблонах) ─
const MACRO_NOTES = {
  '{app}':            'Bundle ID приложения',
  '{app_bundle}':     'Bundle ID приложения',
  '{gaid}':           'Google Advertising ID (GAID)',
  '{idfa}':           'Apple IDFA',
  '{aaid}':           'Android Advertising ID',
  '{deviceid}':       'ID устройства',
  '{device_id}':      'ID устройства',
  '{ip}':             'IP-адрес пользователя',
  '{ua}':             'User-Agent клиента',
  '{tz}':             'Часовой пояс',
  '{rnd}':            'Случайное число / кэш-бастер',
  '{cb}':             'Кэш-бастер',
  '{cachebuster}':    'Кэш-бастер',
  '{random}':         'Случайное значение (анти-кэш)',
  '{timestamp}':      'Unix-время или метка запроса',
  '{width}':          'Ширина плеера (px)',
  '{height}':         'Высота плеера (px)',
  '{player_width}':   'Ширина видеоплеера',
  '{player_height}':  'Высота видеоплеера',
  '{lat}':            'Широта',
  '{lon}':            'Долгота',
  '{latitude}':       'Широта',
  '{longitude}':      'Долгота',
  '{country}':        'Код страны (ISO)',
  '{lang}':           'Язык (ISO)',
  '{language}':       'Язык интерфейса/контента',
  '{appname}':        'Название приложения',
  '{app_name}':       'Название приложения',
  '{pageurl}':        'URL страницы с видео',
  '{page_url}':       'URL страницы',
  '{referrer}':       'Referrer',
  '{content_id}':     'ID контента / видео',
  '{duration}':       'Длительность контента (с)',
  '{video_duration}': 'Длительность ролика',
  '{correlator}':     'GAM: общий коррелятор сессии страницы',
  '{description_url}': 'GAM: URL страницы с описанием видео',
  '{iu}':             'GAM: путь рекламного блока /network/.../adunit',
  '{cust_params}':    'GAM: пользовательские пары key=value для таргетинга',
  '{gdpr}':           'Флаг GDPR (0/1)',
  '{gdpr_consent}':   'Строка TCF consent',
  '{us_privacy}':     'US Privacy (CCPA строка)',
  '{npa}':            'Режим без персонализации рекламы',
  '{ppid}':           'Publisher Provided Identifier',
  '{plcmt}':          'Тип размещения (OpenRTB plcmt)',
  '{omid}':           'Поддержка OMID / OMSDK',
  '{auction_id}':     'ID аукциона (programmatic)',
  '{creative_id}':      'ID креатива',
  '{placement_id}':     'ID размещения',
  '{publisher_id}':   'ID паблишера',
  '{site_id}':        'ID сайта / инвентаря',
  '{deal_id}':        'ID сделки PMP',
  '{seat_id}':        'ID места DSP/сид',
  '{session_id}':     'ID сессии',
  '{request_id}':     'ID запроса объявления',
  '{user_id}':        'ID пользователя (hash/anon)',
  '{segment}':        'Сегмент аудитории',
  '{keywords}':       'Ключевые слова контента',
  '{channel}':        'Канал / линейка',
  '{floor}':          'Минимальная ставка',
  '{currency}':       'Валюта (ISO)',
  '{bundle}':         'Bundle ID (синоним app)',
  '{storeurl}':       'URL страницы приложения в сторе',
  '{ifa}':            'Рекламный идентификатор устройства',
  '{dnt}':            'Do Not Track',
  '{limited_ad_tracking}': 'Ограничение трекинга (LAT)',
  '{partner}':        'ID партнёра / сети',
  '{tag_id}':         'ID тега / placement в SSP',
};

/** IAB VAST 4.x — макросы в квадратных скобках в URL трекеров (подставляет плеер/SSAI). */
const BRACKET_MACRO_NOTES = {
  '[CACHEBUSTER]':        'Случайное число — обход кэша прокси/CDN',
  '[TIMESTAMP]':          'Время события (Unix или ISO — по спецификации плеера)',
  '[ERRORCODE]':          'Код ошибки VAST при вызове Error URL',
  '[CONTENTPLAYHEAD]':    'Позиция воспроизведения основного контента (time offset)',
  '[ASSETURI]':           'URI медиа-ассета рекламы',
  '[MEDIAPLAYHEAD]':      'Позиция воспроизведения рекламного ролика',
  '[UNIVERSALADID]':      'Universal Ad ID креатива',
  '[ADCATEGORIES]':       'Категории рекламы (IAB)',
  '[BLOCKEDADCATEGORIES]': 'Заблокированные категории',
  '[DEVICEUA]':           'User-Agent устройства',
  '[IP]':                 'IP-адрес (если разрешено политикой)',
  '[LATLONG]':            'Широта и долгота',
  '[DOMAIN]':             'Домен приложения или сайта',
  '[PAGEURL]':            'URL страницы (закодированный)',
  '[PLAYER_SIZE]':        'Ширина×высота плеера',
  '[PLAYER_SIZE_OFFSET]': 'Размер с учётом offset UI',
  '[REGULATIONS]':        'Регуляторные сигналы (строка)',
  '[ADTYPE]':             'Тип объявления (linear/nonlinear и т.д.)',
  '[TRANSACTIONID]':      'ID транзакции показа',
  '[PLACEMENTTYPE]':      'Тип размещения (in-stream, и т.п.)',
  '[BREAKPOSITION]':      'Позиция рекламного блока в контенте',
  '[CONSENT]':            'Строка согласия (GDPR/CCPA и др.)',
  '[LIMITADTRACKING]':    'Ограничение рекламного трекинга',
  '[PLAYERCAPABILITIES]': 'Возможности плеера (коды)',
  '[ADCOUNT]':            'Число объявлений в pod',
  '[REASON]':             'Причина события (например skip)',
  '[MINIMUMDURATION]':    'Мин. длительность слота',
  '[MAXIMUMDURATION]':    'Макс. длительность слота',
  '[EXTENDEDADPLAYHEAD]': 'Расширенная метка прогресса',
  '[IFA]':                'Identifier for Advertising',
  '[IFA_TYPE]':           'Тип IFA (idfa, gaid, …)',
  '[CLIENTUA]':           'User-Agent клиента',
  '[SERVERUA]':           'User-Agent сервера SSAI',
  '[APPID]':              'ID приложения',
  '[BUNDLEID]':           'Bundle ID',
  '[STOREURL]':           'URL в магазине приложений',
  '[STOREID]':            'ID магазина',
  '[DEVICEID]':           'ID устройства',
};

// ─── Per-key hints (имена query-параметров: GAM, OpenRTB-стиль, SSP) ───────────
const KEY_HINTS = {
  ip:              'IP пользователя',
  ua:              'User-Agent',
  bundle:          'Bundle приложения',
  app_bundle:      'Bundle приложения',
  appid:           'ID приложения',
  app_id:          'ID приложения',
  ifa:             'Рекл. ID (GAID/IDFA)',
  gaid:            'Google Advertising ID',
  google_aid:      'Google Ad ID',
  idfa:            'Apple IDFA',
  aaid:            'Android Ad ID',
  did:             'Device ID (общий)',
  didmd5:          'Device ID MD5',
  didsha1:         'Device ID SHA1',
  w:               'Ширина (px)',
  h:               'Высота (px)',
  width:           'Ширина (px)',
  height:          'Высота (px)',
  cachebuster:     'Кэш-бастер',
  cb:              'Кэш-бастер',
  rnd:             'Случайное число',
  t:               'Время / timestamp',
  maxd:            'Макс. длительность (с)',
  mind:            'Мин. длительность (с)',
  max_ad_duration: 'GAM: макс. длительность ролика',
  min_ad_duration: 'GAM: мин. длительность ролика',
  device_type:     'Тип устройства (phone, tv, …)',
  devicetype:      'Тип устройства',
  device_os:       'ОС устройства',
  os:              'Операционная система',
  content_type:    'Тип контента',
  ad_place_type:   'Тип размещения',
  position:        'Позиция рекламы',
  is_child:        'COPPA / детская аудитория (0/1)',
  tfcd:            'GAM: Tag for Child-Directed Treatment',
  time_shift:      'Часовой пояс',
  account_id:      'ID аккаунта/устройства',
  app_storeurl:    'Ссылка на магазин',
  storeurl:        'URL приложения в сторе',
  puid60:          'Параметр приложения (сеть)',
  puid31:          'Параметр приложения',
  puid20:          'Параметр приложения',
  puid9:           'Слот puid (профиль/приложение); значение может быть %request.puid9% или %25request.puid9%25 в query',
  p1:              'Параметр паблишера',
  p2:              'Параметр паблишера',
  eid2:            'ID пользователя (ext)',
  eid3:            'ID пользователя',
  eid4:            'ID пользователя',
  // —— Google Ad Manager / IMA (частые query-параметры) ——
  iu:              'GAM: путь рекламного блока /network/.../adunit',
  sz:              'GAM: размер слота (640x360 и т.д.)',
  correlator:      'GAM/IMA: коррелятор сессии (случайное целое)',
  description_url: 'GAM: URL страницы с видео (часто обязателен)',
  cust_params:     'GAM: key=val&… пользовательский таргетинг (URL-encoded)',
  output:          'GAM: формат ответа (vast, xml_vast4, vmap, …)',
  env:             'GAM: среда (vp=in-stream video, instream)',
  gdfp_req:        'GAM: признак запроса к схеме Google (обычно 1)',
  gdpr:            'GDPR флаг (0/1)',
  gdpr_consent:    'TCF consent string',
  addtl_consent:   'Доп. согласие (Google Additional Consent)',
  us_privacy:      'CCPA US Privacy string',
  npa:             'Non-personalized ads (0/1)',
  ppid:            'Publisher Provided ID (хэш/ID от издателя)',
  plcmt:           'OpenRTB: тип инвентаря (1=in-stream, …)',
  vpa:             'GAM: разрешён VPAID (0/1)',
  vpmute:          'GAM: старт с mute (0/1)',
  wta:             'GAM: willingness to autoplay',
  ad_rule:         'GAM: правила подачи нескольких роликов (pod)',
  pod:             'GAM: номер pod / рекламного блока',
  ppos:            'GAM: позиция в pod (pre/mid/post)',
  ppt:             'GAM: тип подачи pod',
  hl:              'Язык интерфейса объявлений (ISO)',
  msid:            'GAM mobile: матчинг app к inventory',
  rdid:            'Resettable device ID (CTV/Android)',
  idtype:          'Тип ID (adid, idfa, …)',
  omid_p:          'OM Partner / OMID версия',
  sdk_apis:        'Битовая маска поддерживаемых API (MRAID, OMID, …)',
  url:             'Реферер или канонический URL (зависит от сети)',
  an:              'Имя приложения (закодированное)',
  vid:             'ID видео / контента',
  sid:             'Session / site id (сеть)',
  vad_type:        'Тип видеорекламы',
  vpi:             'Video protocol / индекс',
  vpos:            'Позиция относительно контента',
  ott_placement:   'CTV: тип размещения',
  paln:            'Programmatic guaranteed / deal hint',
  schain:          'Supply chain (OpenRTB sellers.json)',
  // —— OpenRTB / Prebid / programmatic ——
  auction_id:      'ID аукциона',
  auction_package: 'Пакет аукциона',
  seat:            'DSP seat',
  deal_id:         'Deal ID (PMP)',
  imp_id:          'Impression ID',
  site_id:         'ID сайта в SSP',
  publisher_id:    'ID паблишера',
  tag_id:          'ID тега / placement',
  request_id:      'ID запроса',
  transaction_id:  'ID транзакции',
  consent_string:  'Строка согласия (TCF)',
  usp_consent:     'US Privacy consent',
  ccpa:            'Флаг/строка CCPA',
  lat:             'Широта',
  lon:             'Долгота',
  zip:             'Почтовый индекс',
  city:            'Город',
  region:          'Регион / штат',
  country:         'Страна',
  yob:             'Год рождения',
  gender:          'Пол (M/F/O)',
  keywords:        'Ключевые слова',
  cat:             'Категория IAB контента',
  page:            'URL или путь страницы',
  ref:             'Referrer',
  dnt:             'Do Not Track',
  lmt:             'Limited ad tracking',
  // —— Яндекс / Adfox-стиль (распространённые имена) ——
  puid:            'Профильный/приложение ID (сети РФ)',
  erid:            'Токен учёта рекламы (РФ маркировка)',
  // —— SpotX / видео SSP (типичные имена в документации) ——
  channel_id:      'ID канала контента',
  app_name:        'Название приложения',
  device_make:     'Производитель устройства',
  device_model:    'Модель устройства',
  device_ifa:      'IFA устройства',
  content_language: 'Язык контента (ISO-639-1)',
  is_livestream:   'Признак live (0/1)',
};

// ─── Validation rules ─────────────────────────────────────────────────────────
const RULES = [
  {
    level: 'error',
    check: (base) => base.trim() !== '' && !/^https?:\/\//i.test(base),
    msg: 'Базовый URL должен начинаться с https:// или http://',
  },
  {
    level: 'error',
    check: (base) => base.trim() === '',
    msg: 'Базовый URL пустой',
  },
  {
    level: 'warn',
    checkP: (ps) => !ps.some(p => /^ip$/i.test(p.key) && p.enabled),
    msg: 'Отсутствует параметр ip — обязателен для большинства DSP',
  },
  {
    level: 'warn',
    checkP: (ps) => !ps.some(p => /^ua$/i.test(p.key) && p.enabled),
    msg: 'Отсутствует параметр ua (User-Agent) — обязателен для DSP',
  },
  {
    level: 'warn',
    checkP: (ps) => !ps.some(p => /^(ifa|gaid|idfa|google_aid|eid|eid2|eid3)$/i.test(p.key) && p.enabled),
    msg: 'Не найден рекламный ID (ifa/gaid/idfa)',
  },
  {
    level: 'warn',
    checkP: (ps) => !ps.some(p => /^(bundle|app_bundle|appid|puid60|p1)$/i.test(p.key) && p.enabled),
    msg: 'Не найден идентификатор приложения (bundle)',
  },
  {
    level: 'warn',
    checkP: (ps) => {
      const keys = ps.filter(p => p.enabled).map(p => p.key.toLowerCase().trim());
      return keys.length !== new Set(keys).size;
    },
    msg: 'Обнаружены дублирующиеся ключи параметров',
  },
  {
    level: 'error',
    checkP: (ps) => ps.some(p => p.enabled && p.key.trim() === ''),
    msg: 'Один или несколько включённых параметров не имеют имени',
  },
];

// ─── History ─────────────────────────────────────────────────────────────────
const HIST_KEY = 'zitek_hist_v1';
const HIST_MAX = 8;

function saveHistory(url) {
  let hist = loadHistory();
  hist = hist.filter(h => h.url !== url);
  hist.unshift({ url, ts: Date.now() });
  if (hist.length > HIST_MAX) hist = hist.slice(0, HIST_MAX);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch {}
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
}

function clearHistory() {
  try { localStorage.removeItem(HIST_KEY); } catch {}
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return 'только что';
  if (d < 3600000)  return `${Math.floor(d / 60000)} мин назад`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} ч назад`;
  return `${Math.floor(d / 86400000)} д назад`;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { const m = url.match(/^https?:\/\/([^/?#]+)/); return m ? m[1] : url.slice(0, 20); }
}

// ─── State ────────────────────────────────────────────────────────────────────
let params = [];
let sortAsc = false;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
/** @param {string} id @returns {HTMLElement} */
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`ZiTeg: элемент #${id} не найден`);
  return el;
};
const vastInput = /** @type {HTMLInputElement} */ ($('vast-input'));
const btnParse  = $('btn-parse');
const btnClear  = $('btn-clear');
const btnAdd    = $('btn-add-param');
const btnSort   = $('btn-sort');
const btnCopyUrl  = $('btn-copy-url');
const btnCopyEnc  = $('btn-copy-encoded');
const btnCopyBase = $('btn-copy-base');
const histList      = $('hist-list');
const histClearAll  = $('hist-clear-all');
const baseInput   = /** @type {HTMLInputElement} */ ($('base-url-input'));
const tbody       = $('params-tbody');
const resultSec   = $('result-section');
const valBanner   = $('val-bar');
const outputEl    = $('output-url');
const outBar      = $('out-bar');
const toast       = $('toast');

// ZiTeg stats bar
const zitegStats  = $('ziteg-stats');
const tsDisabled  = $('ts-disabled');
const tsParamsV   = $('ts-params-val');
const tsMacrosV   = $('ts-macros-val');
const tsDisabledV = $('ts-disabled-val');
const tsStatusV   = $('ts-status-val');

// ─── Parsing ──────────────────────────────────────────────────────────────────
function parseTag(raw) {
  raw = raw.trim();
  if (!raw) return null;
  const qi = raw.indexOf('?');
  const base  = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = qi >= 0 ? raw.slice(qi + 1) : '';
  const ps = [];
  if (query) {
    query.split('&').forEach((pair, i) => {
      if (!pair) return;
      const ei = pair.indexOf('=');
      const key = ei >= 0 ? pair.slice(0, ei) : pair;
      const val = ei >= 0 ? pair.slice(ei + 1) : '';
      ps.push({ id: Date.now() + i, key: safeDecodeURI(key), value: safeDecodeURI(val), enabled: true });
    });
  }
  return { base, params: ps };
}

function safeDecodeURI(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

/** Несколько уровней decodeURIComponent — для значений вроде %25request.puid9%25 → %request.puid9%. */
function decodeParamValueForHint(v) {
  let s = String(v);
  for (let i = 0; i < 6; i++) {
    try {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s;
}

/** Подсказка для макросов в обёртке %…% (Яндекс/Adfox и др.). */
function percentMacroHint(inner) {
  const low = inner.toLowerCase();
  if (low.startsWith('request.')) {
    const field = low.slice('request.'.length);
    const puid = /^puid\d+$/.test(field)
      ? `слот профиля приложения (${field})`
      : 'поле объекта request на стороне сервера';
    return `Макрос %…%: при запросе подставится ${inner} — ${puid}. В query часто экранируют как %25…%25.`;
  }
  if (/^puid\d+$/.test(low)) {
    return `Идентификатор приложения/профиля (puid). В строке запроса % часто кодируют как %25.`;
  }
  return `Макрос подстановки %…%: сервер заменит до выхода в сеть. Экранирование: %25 = символ %.`;
}

// ─── Value type ───────────────────────────────────────────────────────────────
function valType(v) {
  if (v === '' || v == null) return 'empty';
  const t = String(v).trim();
  if (/\{[^}]+\}/.test(t)) return 'macro';
  if (/^\[[^\]]+\]$/.test(t)) return 'macro';
  const decoded = decodeParamValueForHint(t);
  if (/^%[^%]+%$/.test(decoded.trim())) return 'macro';
  if (/^https?:\/\//i.test(t)) return 'url';
  return 'static';
}

function typeBadge(v) {
  const t = valType(v);
  const map = {
    macro:  ['tb-macro',  'Макрос'],
    static: ['tb-static', 'Статика'],
    empty:  ['tb-empty',  'Пусто'],
    url:    ['tb-url',    'URL'],
  };
  const [cls, lbl] = map[t];
  return `<span class="tbadge ${cls}">${lbl}</span>`;
}

// ─── Row note ─────────────────────────────────────────────────────────────────
function rowNote(key, val) {
  const kl = key.toLowerCase().trim();
  if (KEY_HINTS[kl]) return KEY_HINTS[kl];
  const tryNote = (s) => {
    const m = s.match(/^\{([^}]+)\}$/);
    if (m) {
      const inner = m[1].trim();
      return MACRO_NOTES[`{${inner}}`] || MACRO_NOTES[`{${inner.toLowerCase()}}`] || '';
    }
    const b = s.match(/^\[([^\]]+)\]$/);
    if (b) {
      const canon = b[1].trim().toUpperCase().replace(/\s+/g, '_');
      return BRACKET_MACRO_NOTES[`[${canon}]`] || '';
    }
    const pct = s.trim().match(/^%([^%]+)%$/);
    if (pct) return percentMacroHint(pct[1]);
    return '';
  };
  let note = tryNote(val);
  if (!note) note = tryNote(decodeParamValueForHint(val));
  return note;
}

// ─── Row class ────────────────────────────────────────────────────────────────
function rowCls(p) {
  if (!p.enabled) return 'row-off';
  if (p.key.trim() === '') return 'row-err';
  return '';
}

// ─── Render table ─────────────────────────────────────────────────────────────
function renderTable() {
  tbody.innerHTML = '';
  params.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.className = rowCls(p);
    tr.dataset.id = p.id;

    // Scan line with delay matching row animation
    setTimeout(() => addScanLine(tr), 80 + i * 30);

    const note = rowNote(p.key, p.value);
    tr.innerHTML = `
      <td>
        <label class="tog">
          <input type="checkbox" class="tog-cb" ${p.enabled ? 'checked' : ''} />
          <span class="tog-sl"></span>
        </label>
      </td>
      <td class="row-num">${i + 1}</td>
      <td><input class="ci key-i" value="${esc(p.key)}" data-f="key" spellcheck="false" /></td>
      <td><input class="ci val-i" value="${esc(p.value)}" data-f="value" spellcheck="false" /></td>
      <td>${typeBadge(p.value)}</td>
      <td class="row-note">${esc(note)}</td>
      <td><button class="del-btn" title="Remove">✕</button></td>
    `;

    tr.querySelector('.tog-cb').addEventListener('change', e => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      p.enabled = t.checked;
      tr.className = rowCls(p);
      refresh();
    });

    tr.querySelectorAll('.ci').forEach(inp => {
      if (!(inp instanceof HTMLInputElement)) return;
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        if (f !== 'key' && f !== 'value') return;
        p[f] = inp.value;
        if (f === 'value') {
          tr.children[4].innerHTML = typeBadge(inp.value);
          tr.querySelector('.row-note').textContent = rowNote(p.key, inp.value);
        }
        if (f === 'key') {
          tr.querySelector('.row-note').textContent = rowNote(inp.value, p.value);
        }
        tr.className = rowCls(p);
        refresh();
      });
    });

    tr.querySelector('.del-btn').addEventListener('click', () => {
      params = params.filter(x => x.id !== p.id);
      renderTable();
      refresh();
    });

    tbody.appendChild(tr);
  });
}

// ─── Validate ─────────────────────────────────────────────────────────────────
function validate(base, ps) {
  return RULES.filter(r => r.check ? r.check(base) : r.checkP(ps))
              .map(r => ({ level: r.level, msg: r.msg }));
}

function renderValidation(issues) {
  if (!issues.length) {
    valBanner.className = 'val-bar ok';
    valBanner.innerHTML = `<span class="vt">✓ Структура корректна</span>`;
    valBanner.classList.remove('hidden');
    return;
  }
  const errs  = issues.filter(i => i.level === 'error');
  const warns = issues.filter(i => i.level === 'warn');
  const cls   = errs.length ? 'error' : 'warn';
  const icon  = errs.length ? '✗' : '⚠';
  const title = errs.length
    ? `${errs.length} ${errs.length === 1 ? 'ошибка' : errs.length < 5 ? 'ошибки' : 'ошибок'}`
    : `${warns.length} ${warns.length === 1 ? 'предупреждение' : warns.length < 5 ? 'предупреждения' : 'предупреждений'}`;
  const items = issues.map(i => `<li>${i.msg}</li>`).join('');
  valBanner.className = `val-bar ${cls}`;
  valBanner.innerHTML = `<div class="vt">${icon} ${title}</div><ul>${items}</ul>`;
  valBanner.classList.remove('hidden');
}

// ─── Topbar stats ─────────────────────────────────────────────────────────────
function renderTopbar(issues) {
  const active   = params.filter(p => p.enabled).length;
  const disabled = params.filter(p => !p.enabled).length;
  const macros   = params.filter(p => p.enabled && valType(p.value) === 'macro').length;
  const errN     = issues.filter(i => i.level === 'error').length;
  const warnN    = issues.filter(i => i.level === 'warn').length;

  countUp(tsParamsV,   active);
  countUp(tsMacrosV,   macros);
  countUp(tsDisabledV, disabled);

  if (errN > 0) {
    tsStatusV.textContent = 'ОШИБКА';
    tsStatusV.className = 'ts-v red';
  } else if (warnN > 0) {
    tsStatusV.textContent = 'WARN';
    tsStatusV.className = 'ts-v yellow';
  } else {
    tsStatusV.textContent = 'ОК';
    tsStatusV.className = 'ts-v green';
  }

  zitegStats.classList.remove('hidden');
  tsDisabled.classList.toggle('hidden', disabled === 0);
}

// ─── Build URL ────────────────────────────────────────────────────────────────
function buildUrl(encode = false) {
  const base = baseInput.value.trim();
  const parts = params
    .filter(p => p.enabled)
    .map(p => {
      const k = encode ? encodeURIComponent(p.key) : p.key;
      const v = encode ? encodeURIComponent(p.value) : p.value;
      return `${k}=${v}`;
    });
  return parts.length ? `${base}?${parts.join('&')}` : base;
}

// ─── Render output ────────────────────────────────────────────────────────────
function renderOutput() {
  const base   = esc(baseInput.value.trim());
  const active = params.filter(p => p.enabled);
  if (!base && !active.length) { outputEl.innerHTML = ''; return; }

  let html = `<span class="o-base">${base}</span>`;
  active.forEach((p, i) => {
    const sep = i === 0
      ? `<span class="o-sep">?</span>`
      : `<span class="o-amp">&amp;</span>`;
    const key = `<span class="o-key">${esc(p.key)}</span>`;
    const eq  = `<span class="o-eq">=</span>`;
    const val = fmtVal(p.value);
    html += `${sep}${key}${eq}${val}`;
  });
  outputEl.innerHTML = html;
  revealTokens();
}

function fmtVal(v) {
  if (v === '' || v == null) return `<span class="o-empty">(пусто)</span>`;
  const raw = String(v);
  const tr = raw.trim();
  if (/^https?:\/\//i.test(tr)) return `<span class="o-url">${esc(raw)}</span>`;
  const decoded = decodeParamValueForHint(raw);
  const dTrim = decoded.trim();
  if (/^%[^%]+%$/.test(dTrim)) {
    if (tr !== dTrim) {
      return `<span class="o-static">${esc(raw)}</span><span class="o-eq"> → </span><span class="o-macro">${esc(decoded)}</span>`;
    }
    return `<span class="o-macro">${esc(decoded)}</span>`;
  }
  const t = valType(v);
  if (t === 'static') return `<span class="o-static">${esc(raw)}</span>`;
  let out = esc(raw);
  out = out.replace(/\{[^}]+\}/g, m => `<span class="o-macro">${m}</span>`);
  out = out.replace(/\[[^\]]+\]/g, m => `<span class="o-macro">${m}</span>`);
  return out;
}

// ─── Animation helpers ────────────────────────────────────────────────────────

// Count up / down to target value with easing
function countUp(el, target, duration = 450) {
  const start = parseInt(el.textContent) || 0;
  if (start === target) {
    el.classList.remove('flash');
    el.offsetWidth; // reflow
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 400);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min((now - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * ease);
    if (p < 1) requestAnimationFrame(tick);
    else { el.textContent = target; }
  };
  requestAnimationFrame(tick);
}

// Reveal output tokens one by one
function revealTokens() {
  const spans = outputEl.querySelectorAll('span');
  spans.forEach((s, i) => {
    s.classList.add('tok');
    s.style.animationDelay = `${i * 18}ms`;
  });
}

// Ripple on button click
function addRipple(btn, e) {
  const r = document.createElement('span');
  r.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  r.style.left = (e.clientX - rect.left) + 'px';
  r.style.top  = (e.clientY - rect.top)  + 'px';
  btn.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

// Add scan line to table row
function addScanLine(tr) {
  const scan = document.createElement('span');
  scan.className = 'row-scan';
  tr.appendChild(scan);
  setTimeout(() => scan.remove(), 700);
}

// ─── Инфраструктура (домены из BASE и https-параметров) ───────────────────────
function renderZitegInfra() {
  const wrap = document.getElementById('ziteg-infra-wrap');
  const body = document.getElementById('ziteg-infra-body');
  if (!wrap || !body) return;
  const fn = typeof window !== 'undefined' && window.analyzeAdInfrastructureFromVastTag;
  if (typeof fn !== 'function') {
    wrap.classList.add('hidden');
    return;
  }
  const base = baseInput.value.trim();
  const infra = fn(base, params);
  const show = (infra.items && infra.items.length > 0) || (infra.scannedUrls > 0);
  if (!show) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  let html = '';
  if (infra.items && infra.items.length) {
    html += '<div class="ad-infra-grid">';
    infra.items.forEach((it, i) => {
      const regCls = it.region === 'RU' ? 'ru' : 'int';
      const regLbl = it.region === 'RU' ? 'РФ / СНГ' : 'Международные';
      html += `<div class="ad-infra-card" style="animation-delay:${i * 40}ms">
        <div class="ad-infra-card-top">
          <span class="ad-infra-region ${regCls}">${regLbl}</span>
          <span class="ad-infra-name">${esc(it.name)}</span>
          <span class="ad-infra-role">${esc(it.role)}</span>
        </div>
        <p class="ad-infra-hint">${esc(it.hint)}</p>
        ${it.sampleHost ? `<div class="ad-infra-host" title="${esc(it.sampleHost)}">↳ ${esc(it.sampleHost)}</div>` : ''}
      </div>`;
    });
    html += '</div>';
  } else {
    const hostFn = typeof window !== 'undefined' && window.hostnameFromVastUrl;
    const baseHost = hostFn ? hostFn(base) : '';
    const hostEsc = baseHost ? esc(baseHost) : '—';
    const extraUrls = infra.scannedUrls > 1 ? infra.scannedUrls - 1 : 0;
    const extra = extraUrls > 0
      ? ` Дополнительно проверено ${extraUrls} URL из значений параметров — совпадений с каталогом нет.`
      : '';
    html += `<p class="ad-infra-empty">Хост <strong>${hostEsc}</strong> не найден в каталоге доменов SSP/DSP.${extra}</p>`;
  }
  body.innerHTML = html;
}

// ─── Main refresh cycle ───────────────────────────────────────────────────────
function refresh() {
  const issues = validate(baseInput.value, params);
  renderValidation(issues);
  renderTopbar(issues);
  renderOutput();
  if (!resultSec.classList.contains('hidden')) {
    renderZitegInfra();
  }
}

// ─── Parse action ─────────────────────────────────────────────────────────────
function doParse() {
  const raw = vastInput.value.trim();
  if (!raw) return;

  // Animate the button
  btnParse.classList.add('scanning');
  setTimeout(() => btnParse.classList.remove('scanning'), 700);

  const parsed = parseTag(raw);
  if (!parsed) return;
  saveHistory(raw);
  baseInput.value = parsed.base;
  params = parsed.params;
  renderTable();
  resultSec.classList.remove('hidden');
  outBar.classList.remove('hidden');
  renderHistPanel();
  refresh();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2000);
}

function copy(text, msg = 'Copied!') {
  navigator.clipboard.writeText(text)
    .then(() => showToast(msg))
    .catch(() => {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(msg);
    });
}

// ─── Event listeners ──────────────────────────────────────────────────────────
btnParse.addEventListener('click', e => { addRipple(btnParse, e); doParse(); });

btnClear.addEventListener('click', () => {
  vastInput.value = '';
  params = [];
  resultSec.classList.add('hidden');
  outBar.classList.add('hidden');
  valBanner.className = 'val-bar hidden';
  zitegStats.classList.add('hidden');
  const zi = document.getElementById('ziteg-infra-wrap');
  if (zi) zi.classList.add('hidden');
});

vastInput.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doParse();
});

// Auto-parse on paste
vastInput.addEventListener('paste', () => setTimeout(doParse, 60));

btnAdd.addEventListener('click', () => {
  params.push({ id: Date.now(), key: '', value: '', enabled: true });
  renderTable();
  refresh();
  const lastKey = tbody.querySelector('tr:last-child .key-i');
  if (lastKey instanceof HTMLInputElement) lastKey.focus();
});

btnSort.addEventListener('click', () => {
  sortAsc = !sortAsc;
  params.sort((a, b) => {
    const ak = a.key.toLowerCase(), bk = b.key.toLowerCase();
    return sortAsc ? ak.localeCompare(bk) : bk.localeCompare(ak);
  });
  btnSort.textContent = sortAsc ? 'Сортировка Я–А' : 'Сортировка А–Я';
  renderTable();
  refresh();
});

btnCopyUrl.addEventListener('click',  () => copy(buildUrl(false), 'URL скопирован!'));
btnCopyEnc.addEventListener('click',  () => copy(buildUrl(true),  'Encoded URL скопирован!'));
btnCopyBase.addEventListener('click', () => copy(baseInput.value, 'Скопировано!'));

// ─── История тегов (панель под полем ввода) ───────────────────────────────────
function renderHistPanel() {
  const hist = loadHistory();
  if (!hist.length) {
    histList.innerHTML = `<div class="hist-empty">Пока нет сохранённых тегов — после «Парсить» URL появятся здесь</div>`;
    return;
  }
  const items = hist.map(h => `
    <button type="button" class="hist-item" data-url="${esc(h.url)}">
      <span class="hist-domain">${esc(getDomain(h.url))}</span>
      <span class="hist-url">${esc(h.url)}</span>
      <span class="hist-ts">${timeAgo(h.ts)}</span>
    </button>
  `).join('');
  histList.innerHTML = items;
  histList.querySelectorAll('.hist-item').forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    el.addEventListener('click', () => {
      vastInput.value = el.dataset.url || '';
      vastInput.focus();
      doParse();
    });
  });
}

histClearAll.addEventListener('click', () => {
  clearHistory();
  renderHistPanel();
});

baseInput.addEventListener('input', refresh);

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const tabBtns      = document.querySelectorAll('.tab-btn');
const tabPanels    = document.querySelectorAll('.tab-panel');
const tabIndicator = $('tab-indicator');

function moveIndicator(btn) {
  tabIndicator.style.left  = btn.offsetLeft + 'px';
  tabIndicator.style.width = btn.offsetWidth + 'px';
}

function switchTab(targetId) {
  tabBtns.forEach(b => {
    if (!(b instanceof HTMLElement)) return;
    b.classList.toggle('active', b.dataset.tab === targetId);
  });
  tabPanels.forEach(p => {
    if (!(p instanceof HTMLElement)) return;
    p.classList.toggle('active', p.id === `panel-${targetId}`);
  });
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${targetId}"]`);
  if (activeBtn) moveIndicator(activeBtn);
  // Панель URL — только на вкладке ZiTeg
  if (targetId !== 'ziteg') outBar.classList.add('hidden');
  else if (params.length) outBar.classList.remove('hidden');
}

tabBtns.forEach(btn => {
  if (!(btn instanceof HTMLElement)) return;
  btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'ziteg'));
});

// Init indicator position on first load
requestAnimationFrame(() => {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) moveIndicator(activeBtn);
});

// ─── Темы оформления ─────────────────────────────────────────────────────────
const THEME_KEY = 'ziteg_theme_v1';
const THEME_PRESETS = ['ember', 'depth', 'obsidian', 'frost', 'silver'];

function applyTheme(preset) {
  const html = document.documentElement;
  const id = THEME_PRESETS.includes(preset) ? preset : 'depth';
  if (id === 'ember') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', id);
  try { localStorage.setItem(THEME_KEY, id); } catch {}
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    const on = btn instanceof HTMLElement && btn.dataset.themePreset === id;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

(function initTheme() {
  let saved = 'depth';
  try { saved = localStorage.getItem(THEME_KEY) || 'depth'; } catch {}
  applyTheme(THEME_PRESETS.includes(saved) ? saved : 'depth');

  const strip = document.getElementById('theme-strip');
  if (!strip) return;
  strip.addEventListener('click', e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest('.theme-swatch');
    if (!(btn instanceof HTMLElement) || !btn.dataset.themePreset) return;
    applyTheme(btn.dataset.themePreset);
  });
})();

// ─── Сворачиваемые блоки (localStorage) ───────────────────────────────────────
const COLLAPSE_PREFS_KEY = 'ziteg_collapse_v1';

function loadCollapsePrefs() {
  try {
    const raw = localStorage.getItem(COLLAPSE_PREFS_KEY);
    return raw ? /** @type {Record<string, boolean>} */ (JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveCollapsePrefs(/** @type {Record<string, boolean>} */ prefs) {
  try {
    localStorage.setItem(COLLAPSE_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function initCollapsiblePanels(/** @type {ParentNode} */ root) {
  root.querySelectorAll('[data-collapse-key]').forEach(panel => {
    if (!(panel instanceof HTMLElement)) return;
    if (panel.dataset.collapseBound === '1') return;
    const key = panel.dataset.collapseKey;
    const btn = panel.querySelector('.chk-collapse-btn');
    const body = panel.querySelector(':scope > .chk-card-body') || panel.querySelector(':scope > .collapsible-body');
    if (!key || !(btn instanceof HTMLButtonElement) || !body) return;
    panel.dataset.collapseBound = '1';

    const prefs = loadCollapsePrefs();
    if (prefs[key]) {
      panel.classList.add('is-collapsed');
      btn.setAttribute('aria-expanded', 'false');
    } else {
      btn.setAttribute('aria-expanded', 'true');
    }

    btn.addEventListener('click', () => {
      panel.classList.toggle('is-collapsed');
      const collapsed = panel.classList.contains('is-collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const next = loadCollapsePrefs();
      next[key] = collapsed;
      saveCollapsePrefs(next);
    });
  });
}

renderHistPanel();
initCollapsiblePanels(document.body);
