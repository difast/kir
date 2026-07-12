<?php
// Роутер API: booking / state.js / state / webhook Telegram.
// Все запросы /api/* приходят сюда через .htaccess.

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/houses.php';
require_once __DIR__ . '/store.php';
require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/telegram.php';

$c = cfg();

// Путь после /api/
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = preg_replace('#^.*/api/#', '', $uri);
$path = trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function json_out($data, $status = 200) {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

// ---------- Актуальные цены и занятость для фронта ----------
if ($path === 'state.js' && $method === 'GET') {
  header('Content-Type: application/javascript; charset=utf-8');
  header('Cache-Control: no-cache');
  echo 'window.__STATE__=' . json_encode(public_state(), JSON_UNESCAPED_UNICODE) . ';';
  exit;
}
if ($path === 'state' && $method === 'GET') {
  header('Cache-Control: no-cache');
  json_out(public_state());
}

// ---------- Webhook Telegram (админ-команды) ----------
if (strpos($path, 'tg/webhook/') === 0 && $method === 'POST') {
  $secret = substr($path, strlen('tg/webhook/'));
  $headerSecret = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
  if ($secret !== $c['tg_webhook_secret'] || ($headerSecret !== '' && $headerSecret !== $c['tg_webhook_secret'])) {
    http_response_code(403);
    exit;
  }
  $raw = file_get_contents('php://input');
  $update = json_decode($raw, true);

  // Мгновенно отвечаем Telegram «200», а обработку (исходящие sendMessage)
  // доделываем ПОСЛЕ закрытия соединения — иначе Telegram ждёт наши вызовы и
  // получает «Connection timed out». Работает и в FPM, и в CGI-режиме хостинга.
  ignore_user_abort(true);
  @set_time_limit(30);
  http_response_code(200);
  while (ob_get_level() > 0) { ob_end_clean(); }
  ob_start();
  echo 'ok';
  header('Content-Type: text/plain; charset=utf-8');
  header('Content-Length: ' . ob_get_length());
  header('Connection: close');
  ob_end_flush();
  flush();
  if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
  }
  if (is_array($update)) tg_process_update($update);
  exit;
}

// ---------- Приём заявки ----------
if ($path === 'booking' && $method === 'POST') {
  $ip = client_ip();
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = [];

  // Антиспам 1: honeypot. Поле company у людей всегда пустое.
  if (trim((string)($body['company'] ?? '')) !== '') {
    json_out(['ok' => true, 'ref' => make_ref()]);
  }

  // Антиспам 2: rate-limit по IP.
  if (!rate_ok($ip, (int)($c['rate_limit_per_min'] ?? 5))) {
    json_out(['ok' => false, 'error' => 'Слишком много заявок. Попробуйте через минуту.'], 429);
  }

  // Валидация + пересчёт суммы на сервере.
  $res = validate_booking($body);
  if (!$res['ok']) {
    json_out(['ok' => false, 'error' => $res['error']], 400);
  }

  $booking = $res['data'];
  $ref = make_ref();

  // Логируем сразу — до отправки, чтобы заявка не потерялась при сбое доставки.
  log_booking($ref, $ip, $booking);

  $delivery = ['delivered' => false, 'status' => [], 'errors' => []];
  try {
    $delivery = tg_notify_booking($booking, $ref);
  } catch (Throwable $e) {
    $delivery = ['delivered' => false, 'status' => [], 'errors' => ['fatal' => $e->getMessage()]];
  }

  json_out(['ok' => true, 'ref' => $ref, 'delivery' => $delivery]);
}

// ---------- ничего не совпало ----------
json_out(['ok' => false, 'error' => 'Not found'], 404);
