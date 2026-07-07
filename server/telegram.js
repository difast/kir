'use strict';

/**
 * Админ-команды в Telegram: смена цен и занятости через того же бота.
 * Приём — через webhook (см. маршрут в index.js). Доступ — только у ADMIN_IDS.
 *
 * Что умеет:
 *  • Цены: базовая (за сутки), спеццена на конкретные даты/диапазон, помесячно,
 *    сброс всех спеццен дома.
 *  • Занятость: занять/освободить даты (в форме брони занятые даты недоступны).
 *  • Даты вводятся в свободном формате «день месяц год» — с пробелами, точками,
 *    дефисами или без разделителей: 10.08.2026 / 10 08 2026 / 10082026, диапазон
 *    10.08.2026 - 20.08.2026, несколько через запятую/перенос строки.
 *  • Перед каждым шагом бот даёт короткую инструкцию.
 */
const { botToken } = require('./notify');
const store = require('./store');
const { HOUSES, getHouse } = require('./houses');

const ADMIN_IDS = (process.env.ADMIN_IDS || '7738750071,1203192763')
  .split(',').map((s) => s.trim()).filter(Boolean);

// краткое состояние диалога: chatId -> { action, mode, id, step, dates }
const pending = new Map();

const API = (method) => `https://api.telegram.org/bot${botToken()}/${method}`;

async function api(method, params) {
  try {
    const res = await fetch(API(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json().catch(() => ({}));
  } catch (e) {
    // сеть недоступна (напр. песочница) — не роняем обработку команды
    console.warn('[telegram] api', method, 'ошибка:', e.message);
    return { ok: false };
  }
}

const send = (chatId, text, extra = {}) =>
  api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const answer = (id, text) => api('answerCallbackQuery', { callback_query_id: id, text });
const fmt = (n) => Number(n).toLocaleString('ru-RU');
const isAdmin = (id) => ADMIN_IDS.includes(String(id));

// 'YYYY-MM-DD' -> 'DD.MM.YYYY'
const ruDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const nextIso = (iso) => new Date(Date.parse(iso + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
/** Сжать список дат в диапазоны: ['01','02','03','10'] -> '01.–03., 10.' */
function compactRanges(dates) {
  const s = [...dates].sort();
  if (!s.length) return '';
  const out = []; let start = s[0], prev = s[0];
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === nextIso(prev)) { prev = s[i]; continue; }
    out.push(start === prev ? ruDate(start) : `${ruDate(start)} – ${ruDate(prev)}`);
    if (i < s.length) { start = s[i]; prev = s[i]; }
  }
  return out.join(', ');
}

/** Регистрация webhook (вызывается при старте на боевом сервере) */
async function setWebhook(url, secret) {
  const data = await api('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });
  if (data.ok) console.log('[telegram] webhook установлен:', url);
  else console.warn('[telegram] webhook не установлен:', data.description || data);
  return data;
}

// ---------- тексты-подсказки ----------
const DATE_HELP =
  'Формат даты — свободный, главное <b>день, месяц, год</b>. Разделители любые ' +
  '(точка, пробел, дефис) или без них:\n' +
  '• одна дата: <code>10.08.2026</code>, <code>10 08 2026</code>, <code>10082026</code>\n' +
  '• диапазон: <code>10.08.2026 - 20.08.2026</code> или <code>10.08.2026 по 20.08.2026</code>\n' +
  '• несколько сразу — через запятую или с новой строки.';
const MONTH_HELP =
  'Пришлите <b>месяц и год</b>: <code>08 2026</code>, <code>08.2026</code> или <code>2026-08</code>.';

// ---------- клавиатуры ----------
function menuKb() {
  return { inline_keyboard: [
    [{ text: '💰 Цены', callback_data: 'menu:price' },
     { text: '📅 Занятость', callback_data: 'menu:busy' }],
    [{ text: '👁 Обзор занятости', callback_data: 'menu:overview' }],
  ] };
}
function housesKb(prefix) {
  return { inline_keyboard: HOUSES.map((h) => [{
    text: (h.status === 'renovation' ? '🛠 ' : '') + h.name + ' — ' + fmt(store.getPrice(h.id)) + ' ₽',
    callback_data: prefix + ':' + h.id,
  }]).concat([[{ text: '← Меню', callback_data: 'menu:main' }]]) };
}
function priceModeKb(id) {
  return { inline_keyboard: [
    [{ text: '🏷 Базовая цена', callback_data: 'pm:base:' + id }],
    [{ text: '📆 Цена на даты', callback_data: 'pm:dates:' + id }],
    [{ text: '🗓 Цена на месяц', callback_data: 'pm:month:' + id }],
    [{ text: '♻️ Сбросить спеццены', callback_data: 'pm:clear:' + id }],
    [{ text: '← Дома', callback_data: 'menu:price' }],
  ] };
}
function busyModeKb(id) {
  return { inline_keyboard: [
    [{ text: '🔴 Занять даты', callback_data: 'bm:occupy:' + id }],
    [{ text: '🟢 Освободить даты', callback_data: 'bm:free:' + id }],
    [{ text: '🧹 Сбросить всю занятость', callback_data: 'bm:clear:' + id }],
    [{ text: '👁 Обзор занятости', callback_data: 'menu:overview' },
     { text: '← Дома', callback_data: 'menu:busy' }],
  ] };
}

const menuText = 'Панель GreenPark. Что меняем?';

function busyInfo(id) {
  const b = store.getBusy(id);
  return b.length ? compactRanges(b) : 'нет занятых дат';
}
function overviewKb() {
  return { inline_keyboard: [
    [{ text: '🧹 Сбросить занятость по ВСЕМ домам', callback_data: 'busyall:ask' }],
    [{ text: '← Меню', callback_data: 'menu:main' }],
  ] };
}
function confirmResetAllKb() {
  return { inline_keyboard: [
    [{ text: '✅ Да, снять ВСЮ занятость', callback_data: 'busyall:yes' }],
    [{ text: '✖️ Отмена', callback_data: 'menu:overview' }],
  ] };
}
/** Обзор занятости по всем домам */
function overviewText() {
  let out = '📅 <b>Занятость по домам</b>\n';
  HOUSES.filter((h) => h.status !== 'renovation').forEach((h) => {
    const b = store.getBusy(h.id);
    out += `\n<b>${h.name}</b>\n` + (b.length ? `${compactRanges(b)} — занято дней: ${b.length}` : '✅ свободно') + '\n';
  });
  out += '\nЧтобы изменить — «📅 Занятость» → выберите дом.';
  return out;
}
function priceDatesInfo(id) {
  const pd = store.getPriceDates(id);
  const keys = Object.keys(pd).sort();
  if (!keys.length) return 'спеццен нет (везде базовая)';
  const n = keys.length;
  const preview = keys.slice(0, 6).map((d) => `${d}: ${fmt(pd[d])} ₽`).join(', ');
  return preview + (n > 6 ? ` … и ещё ${n - 6}` : '');
}

// ---------- обработка апдейтов ----------
async function processUpdate(update) {
  try {
    if (update.callback_query) return onCallback(update.callback_query);
    if (update.message && update.message.text) return onMessage(update.message);
  } catch (e) {
    console.error('[telegram] ошибка обработки:', e.message);
  }
}

async function onMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (!isAdmin(chatId)) {
    if (/^\/(start|help|menu)/.test(text)) await send(chatId, 'Этот бот принимает команды только от администраторов.');
    return;
  }

  if (/^\/(start|help|menu)/.test(text)) { pending.delete(chatId); return send(chatId, menuText, { reply_markup: menuKb() }); }
  if (/^\/price/.test(text)) { pending.delete(chatId); return send(chatId, 'Шаг 1. Выберите дом, цену которого меняем:', { reply_markup: housesKb('price') }); }
  if (/^\/busy|^\/calendar/.test(text)) { pending.delete(chatId); return send(chatId, 'Шаг 1. Выберите дом для управления занятостью:', { reply_markup: housesKb('busy') }); }
  if (/^\/(overview|occupancy|zanyatost)/.test(text)) { pending.delete(chatId); return send(chatId, overviewText(), { reply_markup: overviewKb() }); }

  const p = pending.get(chatId);
  if (!p) return send(chatId, menuText, { reply_markup: menuKb() });

  const house = getHouse(p.id);
  if (!house) { pending.delete(chatId); return send(chatId, 'Дом не найден.', { reply_markup: menuKb() }); }

  if (p.action === 'price') return onPriceInput(chatId, house, p, text);
  if (p.action === 'busy') return onBusyInput(chatId, house, p, text);
}

// ---------- ввод для цен ----------
async function onPriceInput(chatId, house, p, text) {
  // Режим «базовая» — сразу число.
  if (p.mode === 'base') {
    const n = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) return send(chatId, 'Нужно число — рублей за сутки. Попробуйте ещё раз:');
    store.setPrice(p.id, n);
    pending.delete(chatId);
    return send(chatId, `✅ Базовая цена «${house.name}» — <b>${fmt(n)} ₽/сутки</b>.`, { reply_markup: menuKb() });
  }

  // Режимы «на даты» / «на месяц» — сначала даты, потом цена.
  if (p.step === 'dates') {
    const { dates, bad } = store.parseDateEntries(text);
    if (!dates.length) return send(chatId, `Не удалось распознать даты${bad.length ? ` (${bad.join(', ')})` : ''}.\n\n${DATE_HELP}`);
    p.dates = dates; p.step = 'price'; pending.set(chatId, p);
    let out = `Шаг 3. Выбрано дат: <b>${dates.length}</b> (${dates.slice(0, 6).join(', ')}${dates.length > 6 ? ' …' : ''}).\n`;
    if (bad.length) out += `Не распознано и пропущено: ${bad.join(', ')}\n`;
    out += `\nТеперь пришлите <b>цену за сутки</b> для этих дат (число в рублях). Чтобы вернуть базовую цену на эти даты — пришлите <code>0</code>.`;
    return send(chatId, out);
  }

  if (p.step === 'month') {
    const dates = store.monthDates(text);
    if (!dates) return send(chatId, `Не удалось распознать месяц.\n\n${MONTH_HELP}`);
    p.dates = dates; p.step = 'price'; p.monthLabel = text.trim(); pending.set(chatId, p);
    return send(chatId,
      `Шаг 3. Месяц распознан: <b>${dates.length}</b> дней (${dates[0]} … ${dates[dates.length - 1]}).\n\n` +
      `Теперь пришлите <b>цену за сутки</b> на весь этот месяц (число в рублях). Чтобы вернуть базовую цену — пришлите <code>0</code>.`);
  }

  if (p.step === 'price') {
    const raw = text.replace(/[^\d]/g, '');
    if (raw === '' && !/^0/.test(text.trim())) return send(chatId, 'Нужно число — рублей за сутки (или 0, чтобы вернуть базовую цену):');
    const n = parseInt(raw || '0', 10);
    store.setPriceDates(p.id, p.dates, n);
    const cnt = p.dates.length;
    pending.delete(chatId);
    if (n === 0) return send(chatId, `♻️ На ${cnt} дат(ы) «${house.name}» вернулась базовая цена <b>${fmt(store.getPrice(p.id))} ₽/сутки</b>.`, { reply_markup: menuKb() });
    return send(chatId, `✅ На ${cnt} дат(ы) «${house.name}» установлена цена <b>${fmt(n)} ₽/сутки</b>.`, { reply_markup: menuKb() });
  }
}

// ---------- ввод для занятости ----------
async function onBusyInput(chatId, house, p, text) {
  const { dates, bad } = store.parseDateEntries(text);
  if (!dates.length) return send(chatId, `Не удалось распознать даты${bad.length ? ` (${bad.join(', ')})` : ''}.\n\n${DATE_HELP}`);
  const occupy = p.mode === 'occupy';
  store.setBusyDates(p.id, dates, occupy);
  pending.delete(chatId);
  let out = `Дом «${house.name}».\n`;
  out += occupy ? `🔴 Занято дат: +${dates.length}\n` : `🟢 Освобождено дат: ${dates.length}\n`;
  if (bad.length) out += `Не распознано: ${bad.join(', ')}\n`;
  out += `\nТекущая занятость: <b>${busyInfo(p.id)}</b>`;
  return send(chatId, out, { reply_markup: menuKb() });
}

// ---------- callback-кнопки ----------
async function onCallback(cq) {
  const chatId = cq.message.chat.id;
  const data = cq.data || '';
  answer(cq.id); // убрать «часики» на кнопке (не блокируем логику)
  if (!isAdmin(chatId)) return;

  if (data === 'menu:main') { pending.delete(chatId); return send(chatId, menuText, { reply_markup: menuKb() }); }
  if (data === 'menu:price') { pending.delete(chatId); return send(chatId, 'Шаг 1. Выберите дом, цену которого меняем:', { reply_markup: housesKb('price') }); }
  if (data === 'menu:busy') { pending.delete(chatId); return send(chatId, 'Шаг 1. Выберите дом для управления занятостью:', { reply_markup: housesKb('busy') }); }
  if (data === 'menu:overview') { pending.delete(chatId); return send(chatId, overviewText(), { reply_markup: overviewKb() }); }

  if (data === 'busyall:ask') {
    pending.delete(chatId);
    const total = HOUSES.reduce((s, h) => s + store.getBusy(h.id).length, 0);
    return send(chatId,
      `⚠️ <b>Внимание!</b>\n\n` +
      `Сейчас будет снята <b>вся занятость по всем домам</b> — сразу освободятся все занятые даты ` +
      `(сейчас занято дней всего: <b>${total}</b>). Это действие <b>нельзя отменить</b>.\n\n` +
      `Точно продолжить?`,
      { reply_markup: confirmResetAllKb() });
  }
  if (data === 'busyall:yes') {
    pending.delete(chatId);
    let cleared = 0;
    HOUSES.forEach((h) => { const b = store.getBusy(h.id); if (b.length) { store.setBusyDates(h.id, b, false); cleared += b.length; } });
    return send(chatId, `🧹 Готово. Снята вся занятость по всем домам (освобождено дней: <b>${cleared}</b>). Все даты свободны.`, { reply_markup: menuKb() });
  }

  const parts = data.split(':');
  const kind = parts[0];

  // Выбор дома в разделе «Цены»
  if (kind === 'price') {
    const house = getHouse(parts[1]);
    if (!house) return;
    pending.delete(chatId);
    return send(chatId,
      `Дом «${house.name}».\n` +
      `Базовая цена: <b>${fmt(store.getPrice(house.id))} ₽/сутки</b>.\n` +
      `Спеццены: ${priceDatesInfo(house.id)}\n\n` +
      `Шаг 2. Что настраиваем?`,
      { reply_markup: priceModeKb(house.id) });
  }

  // Выбор дома в разделе «Занятость»
  if (kind === 'busy') {
    const house = getHouse(parts[1]);
    if (!house) return;
    pending.delete(chatId);
    return send(chatId,
      `Дом «${house.name}».\nЗанятость сейчас: <b>${busyInfo(house.id)}</b>.\n\n` +
      `Шаг 2. Занять или освободить даты?`,
      { reply_markup: busyModeKb(house.id) });
  }

  // Режим цены
  if (kind === 'pm') {
    const mode = parts[1], id = parts[2];
    const house = getHouse(id);
    if (!house) return;

    if (mode === 'base') {
      pending.set(chatId, { action: 'price', mode: 'base', id });
      return send(chatId, `Шаг 3. «${house.name}» — базовая цена сейчас <b>${fmt(store.getPrice(id))} ₽</b>.\nПришлите новую цену за сутки (число в рублях):`);
    }
    if (mode === 'dates') {
      pending.set(chatId, { action: 'price', mode: 'dates', id, step: 'dates' });
      return send(chatId, `Шаг 2 из 3. «${house.name}» — на какие даты меняем цену?\n\n${DATE_HELP}`);
    }
    if (mode === 'month') {
      pending.set(chatId, { action: 'price', mode: 'month', id, step: 'month' });
      return send(chatId, `Шаг 2 из 3. «${house.name}» — цена на какой месяц?\n\n${MONTH_HELP}`);
    }
    if (mode === 'clear') {
      store.clearPriceDates(id);
      pending.delete(chatId);
      return send(chatId, `♻️ Все спеццены «${house.name}» сброшены — везде базовая цена <b>${fmt(store.getPrice(id))} ₽/сутки</b>.`, { reply_markup: menuKb() });
    }
  }

  // Режим занятости
  if (kind === 'bm') {
    const mode = parts[1], id = parts[2];
    const house = getHouse(id);
    if (!house) return;
    if (mode === 'clear') {
      const all = store.getBusy(id);
      if (all.length) store.setBusyDates(id, all, false);
      pending.delete(chatId);
      return send(chatId, `🧹 Вся занятость «${house.name}» снята — все даты свободны.`, { reply_markup: busyModeKb(id) });
    }
    pending.set(chatId, { action: 'busy', mode, id });
    const verb = mode === 'occupy' ? 'занять' : 'освободить';
    return send(chatId, `Шаг 3. «${house.name}» — какие даты ${verb}?\n\n${DATE_HELP}`);
  }
}

module.exports = { processUpdate, setWebhook, isAdmin, ADMIN_IDS };
