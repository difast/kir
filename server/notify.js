'use strict';

const nodemailer = require('nodemailer');

/** Экранирование для Telegram parse_mode=HTML */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const fmtMoney = (n) => Number(n).toLocaleString('ru-RU');

/** Локальное (московское) время заявки в человекочитаемом виде */
function localTime(date = new Date()) {
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Текстовое тело уведомления (для письма и как основа для Telegram) */
function buildText(b, ref) {
  return [
    'Новая заявка на бронирование',
    `- Дом: ${b.houseName}`,
    `- Даты: ${b.checkIn} → ${b.checkOut} (${b.nights} суток)`,
    `- Гостей: ${b.guests}`,
    `- Итого: ${fmtMoney(b.total)} ₽`,
    `- Имя: ${b.name}`,
    `- Телефон: ${b.phone}`,
    `- Номер заявки: ${ref}`,
    `- Время: ${localTime()}`,
  ].join('\n');
}

/** HTML-версия для Telegram (жирные подписи) */
function buildTelegramHtml(b, ref) {
  return [
    '<b>Новая заявка на бронирование</b>',
    `🏡 <b>Дом:</b> ${escapeHtml(b.houseName)}`,
    `📅 <b>Даты:</b> ${escapeHtml(b.checkIn)} → ${escapeHtml(b.checkOut)} (${b.nights} суток)`,
    `👥 <b>Гостей:</b> ${b.guests}`,
    `💰 <b>Итого:</b> ${fmtMoney(b.total)} ₽`,
    `🙋 <b>Имя:</b> ${escapeHtml(b.name)}`,
    `📞 <b>Телефон:</b> ${escapeHtml(b.phone)}`,
    `🔖 <b>Номер заявки:</b> ${escapeHtml(ref)}`,
    `🕒 <b>Время:</b> ${escapeHtml(localTime())}`,
  ].join('\n');
}

/**
 * Значения по умолчанию для Telegram. Приоритет у переменных окружения:
 * на Railway задайте TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — они переопределят эти.
 * ВНИМАНИЕ: токен лежит в коде для «работает из коробки». Безопаснее держать его
 * только в переменных окружения (и перевыпустить бота у @BotFather, т.к. токен засветился).
 */
const TELEGRAM_BOT_TOKEN_DEFAULT = '8868119198:AAH11Ded58ig6pbq2U4xFSdrJ3-ZouNMyUk';
/**
 * Получатели заявок (можно несколько через запятую). Приоритет у TELEGRAM_CHAT_ID.
 * Здесь: личка владельца (7738750071) + чат из web.telegram.org/k/#-4325555891.
 * Указываем чат и как -4325555891 (обычная группа), и как -1004325555891
 * (супергруппа/канал) — какой формат верный, туда и уйдёт, второй просто отвалится.
 */
const TELEGRAM_CHAT_ID_DEFAULT = '7738750071,-4325555891,-1004325555891';

/** Отправка одного сообщения в один чат */
async function sendTelegramTo(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`chat ${chatId}: ${data.description || res.status}`);
  }
  return true;
}

/**
 * Отправка в Telegram через Bot API. Шлёт всем получателям из TELEGRAM_CHAT_ID
 * (через запятую). Успех — если принял хотя бы один; ошибки по остальным логируем.
 */
async function sendTelegram(b, ref) {
  const token = process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN_DEFAULT;
  const raw = process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID_DEFAULT;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || !ids.length) {
    throw new Error('Telegram не сконфигурирован (нет TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
  }

  const text = buildTelegramHtml(b, ref);
  const results = await Promise.allSettled(ids.map((id) => sendTelegramTo(token, id, text)));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const errs = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);

  if (errs.length) {
    console.warn('[telegram] не доставлено части получателей:', errs.join(' | '));
  }
  if (ok === 0) {
    throw new Error('Telegram: ни один получатель не принял — ' + errs.join(' | '));
  }
  return true;
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) {
    throw new Error('SMTP не сконфигурирован (нет SMTP_HOST)');
  }
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL, иначе STARTTLS
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Отправка письма через nodemailer (SMTP) */
async function sendEmail(b, ref) {
  const to = process.env.MAIL_TO;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!to) {
    throw new Error('E-mail не сконфигурирован (нет MAIL_TO)');
  }
  const tx = getTransporter();
  await tx.sendMail({
    from,
    to: to.split(',').map((s) => s.trim()).filter(Boolean),
    subject: `Новая бронь ${b.houseName} — ${ref}`,
    text: buildText(b, ref),
  });
  return true;
}

/**
 * Отправляет уведомления в Telegram и на e-mail параллельно.
 * Если одна доставка упала — вторую всё равно выполняем,
 * а в ответе честно возвращаем статус каждой.
 */
async function notifyAll(b, ref) {
  const [tg, mail] = await Promise.allSettled([
    sendTelegram(b, ref),
    sendEmail(b, ref),
  ]);

  const status = {
    telegram: tg.status === 'fulfilled',
    email: mail.status === 'fulfilled',
  };
  const errors = {};
  if (tg.status === 'rejected') errors.telegram = tg.reason.message;
  if (mail.status === 'rejected') errors.email = mail.reason.message;

  if (Object.keys(errors).length) {
    console.error('[notify] ошибки доставки:', errors);
  }

  return { status, errors, delivered: status.telegram || status.email };
}

module.exports = { notifyAll, buildText };
