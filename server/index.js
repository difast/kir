'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const { validateBooking } = require('./validate');
const { createRateLimiter } = require('./rateLimit');
const { notifyAll } = require('./notify');
const { logBooking } = require('./logger');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// За обратным прокси (Railway/nginx) корректно определяем IP клиента.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '16kb' }));

const allow = createRateLimiter(process.env.RATE_LIMIT_PER_MIN);

/** Номер заявки вида ZG-XXXXXX */
function makeRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'ZG-' + s;
}

// ---------- API: приём заявки ----------
app.post('/api/booking', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Антиспам 1: honeypot. Поле company у людей всегда пустое.
  if (req.body && String(req.body.company || '').trim() !== '') {
    console.warn('[booking] honeypot сработал, ip=%s', ip);
    // Делаем вид, что всё хорошо, но ничего не отправляем.
    return res.json({ ok: true, ref: makeRef() });
  }

  // Антиспам 2: rate-limit по IP.
  if (!allow(ip)) {
    return res
      .status(429)
      .json({ ok: false, error: 'Слишком много заявок. Попробуйте через минуту.' });
  }

  // Валидация + пересчёт суммы на сервере.
  const result = validateBooking(req.body);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  const booking = result.data;
  const ref = makeRef();

  // Логируем сразу — до отправки, чтобы заявка не потерялась при сбое доставки.
  logBooking({ ref, ip, ...booking });

  // Параллельная доставка в Telegram и на e-mail.
  let delivery;
  try {
    delivery = await notifyAll(booking, ref);
  } catch (e) {
    console.error('[booking] непредвиденная ошибка доставки:', e);
    delivery = { delivered: false, status: {}, errors: { fatal: e.message } };
  }

  // Заявка принята и залогирована в любом случае — возвращаем ref.
  // delivery отражает реальный статус доставки (для отладки/мониторинга).
  return res.json({ ok: true, ref, delivery });
});

// ---------- Статика ----------
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  setHeaders(res, filePath) {
    // фото кешируем надолго, остальное (html/js/css) — без долгого кеша, чтобы правки применялись сразу
    if (/[\\/]images[\\/]/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Фолбэк на лендинг.
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
