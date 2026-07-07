'use strict';

/**
 * Постоянное хранилище — один JSON-файл (DATA_DIR, на Railway Volume /data).
 * Хранит: базовые цены, цены по конкретным датам (спеццены/сезон/месяц) и занятость.
 * Легко переносится на любой хостинг (это просто data.json).
 */
const fs = require('fs');
const path = require('path');
const { HOUSES } = require('./houses');

function pickDir() {
  const preferred = process.env.DATA_DIR || '/data';
  for (const dir of [preferred, path.join(__dirname, '..', 'data')]) {
    try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return dir; }
    catch (e) { /* следующий */ }
  }
  return path.join(__dirname, '..', 'data');
}

const DIR = pickDir();
const FILE = path.join(DIR, 'data.json');
const MS_DAY = 86400000;

function defaults() {
  const prices = {};
  HOUSES.forEach((h) => { prices[h.id] = h.price; });
  return { prices, priceDates: {}, busy: {} };
}

let state = defaults();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state = {
      prices: { ...defaults().prices, ...(raw.prices || {}) },
      priceDates: raw.priceDates || {},
      busy: raw.busy || {},
    };
  } catch (e) { state = defaults(); save(); }
}

function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('[store] не удалось сохранить:', e.message); }
}

load();
console.log('[store] файл данных:', FILE);

// ---------- разбор дат (свободный формат: день-месяц-год) ----------
const pad = (n) => String(n).padStart(2, '0');

/** Любой формат даты -> 'YYYY-MM-DD' или null. Порядок ввода: день месяц год. */
function normalizeDate(input) {
  if (!input) return null;
  let parts = String(input).trim().split(/[^\d]+/).filter(Boolean);
  if (parts.length === 1 && /^\d{6,8}$/.test(parts[0])) {
    const d = parts[0];
    parts = d.length === 8 ? [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)]
                           : [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)];
  }
  if (parts.length !== 3) return null;
  let D, M, Y;
  if (parts[0].length === 4) { Y = +parts[0]; M = +parts[1]; D = +parts[2]; }       // YYYY M D
  else { D = +parts[0]; M = +parts[1]; Y = +parts[2]; if (Y < 100) Y += 2000; }     // D M (YY)YY
  if (M > 12 && D <= 12) { const t = D; D = M; M = t; }                             // подстраховка
  if (!(Y >= 2020 && Y <= 2100 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D));
  if (dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  return `${Y}-${pad(M)}-${pad(D)}`;
}

/** Диапазон 'YYYY-MM-DD'..'YYYY-MM-DD' (включительно) в список дат */
function rangeDates(a, b) {
  let s = Date.parse(a + 'T00:00:00Z'), e = Date.parse(b + 'T00:00:00Z');
  if (e < s) [s, e] = [e, s];
  const out = [];
  for (let t = s; t <= e; t += MS_DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Разбор сообщения с датами. Поддерживает:
 *  - несколько дат через запятую/точку с запятой/перенос строки
 *  - одну дату в любом формате: 10.08.2026 / 10 08 2026 / 10-08-2026 / 10082026
 *  - диапазон: 10.08.2026..20.08.2026 / «10.08.2026 по 20.08.2026» / «10.08.2026 - 20.08.2026»
 * @returns {{dates:string[], bad:string[]}}
 */
function parseDateEntries(text) {
  const dates = [], bad = [];
  const entries = String(text).split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const rangeSep = /\s*\.\.\s*|\s*—\s*|\s*–\s*|\s+по\s+|\s+до\s+|\s+-\s+/i;
  for (const e of entries) {
    const m = e.split(rangeSep).map((s) => s.trim()).filter(Boolean);
    if (m.length === 2) {
      const a = normalizeDate(m[0]), b = normalizeDate(m[1]);
      if (a && b) { rangeDates(a, b).forEach((d) => dates.push(d)); continue; }
    }
    const d = normalizeDate(e);
    if (d) dates.push(d); else bad.push(e);
  }
  return { dates: [...new Set(dates)], bad };
}

/** Все даты месяца: вход '08 2026' / '08.2026' / '2026-08' -> список дат */
function monthDates(text) {
  const parts = String(text).trim().split(/[^\d]+/).filter(Boolean);
  if (parts.length < 2) return null;
  let M, Y;
  if (parts[0].length === 4) { Y = +parts[0]; M = +parts[1]; } else { M = +parts[0]; Y = +parts[1]; }
  if (Y < 100) Y += 2000;
  if (!(M >= 1 && M <= 12 && Y >= 2020 && Y <= 2100)) return null;
  const out = [];
  const days = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) out.push(`${Y}-${pad(M)}-${pad(d)}`);
  return out;
}

// ---------- цены ----------
function basePrice(id) {
  const p = state.prices[id];
  if (p != null) return p;
  const h = HOUSES.find((x) => x.id === id);
  return h ? h.price : 0;
}
function getPrice(id) { return basePrice(id); }

function setPrice(id, price) {
  const n = Math.max(0, Math.round(Number(price)));
  if (!Number.isFinite(n)) return false;
  state.prices[id] = n; save(); return true;
}

/** Цена конкретной ночи: спеццена даты или базовая */
function getPriceForDate(id, date) {
  const pd = state.priceDates[id];
  if (pd && pd[date] != null) return pd[date];
  return basePrice(id);
}

/** Установить/снять спеццену на набор дат. price==null|0 -> вернуть к базовой */
function setPriceDates(id, dates, price) {
  if (!state.priceDates[id]) state.priceDates[id] = {};
  const pd = state.priceDates[id];
  const n = price == null ? null : Math.max(0, Math.round(Number(price)));
  dates.forEach((d) => { if (n == null || n === 0) delete pd[d]; else pd[d] = n; });
  if (!Object.keys(pd).length) delete state.priceDates[id];
  save();
  return true;
}
function clearPriceDates(id) { delete state.priceDates[id]; save(); }
function getPriceDates(id) { return state.priceDates[id] || {}; }

/** Сумма за ночи [checkIn, checkOut) с учётом спеццен */
function nightsTotal(id, checkIn, checkOut) {
  let total = 0;
  const end = Date.parse(checkOut + 'T00:00:00Z');
  for (let t = Date.parse(checkIn + 'T00:00:00Z'); t < end; t += MS_DAY) {
    total += getPriceForDate(id, new Date(t).toISOString().slice(0, 10));
  }
  return total;
}

// ---------- занятость ----------
function getBusy(id) { return (state.busy[id] || []).slice().sort(); }
function setBusyDates(id, dates, makeBusy) {
  const set = new Set(state.busy[id] || []);
  dates.forEach((d) => (makeBusy ? set.add(d) : set.delete(d)));
  state.busy[id] = [...set].sort();
  if (!state.busy[id].length) delete state.busy[id];
  save();
  return getBusy(id);
}
function isRangeFree(id, checkIn, checkOut) {
  const busy = new Set(state.busy[id] || []);
  const end = Date.parse(checkOut + 'T00:00:00Z');
  for (let t = Date.parse(checkIn + 'T00:00:00Z'); t < end; t += MS_DAY) {
    if (busy.has(new Date(t).toISOString().slice(0, 10))) return false;
  }
  return true;
}

/** Состояние для фронта */
function publicState() {
  const prices = {}, priceDates = {}, busy = {};
  HOUSES.forEach((h) => {
    prices[h.id] = basePrice(h.id);
    priceDates[h.id] = getPriceDates(h.id);
    busy[h.id] = getBusy(h.id);
  });
  return { prices, priceDates, busy };
}

module.exports = {
  getPrice, setPrice, getPriceForDate, setPriceDates, clearPriceDates, getPriceDates,
  nightsTotal, getBusy, setBusyDates, isRangeFree,
  normalizeDate, parseDateEntries, monthDates, rangeDates,
  publicState, FILE,
};
