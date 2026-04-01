'use strict';

// ─── Macro catalogue ─────────────────────────────────────────────────────────
const MACRO_NOTES = {
  '{app}':         'Bundle ID приложения',
  '{gaid}':        'Google Advertising ID',
  '{idfa}':        'Apple IDFA',
  '{deviceid}':    'ID устройства',
  '{ip}':          'IP-адрес пользователя',
  '{ua}':          'User-Agent',
  '{tz}':          'Часовой пояс',
  '{rnd}':         'Кэш-бастер',
  '{cb}':          'Кэш-бастер',
  '{cachebuster}': 'Кэш-бастер',
  '{width}':       'Ширина плеера',
  '{height}':      'Высота плеера',
  '{lat}':         'Широта',
  '{lon}':         'Долгота',
  '{country}':     'Код страны',
  '{lang}':        'Язык',
  '{appname}':     'Название приложения',
  '{pageurl}':     'URL страницы',
  '{content_id}':  'ID контента',
  '{duration}':    'Длительность контента',
};

// ─── Per-key hints ────────────────────────────────────────────────────────────
const KEY_HINTS = {
  ip:            'IP пользователя',
  ua:            'User-Agent',
  bundle:        'Bundle приложения',
  app_bundle:    'Bundle приложения',
  appid:         'ID приложения',
  ifa:           'Рекл. ID (GAID/IDFA)',
  gaid:          'Google Ad ID',
  google_aid:    'Google Ad ID',
  idfa:          'Apple IDFA',
  w:             'Ширина (px)',
  h:             'Высота (px)',
  width:         'Ширина (px)',
  height:        'Высота (px)',
  cachebuster:   'Кэш-бастер',
  cb:            'Кэш-бастер',
  rnd:           'Кэш-бастер',
  maxd:          'Макс. длительность (с)',
  mind:          'Мин. длительность (с)',
  device_type:   'Тип устройства',
  device_os:     'ОС устройства',
  content_type:  'Тип контента',
  ad_place_type: 'Тип размещения',
  position:      'Позиция рекламы',
  is_child:      'COPPA флаг 0/1',
  time_shift:    'Часовой пояс',
  account_id:    'ID аккаунта/устройства',
  app_storeurl:  'Ссылка на магазин',
  puid60:        'Параметр приложения',
  puid31:        'Параметр приложения',
  puid20:        'Параметр приложения',
  p1:            'Параметр паблишера',
  p2:            'Параметр паблишера',
  eid2:          'ID пользователя',
  eid3:          'ID пользователя',
  eid4:          'ID пользователя',
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

// ─── Value type ───────────────────────────────────────────────────────────────
function valType(v) {
  if (v === '' || v == null) return 'empty';
  if (/\{[^}]+\}/.test(v)) return 'macro';
  if (/^https?:\/\//i.test(v)) return 'url';
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
  const m = val.match(/^\{([^}]+)\}$/);
  if (m) return MACRO_NOTES[`{${m[1]}}`] || '';
  return '';
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
  const t = valType(v);
  if (t === 'empty')  return `<span class="o-empty">(пусто)</span>`;
  if (t === 'static') return `<span class="o-static">${esc(v)}</span>`;
  if (t === 'url')    return `<span class="o-url">${esc(v)}</span>`;
  // macro — highlight each placeholder
  return esc(v).replace(/\{[^}]+\}/g, m => `<span class="o-macro">${m}</span>`);
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

// ─── Main refresh cycle ───────────────────────────────────────────────────────
function refresh() {
  const issues = validate(baseInput.value, params);
  renderValidation(issues);
  renderTopbar(issues);
  renderOutput();
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
  const id = THEME_PRESETS.includes(preset) ? preset : 'ember';
  if (id === 'ember') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', id);
  try { localStorage.setItem(THEME_KEY, id); } catch {}
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    const on = btn instanceof HTMLElement && btn.dataset.themePreset === id;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

(function initTheme() {
  let saved = 'ember';
  try { saved = localStorage.getItem(THEME_KEY) || 'ember'; } catch {}
  applyTheme(THEME_PRESETS.includes(saved) ? saved : 'ember');

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
