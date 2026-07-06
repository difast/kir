'use strict';

/**
 * Справочник домов — источник правды по ценам и статусу.
 * Должен совпадать по id/цене с public/houses-data.js (там же — описания
 * и условия аренды для страниц домов).
 *
 * Цена итоговой заявки всегда пересчитывается на сервере из этого справочника —
 * клиентской сумме не доверяем. Дом со status:'renovation' забронировать нельзя.
 *
 * TODO (Часть 2): подставить реальные название и цену за сутки из объявлений Авито.
 */
const HOUSES = [
  {
    id: 'dom100',
    name: 'Дом 100 м² в Сочи',   // TODO: уточнить название по Авито
    price: 10000,                 // TODO: реальная цена за сутки с Авито
    cap: 6,
    status: 'active',
  },
  {
    id: 'dom35',
    name: 'Дом 35 м² в Сочи',    // TODO: уточнить название по Авито
    price: 6000,                  // TODO: реальная цена за сутки с Авито
    cap: 4,
    status: 'active',
  },
  {
    id: 'remont',
    name: 'Дом у моря',           // TODO: уточнить название
    price: 0,
    cap: 0,
    status: 'renovation',         // на ремонте — бронирование недоступно
  },
];

function getHouse(id) {
  return HOUSES.find((h) => h.id === id) || null;
}

/** Только дома, доступные для брони */
function activeHouses() {
  return HOUSES.filter((h) => h.status === 'active');
}

module.exports = { HOUSES, getHouse, activeHouses };
