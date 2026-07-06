'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bookings.log');

/**
 * Логируем заявку в консоль и в файл logs/bookings.log —
 * на случай, если доставка в Telegram/почту не сработает.
 */
function logBooking(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  // Консоль — всегда.
  console.log('[booking]', line);
  // Файл — best-effort, ошибка записи не должна ронять обработку заявки.
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    console.error('[logger] не удалось записать в файл:', e.message);
  }
}

module.exports = { logBooking, LOG_FILE };
