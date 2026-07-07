'use strict';

const { getHouse } = require('./houses');
const store = require('./store');

const MS_DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD -> Date (UTC, полночь) или null */
function parseDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Проверяет заявку и пересчитывает сумму на сервере.
 * @returns {{ok:true, data:object} | {ok:false, error:string}}
 */
function validateBooking(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Пустой запрос' };
  }

  const house = getHouse(body.house);
  if (!house) {
    return { ok: false, error: 'Выбранный дом не найден' };
  }
  if (house.status === 'renovation') {
    return { ok: false, error: 'Этот дом сейчас на ремонте и недоступен для брони' };
  }

  const name = String(body.name || '').trim();
  if (name.length < 2) {
    return { ok: false, error: 'Укажите имя (минимум 2 символа)' };
  }

  const phone = String(body.phone || '').trim();
  if (phone.replace(/\D/g, '').length < 10) {
    return { ok: false, error: 'Укажите корректный телефон (минимум 10 цифр)' };
  }

  const checkIn = parseDate(body.checkIn);
  const checkOut = parseDate(body.checkOut);
  if (!checkIn || !checkOut) {
    return { ok: false, error: 'Некорректные даты' };
  }
  if (checkOut <= checkIn) {
    return { ok: false, error: 'Дата выезда должна быть позже заезда' };
  }

  const nights = Math.round((checkOut - checkIn) / MS_DAY);
  if (nights < 1) {
    return { ok: false, error: 'Минимальный срок — 1 сутки' };
  }

  let guests = parseInt(body.guests, 10);
  if (!Number.isFinite(guests) || guests < 1) guests = 1;

  // Занятость: даты не должны пересекаться с занятыми (админ отмечает их через бота).
  if (!store.isRangeFree(house.id, body.checkIn, body.checkOut)) {
    return { ok: false, error: 'Выбранные даты уже заняты. Пожалуйста, выберите другие.' };
  }

  // Сумму считаем сами из актуальной цены (хранилище) — цене от клиента не доверяем.
  const total = store.getPrice(house.id) * nights;

  return {
    ok: true,
    data: {
      house: house.id,
      houseName: house.name,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      nights,
      guests,
      name,
      phone,
      total,
    },
  };
}

module.exports = { validateBooking };
