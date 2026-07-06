'use strict';

/**
 * Справочник домов — источник правды по ценам и статусу.
 * Должен совпадать по id/цене с public/houses-data.js (там же — описания
 * и условия аренды для страниц домов).
 *
 * Цена итоговой заявки всегда пересчитывается на сервере из этого справочника —
 * клиентской сумме не доверяем. Дом со status:'renovation' забронировать нельзя.
 *
 * Цена — базовая ставка за сутки (на Авито указана как «от»).
 */
const HOUSES = [
  {
    id: 'dom100',
    name: 'Семейный дом с бассейном',
    price: 10000,
    cap: 6,
    status: 'active',
  },
  {
    id: 'dom35',
    name: 'Уютный дом у моря',
    price: 3500,
    cap: 4,
    status: 'active',
  },
  {
    id: 'remont',
    name: 'Гостевой домик',
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
