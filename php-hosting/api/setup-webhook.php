<?php
// Регистрация webhook Telegram. Откройте этот файл один раз в браузере:
//   https://greenparkksochi.ru/api/setup-webhook.php
// Делайте это после первого деплоя и каждый раз, когда меняете токен бота в config.php.

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/telegram.php';

header('Content-Type: text/html; charset=utf-8');

$c = cfg();
$public = rtrim((string)$c['public_url'], '/');
$secret = (string)$c['tg_webhook_secret'];
$url = $public . '/api/tg/webhook/' . $secret;

if (tg_token() === '') {
  echo '<h2>❌ Не задан токен бота</h2><p>Впишите <code>telegram_bot_token</code> в <code>api/config.php</code> и обновите страницу.</p>';
  exit;
}

$res = tg_set_webhook($url, $secret);

if (!empty($res['ok'])) {
  echo '<h2>✅ Webhook установлен</h2>';
  echo '<p>Адрес: <code>' . htmlspecialchars($url) . '</code></p>';
  echo '<p>Бот готов принимать команды администраторов. Напишите ему <b>/menu</b> в личку.</p>';
} else {
  echo '<h2>❌ Не удалось установить webhook</h2>';
  echo '<p>Причина: <code>' . htmlspecialchars($res['description'] ?? 'неизвестно') . '</code></p>';
  echo '<p>Проверьте токен бота и что сайт открывается по HTTPS.</p>';
}
