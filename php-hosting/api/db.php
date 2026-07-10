<?php
// Конфигурация и подключение к MySQL (PDO). Плюс мелкие утилиты.

function cfg() {
  static $c = null;
  if ($c === null) {
    $file = __DIR__ . '/config.php';
    $c = is_file($file) ? require $file : require __DIR__ . '/config.example.php';
  }
  return $c;
}

function db() {
  static $pdo = null;
  if ($pdo === null) {
    $d = cfg()['db'];
    // На большинстве хостингов достаточно host=localhost. Поля socket/port —
    // опциональные, на случай нестандартного подключения (и для локальных тестов).
    if (!empty($d['socket'])) {
      $dsn = "mysql:unix_socket={$d['socket']};dbname={$d['name']};charset={$d['charset']}";
    } else {
      $host = $d['host'] ?? 'localhost';
      $port = !empty($d['port']) ? ";port={$d['port']}" : '';
      $dsn = "mysql:host={$host}{$port};dbname={$d['name']};charset={$d['charset']}";
    }
    $pdo = new PDO($dsn, $d['user'], $d['pass'], [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
  }
  return $pdo;
}

/** Номер заявки вида ZG-XXXXXX */
function make_ref() {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $s = '';
  for ($i = 0; $i < 6; $i++) $s .= $chars[random_int(0, strlen($chars) - 1)];
  return 'ZG-' . $s;
}

/** IP клиента */
function client_ip() {
  return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

/** Простой rate-limit по IP через таблицу rate_limit: не больше $limit запросов в минуту */
function rate_ok($ip, $limit) {
  $limit = $limit > 0 ? (int)$limit : 5;
  $now = time();
  $windowStart = $now - 60;
  $pdo = db();
  $pdo->prepare('DELETE FROM rate_limit WHERE ts < ?')->execute([$windowStart]);
  $st = $pdo->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ? AND ts >= ?');
  $st->execute([$ip, $windowStart]);
  if ((int)$st->fetchColumn() >= $limit) return false;
  $pdo->prepare('INSERT INTO rate_limit (ip, ts) VALUES (?, ?)')->execute([$ip, $now]);
  return true;
}

/** Логируем заявку в таблицу bookings (не теряется, даже если Telegram недоступен) */
function log_booking($ref, $ip, $b) {
  try {
    $st = db()->prepare(
      'INSERT INTO bookings (ref, house_id, house_name, check_in, check_out, nights, guests, name, phone, total, ip, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $st->execute([
      $ref, $b['house'], $b['houseName'], $b['checkIn'], $b['checkOut'],
      $b['nights'], $b['guests'], $b['name'], $b['phone'], $b['total'],
      $ip, gmdate('Y-m-d H:i:s'),
    ]);
  } catch (Throwable $e) {
    error_log('[log_booking] ' . $e->getMessage());
  }
}
