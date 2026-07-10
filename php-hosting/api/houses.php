<?php
// Справочник домов — источник правды по цене и статусу.
// Должен совпадать по id/цене с public/houses-data.js (там описания для страниц).
// Цена — базовая ставка за сутки. Дом со status 'renovation' забронировать нельзя.

const HOUSES = [
  ['id' => 'dom100', 'name' => 'Семейный дом на 6 человек',  'price' => 10000, 'cap' => 6, 'status' => 'active'],
  ['id' => 'dom35',  'name' => 'Семейный дом на 4 человека', 'price' => 3500,  'cap' => 4, 'status' => 'active'],
  ['id' => 'dom35b', 'name' => 'Семейный дом на 4 человека', 'price' => 3500,  'cap' => 4, 'status' => 'active'],
  ['id' => 'remont', 'name' => 'Гостевой домик',             'price' => 0,     'cap' => 0, 'status' => 'renovation'],
];

function get_house($id) {
  if ($id === null) return null;
  foreach (HOUSES as $h) {
    if ($h['id'] === $id) return $h;
  }
  return null;
}
