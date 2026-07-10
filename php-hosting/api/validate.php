<?php
// Серверная валидация заявки + пересчёт суммы (порт из server/validate.js).
// Минимальный срок бронирования — 5 ночей во всех домах.

require_once __DIR__ . '/houses.php';
require_once __DIR__ . '/store.php';

const MIN_NIGHTS = 5;

/** 'YYYY-MM-DD' -> unix-время (UTC, полночь) или null */
function parse_iso_date($str) {
  if (!is_string($str) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $str)) return null;
  [$y, $m, $d] = array_map('intval', explode('-', $str));
  if (!checkdate($m, $d, $y)) return null;
  return gmmktime(0, 0, 0, $m, $d, $y);
}

/**
 * Проверяет заявку и пересчитывает сумму на сервере.
 * @return array{ok: true, data: array} | array{ok: false, error: string}
 */
function validate_booking($body) {
  if (!is_array($body)) {
    return ['ok' => false, 'error' => 'Пустой запрос'];
  }

  $house = get_house($body['house'] ?? null);
  if (!$house) {
    return ['ok' => false, 'error' => 'Выбранный дом не найден'];
  }
  if ($house['status'] === 'renovation') {
    return ['ok' => false, 'error' => 'Этот дом сейчас на ремонте и недоступен для брони'];
  }

  $name = trim((string)($body['name'] ?? ''));
  if (mb_strlen($name) < 2) {
    return ['ok' => false, 'error' => 'Укажите имя (минимум 2 символа)'];
  }

  $phone = trim((string)($body['phone'] ?? ''));
  if (strlen(preg_replace('/\D/', '', $phone)) < 10) {
    return ['ok' => false, 'error' => 'Укажите корректный телефон (минимум 10 цифр)'];
  }

  $checkIn  = parse_iso_date($body['checkIn'] ?? null);
  $checkOut = parse_iso_date($body['checkOut'] ?? null);
  if ($checkIn === null || $checkOut === null) {
    return ['ok' => false, 'error' => 'Некорректные даты'];
  }
  if ($checkOut <= $checkIn) {
    return ['ok' => false, 'error' => 'Дата выезда должна быть позже заезда'];
  }

  $nights = (int)round(($checkOut - $checkIn) / 86400);
  if ($nights < MIN_NIGHTS) {
    return ['ok' => false, 'error' => 'Минимальный срок бронирования — ' . MIN_NIGHTS . ' ночей'];
  }

  $guests = (int)($body['guests'] ?? 0);
  if ($guests < 1) $guests = 1;

  // Занятость: даты не должны пересекаться с занятыми (админ отмечает их через бота).
  if (!is_range_free($house['id'], $body['checkIn'], $body['checkOut'])) {
    return ['ok' => false, 'error' => 'Выбранные даты уже заняты. Пожалуйста, выберите другие.'];
  }

  // Сумму считаем сами по ценам каждой ночи — цене от клиента не доверяем.
  $total = nights_total($house['id'], $body['checkIn'], $body['checkOut']);

  return ['ok' => true, 'data' => [
    'house'     => $house['id'],
    'houseName' => $house['name'],
    'checkIn'   => $body['checkIn'],
    'checkOut'  => $body['checkOut'],
    'nights'    => $nights,
    'guests'    => $guests,
    'name'      => $name,
    'phone'     => $phone,
    'total'     => $total,
  ]];
}
