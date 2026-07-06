/* Общие данные домов для фронтенда: каталог + страницы домов.
   Источник правды по цене/статусу — server/houses.js (id и price должны совпадать).

   Поля description и conditions — ТЕКСТ С АВИТО. Сейчас это плейсхолдеры;
   в Части 2 заменяются реальным описанием и условиями аренды.

   type — тип SVG-сцены (иллюстрация), из существующего генератора в index.html:
   forest | lake | mountain | winter | pines | water
*/
window.__HOUSES__ = [
  {
    id: 'dom100',
    name: 'Дом 100 м² в Сочи',                 // TODO: название с Авито
    loc: 'Сочи · 3 комнаты · 100 м²',
    price: 10000,                              // TODO: цена за сутки с Авито
    cap: 6,
    area: 100,
    rooms: 3,
    tags: ['3 комнаты', '100 м²', 'Сочи'],     // TODO: реальные удобства с Авито
    type: 'mountain',
    status: 'active',
    avito: 'https://www.avito.ru/sochi/doma_dachi_kottedzhi/3-k._dom_100_m_7982200683',
    // TODO (Часть 2): заменить абзацы описанием из объявления
    description: [
      'Описание дома будет перенесено с Авито.',
    ],
    // TODO (Часть 2): заменить пунктами из раздела «условия аренды» на Авито
    conditions: [
      'Условия аренды будут перенесены с Авито.',
    ],
  },
  {
    id: 'dom35',
    name: 'Дом 35 м² в Сочи',                  // TODO: название с Авито
    loc: 'Сочи · 2 комнаты · 35 м²',
    price: 6000,                               // TODO: цена за сутки с Авито
    cap: 4,
    area: 35,
    rooms: 2,
    tags: ['2 комнаты', '35 м²', 'Сочи'],      // TODO: реальные удобства с Авито
    type: 'lake',
    status: 'active',
    avito: 'https://www.avito.ru/sochi/doma_dachi_kottedzhi/2-k._dom_35_m_8032623530',
    description: [
      'Описание дома будет перенесено с Авито.',
    ],
    conditions: [
      'Условия аренды будут перенесены с Авито.',
    ],
  },
  {
    id: 'remont',
    name: 'Дом у моря',                        // TODO: уточнить название
    loc: 'Сочи',
    price: 0,
    cap: 0,
    area: null,
    rooms: null,
    tags: [],
    type: 'water',
    status: 'renovation',                      // на ремонте — карточка-заглушка, брони нет
    avito: '',
    description: [
      'Дом сейчас на ремонте — готовим его к новому сезону.',
    ],
    conditions: [],
  },
];
