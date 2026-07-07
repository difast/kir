'use strict';

/**
 * Админ-команды в Telegram: смена цен и занятости через того же бота.
 * Приём — через webhook (см. маршрут в index.js). Доступ — только у ADMIN_IDS.
 */
const { botToken } = require('./notify');
const store = require('./store');
const { HOUSES, getHouse } = require('./houses');

const ADMIN_IDS = (process.env.ADMIN_IDS || '7738750071,1203192763')
  .split(',').map((s) => s.trim()).filter(Boolean);

// краткое состояние диалога: chatId -> { action:'price'|'busy', id }
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

// ---------- клавиатуры ----------
function menuKb() {
  return { inline_keyboard: [[
    { text: '💰 Цены', callback_data: 'menu:price' },
    { text: '📅 Занятость', callback_data: 'menu:busy' },
  ]] };
}
function housesKb(prefix) {
  return { inline_keyboard: HOUSES.map((h) => [{
    text: (h.status === 'renovation' ? '🛠 ' : '') + h.name + ' — ' + fmt(store.getPrice(h.id)) + ' ₽',
    callback_data: prefix + ':' + h.id,
  }]).concat([[{ text: '← Меню', callback_data: 'menu:main' }]]) };
}

const menuText = 'Панель GreenPark. Что меняем?';

function busyInfo(id) {
  const b = store.getBusy(id);
  return b.length ? b.join(', ') : 'нет занятых дат';
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
  if (/^\/price/.test(text)) return send(chatId, 'Выберите дом, чтобы изменить цену:', { reply_markup: housesKb('price') });
  if (/^\/busy|^\/calendar/.test(text)) return send(chatId, 'Выберите дом для управления занятостью:', { reply_markup: housesKb('busy') });

  const p = pending.get(chatId);
  if (!p) return send(chatId, menuText, { reply_markup: menuKb() });

  const house = getHouse(p.id);
  if (!house) { pending.delete(chatId); return send(chatId, 'Дом не найден.', { reply_markup: menuKb() }); }

  if (p.action === 'price') {
    const n = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) return send(chatId, 'Нужно число (рублей за сутки). Попробуйте ещё раз:');
    store.setPrice(p.id, n);
    pending.delete(chatId);
    return send(chatId, `✅ Цена «${house.name}» — <b>${fmt(n)} ₽/сутки</b>.`, { reply_markup: menuKb() });
  }

  if (p.action === 'busy') {
    const tokens = text.split(/\s+/).filter(Boolean);
    let added = 0, removed = 0;
    const bad = [];
    for (const tk of tokens) {
      const free = tk.startsWith('-');
      const range = store.expandRange(free ? tk.slice(1) : tk);
      if (!range) { bad.push(tk); continue; }
      store.setBusyDates(p.id, range, !free);
      if (free) removed += range.length; else added += range.length;
    }
    pending.delete(chatId);
    let out = `Дом «${house.name}».\n`;
    if (added) out += `Занято дат: +${added}\n`;
    if (removed) out += `Освобождено дат: ${removed}\n`;
    if (bad.length) out += `Не распознано: ${bad.join(', ')}\n`;
    out += `\nТекущая занятость: <b>${busyInfo(p.id)}</b>`;
    return send(chatId, out, { reply_markup: menuKb() });
  }
}

async function onCallback(cq) {
  const chatId = cq.message.chat.id;
  const data = cq.data || '';
  answer(cq.id); // убрать «часики» на кнопке (не блокируем логику)
  if (!isAdmin(chatId)) return;

  if (data === 'menu:main') { pending.delete(chatId); return send(chatId, menuText, { reply_markup: menuKb() }); }
  if (data === 'menu:price') return send(chatId, 'Выберите дом, чтобы изменить цену:', { reply_markup: housesKb('price') });
  if (data === 'menu:busy') return send(chatId, 'Выберите дом для управления занятостью:', { reply_markup: housesKb('busy') });

  const [action, id] = data.split(':');
  const house = getHouse(id);
  if (!house) return;

  if (action === 'price') {
    pending.set(chatId, { action: 'price', id });
    return send(chatId, `Дом «${house.name}». Текущая цена: <b>${fmt(store.getPrice(id))} ₽</b>.\nВведите новую цену (число в рублях за сутки):`);
  }
  if (action === 'busy') {
    pending.set(chatId, { action: 'busy', id });
    return send(chatId,
      `Дом «${house.name}». Занятость сейчас: <b>${busyInfo(id)}</b>.\n\n` +
      `Пришлите даты:\n` +
      `• занять: <code>2026-08-10</code> или диапазон <code>2026-08-10..2026-08-15</code>\n` +
      `• освободить: со знаком «−», напр. <code>-2026-08-10</code> или <code>-2026-08-10..2026-08-15</code>\n` +
      `Можно несколько через пробел.`);
  }
}

module.exports = { processUpdate, setWebhook, isAdmin, ADMIN_IDS };
