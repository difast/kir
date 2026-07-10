<?php
// Хранилище цен и занятости в MySQL (порт из server/store.js).
// Таблицы: prices, price_dates, busy_dates (см. schema.sql).

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/houses.php';
require_once __DIR__ . '/dates.php';

// ---------- цены ----------
function base_price($id) {
  $st = db()->prepare('SELECT price FROM prices WHERE house_id = ?');
  $st->execute([$id]);
  $p = $st->fetchColumn();
  if ($p !== false && $p !== null) return (int)$p;
  $h = get_house($id);
  return $h ? (int)$h['price'] : 0;
}

function get_price($id) { return base_price($id); }

function set_price($id, $price) {
  $n = max(0, (int)round((float)$price));
  db()->prepare('INSERT INTO prices (house_id, price) VALUES (?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price)')
      ->execute([$id, $n]);
  return true;
}

/** Цена конкретной ночи: спеццена даты или базовая */
function get_price_for_date($id, $date) {
  $st = db()->prepare('SELECT price FROM price_dates WHERE house_id = ? AND d = ?');
  $st->execute([$id, $date]);
  $p = $st->fetchColumn();
  if ($p !== false && $p !== null) return (int)$p;
  return base_price($id);
}

/** Установить/снять спеццену на набор дат. price == null|0 -> вернуть к базовой */
function set_price_dates($id, $dates, $price) {
  $n = ($price === null) ? null : max(0, (int)round((float)$price));
  $pdo = db();
  if ($n === null || $n === 0) {
    $st = $pdo->prepare('DELETE FROM price_dates WHERE house_id = ? AND d = ?');
    foreach ($dates as $d) $st->execute([$id, $d]);
  } else {
    $st = $pdo->prepare('INSERT INTO price_dates (house_id, d, price) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price)');
    foreach ($dates as $d) $st->execute([$id, $d, $n]);
  }
  return true;
}

function clear_price_dates($id) {
  db()->prepare('DELETE FROM price_dates WHERE house_id = ?')->execute([$id]);
}

function get_price_dates($id) {
  $st = db()->prepare('SELECT d, price FROM price_dates WHERE house_id = ? ORDER BY d');
  $st->execute([$id]);
  $out = [];
  foreach ($st as $r) $out[$r['d']] = (int)$r['price'];
  return $out;
}

/** Сумма за ночи [checkIn, checkOut) с учётом спеццен */
function nights_total($id, $checkIn, $checkOut) {
  $total = 0;
  $end = strtotime($checkOut . ' UTC');
  for ($t = strtotime($checkIn . ' UTC'); $t < $end; $t += 86400) {
    $total += get_price_for_date($id, gmdate('Y-m-d', $t));
  }
  return $total;
}

// ---------- занятость ----------
function get_busy($id) {
  $st = db()->prepare('SELECT d FROM busy_dates WHERE house_id = ? ORDER BY d');
  $st->execute([$id]);
  return $st->fetchAll(PDO::FETCH_COLUMN);
}

function set_busy_dates($id, $dates, $makeBusy) {
  $pdo = db();
  if ($makeBusy) {
    $st = $pdo->prepare('INSERT IGNORE INTO busy_dates (house_id, d) VALUES (?, ?)');
    foreach ($dates as $d) $st->execute([$id, $d]);
  } else {
    $st = $pdo->prepare('DELETE FROM busy_dates WHERE house_id = ? AND d = ?');
    foreach ($dates as $d) $st->execute([$id, $d]);
  }
  return get_busy($id);
}

function is_range_free($id, $checkIn, $checkOut) {
  $end = strtotime($checkOut . ' UTC');
  $st = db()->prepare('SELECT 1 FROM busy_dates WHERE house_id = ? AND d = ? LIMIT 1');
  for ($t = strtotime($checkIn . ' UTC'); $t < $end; $t += 86400) {
    $st->execute([$id, gmdate('Y-m-d', $t)]);
    if ($st->fetchColumn()) return false;
  }
  return true;
}

/** Состояние для фронта: {prices, priceDates, busy} по всем домам */
function public_state() {
  $prices = [];
  $priceDates = [];
  $busy = [];
  foreach (HOUSES as $h) {
    $id = $h['id'];
    $prices[$id] = base_price($id);
    $pd = get_price_dates($id);
    $priceDates[$id] = $pd ? $pd : (object)[];   // пустое -> {} в JSON
    $busy[$id] = get_busy($id);
  }
  return ['prices' => $prices, 'priceDates' => $priceDates, 'busy' => $busy];
}
