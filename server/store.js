'use strict';

/**
 * Постоянное хранилище цен и занятости — один JSON-файл.
 * Путь берётся из DATA_DIR (на Railway смонтируй Volume в /data).
 * Файл легко переносится на любой хостинг (напр. рег.ру VPS) — это просто data.json.
 */
const fs = require('fs');
const path = require('path');
const { HOUSES } = require('./houses');

function pickDir() {
  const preferred = process.env.DATA_DIR || '/data';
  for (const dir of [preferred, path.join(__dirname, '..', 'data')]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (e) { /* пробуем следующий */ }
  }
  return path.join(__dirname, '..', 'data');
}

const DIR = pickDir();
const FILE = path.join(DIR, 'data.json');

function defaults() {
  const prices = {};
  HOUSES.forEach((h) => { prices[h.id] = h.price; });
  return { prices, busy: {} };
}

let state = defaults();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state = {
      prices: { ...defaults().prices, ...(raw.prices || {}) },
      busy: raw.busy || {},
    };
  } catch (e) {
    state = defaults();
    save();
  }
}

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[store] не удалось сохранить:', e.message);
  }
}

load();
console.log('[store] файл данных:', FILE);

const MS_DAY = 86400000;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

function getPrice(id) {
  const p = state.prices[id];
  if (p != null) return p;
  const h = HOUSES.find((x) => x.id === id);
  return h ? h.price : 0;
}

function setPrice(id, price) {
  const n = Math.max(0, Math.round(Number(price)));
  if (!Number.isFinite(n)) return false;
  state.prices[id] = n;
  save();
  return true;
}

function getBusy(id) {
  return (state.busy[id] || []).slice().sort();
}

/** Пометить/снять занятость для набора дат */
function setBusyDates(id, dates, makeBusy) {
  const set = new Set(state.busy[id] || []);
  dates.forEach((d) => (makeBusy ? set.add(d) : set.delete(d)));
  state.busy[id] = [...set].sort();
  save();
  return state.busy[id];
}

/** Свободен ли диапазон ночей [checkIn, checkOut) */
function isRangeFree(id, checkIn, checkOut) {
  const busy = new Set(state.busy[id] || []);
  const end = Date.parse(checkOut + 'T00:00:00Z');
  for (let t = Date.parse(checkIn + 'T00:00:00Z'); t < end; t += MS_DAY) {
    if (busy.has(new Date(t).toISOString().slice(0, 10))) return false;
  }
  return true;
}

/** Развернуть 'YYYY-MM-DD' или 'YYYY-MM-DD..YYYY-MM-DD' в список дат (включительно) */
function expandRange(token) {
  const m = token.split('..');
  if (m.length === 1) return isDate(m[0]) ? [m[0]] : null;
  const [a, b] = m;
  if (!isDate(a) || !isDate(b)) return null;
  let start = Date.parse(a + 'T00:00:00Z'), end = Date.parse(b + 'T00:00:00Z');
  if (end < start) [start, end] = [end, start];
  const out = [];
  for (let t = start; t <= end; t += MS_DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Состояние для фронта: цены и занятые даты по всем домам */
function publicState() {
  const prices = {}, busy = {};
  HOUSES.forEach((h) => { prices[h.id] = getPrice(h.id); busy[h.id] = getBusy(h.id); });
  return { prices, busy };
}

module.exports = { getPrice, setPrice, getBusy, setBusyDates, isRangeFree, expandRange, publicState, isDate, FILE };
