'use strict';

/**
 * Справочник домов — источник правды по ценам.
 * Должен совпадать по id/цене с массивом houses в public/index.html.
 * Цена итоговой заявки всегда пересчитывается на сервере из этого справочника,
 * клиентской сумме не доверяем.
 */
const HOUSES = [
  { id: 'les',   name: 'Лесная опушка',  price: 8500,  cap: 6  },
  { id: 'ozero', name: 'У озера',        price: 12000, cap: 8  },
  { id: 'gora',  name: 'Горный склон',   price: 9500,  cap: 4  },
  { id: 'zima',  name: 'Зимняя усадьба', price: 15000, cap: 10 },
  { id: 'bor',   name: 'Сосновый бор',   price: 7000,  cap: 5  },
  { id: 'zavod', name: 'Тихая заводь',   price: 10500, cap: 6  },
];

function getHouse(id) {
  return HOUSES.find((h) => h.id === id) || null;
}

module.exports = { HOUSES, getHouse };
