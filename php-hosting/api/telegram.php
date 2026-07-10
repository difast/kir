<?php
// Telegram: отправка заявок получателям + админ-бот (цены и занятость).
// Порт из server/notify.js (отправка) и server/telegram.js (админ-команды).
// Состояние пошагового диалога хранится в таблице tg_pending (PHP статeless).

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/houses.php';
require_once __DIR__ . '/store.php';
require_once __DIR__ . '/dates.php';

// ---------- конфиг ----------
function tg_token()     { return (string)cfg()['telegram_bot_token']; }
function tg_chat_ids()  { return array_values(array_filter(array_map('trim', explode(',', (string)cfg()['telegram_chat_ids'])), fn($x) => $x !== '')); }
function tg_admin_ids() { return array_values(array_filter(array_map('trim', explode(',', (string)cfg()['admin_ids'])), fn($x) => $x !== '')); }
function is_admin($id)  { return in_array((string)$id, tg_admin_ids(), true); }

// ---------- HTTP к Bot API ----------
function tg_http_post($url, $payload) {
  $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_POST           => true,
      CURLOPT_POSTFIELDS     => $json,
      CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT        => 15,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) throw new RuntimeException('curl: ' . $err);
    return $res;
  }
  // запасной вариант без cURL
  $ctx = stream_context_create(['http' => [
    'method'  => 'POST',
    'header'  => "Content-Type: application/json\r\n",
    'content' => $json,
    'timeout' => 15,
    'ignore_errors' => true,
  ]]);
  $res = @file_get_contents($url, false, $ctx);
  if ($res === false) throw new RuntimeException('http_post failed');
  return $res;
}

function tg_api($method, $params) {
  $url = 'https://api.telegram.org/bot' . tg_token() . '/' . $method;
  try {
    $res = tg_http_post($url, $params);
    $data = json_decode($res, true);
    return is_array($data) ? $data : ['ok' => false];
  } catch (Throwable $e) {
    error_log('[telegram] ' . $method . ': ' . $e->getMessage());
    return ['ok' => false, 'description' => $e->getMessage()];
  }
}

function tg_send($chatId, $text, $extra = []) {
  return tg_api('sendMessage', array_merge([
    'chat_id' => $chatId,
    'text' => $text,
    'parse_mode' => 'HTML',
    'disable_web_page_preview' => true,
  ], $extra));
}

function tg_answer($cbId, $text = '') {
  return tg_api('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => $text]);
}

// ---------- утилиты форматирования ----------
function fmt_money($n) { return number_format((int)$n, 0, '', ' '); }

function esc_html($s) {
  return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], (string)$s);
}

/** 'YYYY-MM-DD' -> 'DD.MM.YYYY' */
function ru_date($iso) { [$y, $m, $d] = explode('-', $iso); return "$d.$m.$y"; }
function next_iso($iso) { return gmdate('Y-m-d', strtotime($iso . ' UTC') + 86400); }

/** Сжать список дат в диапазоны: ['..01','..02','..03','..10'] -> '01.– 03., 10.' */
function compact_ranges($dates) {
  $s = $dates; sort($s);
  if (!count($s)) return '';
  $out = []; $start = $s[0]; $prev = $s[0];
  for ($i = 1; $i <= count($s); $i++) {
    if ($i < count($s) && $s[$i] === next_iso($prev)) { $prev = $s[$i]; continue; }
    $out[] = $start === $prev ? ru_date($start) : (ru_date($start) . ' – ' . ru_date($prev));
    if ($i < count($s)) { $start = $s[$i]; $prev = $s[$i]; }
  }
  return implode(', ', $out);
}

// ---------- заявка -> Telegram ----------
function tg_local_time() {
  $tz = new DateTimeZone('Europe/Moscow');
  return (new DateTime('now', $tz))->format('d.m.Y H:i');
}

function build_booking_html($b, $ref) {
  return implode("\n", [
    '<b>Новая заявка на бронирование</b>',
    '🏡 <b>Дом:</b> ' . esc_html($b['houseName']),
    '📅 <b>Даты:</b> ' . esc_html($b['checkIn']) . ' → ' . esc_html($b['checkOut']) . ' (' . $b['nights'] . ' суток)',
    '👥 <b>Гостей:</b> ' . $b['guests'],
    '💰 <b>Итого:</b> ' . fmt_money($b['total']) . ' ₽',
    '🙋 <b>Имя:</b> ' . esc_html($b['name']),
    '📞 <b>Телефон:</b> ' . esc_html($b['phone']),
    '🔖 <b>Номер заявки:</b> ' . esc_html($ref),
    '🕒 <b>Время:</b> ' . esc_html(tg_local_time()),
  ]);
}

/** Отправка заявки всем получателям. Успех — если принял хотя бы один. */
function tg_notify_booking($b, $ref) {
  $ids = tg_chat_ids();
  if (tg_token() === '' || !count($ids)) {
    return ['delivered' => false, 'status' => ['telegram' => false], 'errors' => ['telegram' => 'Telegram не сконфигурирован']];
  }
  $text = build_booking_html($b, $ref);
  $ok = 0; $errs = [];
  foreach ($ids as $id) {
    $r = tg_send($id, $text);
    if (!empty($r['ok'])) $ok++;
    else $errs[] = "chat $id: " . ($r['description'] ?? 'error');
  }
  return [
    'delivered' => $ok > 0,
    'status' => ['telegram' => $ok > 0],
    'errors' => $errs ? ['telegram' => implode(' | ', $errs)] : [],
  ];
}

// ---------- регистрация webhook ----------
function tg_set_webhook($url, $secret) {
  return tg_api('setWebhook', [
    'url' => $url,
    'secret_token' => $secret,
    'allowed_updates' => ['message', 'callback_query'],
  ]);
}

// ---------- состояние диалога (таблица tg_pending) ----------
function pending_get($chatId) {
  $st = db()->prepare('SELECT data FROM tg_pending WHERE chat_id = ?');
  $st->execute([$chatId]);
  $raw = $st->fetchColumn();
  if ($raw === false || $raw === null) return null;
  $d = json_decode($raw, true);
  return is_array($d) ? $d : null;
}
function pending_set($chatId, $data) {
  db()->prepare('INSERT INTO tg_pending (chat_id, data, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)')
      ->execute([$chatId, json_encode($data, JSON_UNESCAPED_UNICODE), time()]);
}
function pending_del($chatId) {
  db()->prepare('DELETE FROM tg_pending WHERE chat_id = ?')->execute([$chatId]);
}

// ---------- тексты-подсказки ----------
const DATE_HELP =
  "Формат даты — свободный, главное <b>день, месяц, год</b>. Разделители любые " .
  "(точка, пробел, дефис) или без них:\n" .
  "• одна дата: <code>10.08.2026</code>, <code>10 08 2026</code>, <code>10082026</code>\n" .
  "• диапазон: <code>10.08.2026 - 20.08.2026</code> или <code>10.08.2026 по 20.08.2026</code>\n" .
  "• несколько сразу — через запятую или с новой строки.";
const MONTH_HELP =
  "Пришлите <b>месяц и год</b>: <code>08 2026</code>, <code>08.2026</code> или <code>2026-08</code>.";
const MENU_TEXT = 'Панель GreenPark. Что меняем?';

// ---------- клавиатуры ----------
function menu_kb() {
  return ['inline_keyboard' => [
    [['text' => '💰 Цены', 'callback_data' => 'menu:price'],
     ['text' => '📅 Занятость', 'callback_data' => 'menu:busy']],
    [['text' => '👁 Обзор занятости', 'callback_data' => 'menu:overview']],
  ]];
}
function houses_kb($prefix) {
  $rows = [];
  foreach (HOUSES as $h) {
    $rows[] = [[
      'text' => ($h['status'] === 'renovation' ? '🛠 ' : '') . $h['name'] . ' — ' . fmt_money(get_price($h['id'])) . ' ₽',
      'callback_data' => $prefix . ':' . $h['id'],
    ]];
  }
  $rows[] = [['text' => '← Меню', 'callback_data' => 'menu:main']];
  return ['inline_keyboard' => $rows];
}
function price_mode_kb($id) {
  return ['inline_keyboard' => [
    [['text' => '🏷 Базовая цена', 'callback_data' => 'pm:base:' . $id]],
    [['text' => '📆 Цена на даты', 'callback_data' => 'pm:dates:' . $id]],
    [['text' => '🗓 Цена на месяц', 'callback_data' => 'pm:month:' . $id]],
    [['text' => '♻️ Сбросить спеццены', 'callback_data' => 'pm:clear:' . $id]],
    [['text' => '← Дома', 'callback_data' => 'menu:price']],
  ]];
}
function busy_mode_kb($id) {
  return ['inline_keyboard' => [
    [['text' => '🔴 Занять даты', 'callback_data' => 'bm:occupy:' . $id]],
    [['text' => '🟢 Освободить даты', 'callback_data' => 'bm:free:' . $id]],
    [['text' => '🧹 Сбросить всю занятость', 'callback_data' => 'bm:clear:' . $id]],
    [['text' => '👁 Обзор занятости', 'callback_data' => 'menu:overview'],
     ['text' => '← Дома', 'callback_data' => 'menu:busy']],
  ]];
}
function overview_kb() {
  return ['inline_keyboard' => [
    [['text' => '🧹 Сбросить занятость по ВСЕМ домам', 'callback_data' => 'busyall:ask']],
    [['text' => '← Меню', 'callback_data' => 'menu:main']],
  ]];
}
function confirm_reset_all_kb() {
  return ['inline_keyboard' => [
    [['text' => '✅ Да, снять ВСЮ занятость', 'callback_data' => 'busyall:yes']],
    [['text' => '✖️ Отмена', 'callback_data' => 'menu:overview']],
  ]];
}

function busy_info($id) {
  $b = get_busy($id);
  return count($b) ? compact_ranges($b) : 'нет занятых дат';
}
function overview_text() {
  $out = "📅 <b>Занятость по домам</b>\n";
  foreach (HOUSES as $h) {
    if ($h['status'] === 'renovation') continue;
    $b = get_busy($h['id']);
    $out .= "\n<b>{$h['name']}</b>\n" . (count($b) ? compact_ranges($b) . " — занято дней: " . count($b) : '✅ свободно') . "\n";
  }
  $out .= "\nЧтобы изменить — «📅 Занятость» → выберите дом.";
  return $out;
}
function price_dates_info($id) {
  $pd = get_price_dates($id);
  $keys = array_keys($pd);
  sort($keys);
  if (!count($keys)) return 'спеццен нет (везде базовая)';
  $n = count($keys);
  $preview = implode(', ', array_map(fn($d) => "$d: " . fmt_money($pd[$d]) . " ₽", array_slice($keys, 0, 6)));
  return $preview . ($n > 6 ? " … и ещё " . ($n - 6) : '');
}

// ---------- обработка апдейтов ----------
function tg_process_update($update) {
  try {
    if (isset($update['callback_query'])) { on_callback($update['callback_query']); return; }
    if (isset($update['message']['text'])) { on_message($update['message']); return; }
  } catch (Throwable $e) {
    error_log('[telegram] update: ' . $e->getMessage());
  }
}

function on_message($msg) {
  $chatId = $msg['chat']['id'];
  $text = trim($msg['text']);

  if (!is_admin($chatId)) {
    if (preg_match('#^/(start|help|menu)#', $text)) tg_send($chatId, 'Этот бот принимает команды только от администраторов.');
    return;
  }

  if (preg_match('#^/(start|help|menu)#', $text)) { pending_del($chatId); tg_send($chatId, MENU_TEXT, ['reply_markup' => menu_kb()]); return; }
  if (preg_match('#^/price#', $text)) { pending_del($chatId); tg_send($chatId, 'Шаг 1. Выберите дом, цену которого меняем:', ['reply_markup' => houses_kb('price')]); return; }
  if (preg_match('#^/busy|^/calendar#', $text)) { pending_del($chatId); tg_send($chatId, 'Шаг 1. Выберите дом для управления занятостью:', ['reply_markup' => houses_kb('busy')]); return; }
  if (preg_match('#^/(overview|occupancy|zanyatost)#', $text)) { pending_del($chatId); tg_send($chatId, overview_text(), ['reply_markup' => overview_kb()]); return; }

  $p = pending_get($chatId);
  if (!$p) { tg_send($chatId, MENU_TEXT, ['reply_markup' => menu_kb()]); return; }

  $house = get_house($p['id'] ?? null);
  if (!$house) { pending_del($chatId); tg_send($chatId, 'Дом не найден.', ['reply_markup' => menu_kb()]); return; }

  if ($p['action'] === 'price') { on_price_input($chatId, $house, $p, $text); return; }
  if ($p['action'] === 'busy')  { on_busy_input($chatId, $house, $p, $text); return; }
}

function on_price_input($chatId, $house, $p, $text) {
  // Режим «базовая» — сразу число.
  if (($p['mode'] ?? '') === 'base') {
    $n = (int)preg_replace('/\D/', '', $text);
    if ($n <= 0) { tg_send($chatId, 'Нужно число — рублей за сутки. Попробуйте ещё раз:'); return; }
    set_price($p['id'], $n);
    pending_del($chatId);
    tg_send($chatId, "✅ Базовая цена «{$house['name']}» — <b>" . fmt_money($n) . " ₽/сутки</b>.", ['reply_markup' => menu_kb()]);
    return;
  }

  // Режимы «на даты» / «на месяц» — сначала даты, потом цена.
  if (($p['step'] ?? '') === 'dates') {
    $r = parse_date_entries($text);
    if (!count($r['dates'])) { tg_send($chatId, "Не удалось распознать даты" . (count($r['bad']) ? " (" . implode(', ', $r['bad']) . ")" : '') . ".\n\n" . DATE_HELP); return; }
    $p['dates'] = $r['dates']; $p['step'] = 'price'; pending_set($chatId, $p);
    $out = "Шаг 3. Выбрано дат: <b>" . count($r['dates']) . "</b> (" . implode(', ', array_slice($r['dates'], 0, 6)) . (count($r['dates']) > 6 ? ' …' : '') . ").\n";
    if (count($r['bad'])) $out .= "Не распознано и пропущено: " . implode(', ', $r['bad']) . "\n";
    $out .= "\nТеперь пришлите <b>цену за сутки</b> для этих дат (число в рублях). Чтобы вернуть базовую цену на эти даты — пришлите <code>0</code>.";
    tg_send($chatId, $out);
    return;
  }

  if (($p['step'] ?? '') === 'month') {
    $dates = month_dates($text);
    if (!$dates) { tg_send($chatId, "Не удалось распознать месяц.\n\n" . MONTH_HELP); return; }
    $p['dates'] = $dates; $p['step'] = 'price'; pending_set($chatId, $p);
    tg_send($chatId,
      "Шаг 3. Месяц распознан: <b>" . count($dates) . "</b> дней (" . $dates[0] . " … " . $dates[count($dates) - 1] . ").\n\n" .
      "Теперь пришлите <b>цену за сутки</b> на весь этот месяц (число в рублях). Чтобы вернуть базовую цену — пришлите <code>0</code>.");
    return;
  }

  if (($p['step'] ?? '') === 'price') {
    $raw = preg_replace('/\D/', '', $text);
    if ($raw === '' && !preg_match('/^0/', trim($text))) { tg_send($chatId, 'Нужно число — рублей за сутки (или 0, чтобы вернуть базовую цену):'); return; }
    $n = (int)($raw === '' ? '0' : $raw);
    set_price_dates($p['id'], $p['dates'], $n);
    $cnt = count($p['dates']);
    pending_del($chatId);
    if ($n === 0) tg_send($chatId, "♻️ На $cnt дат(ы) «{$house['name']}» вернулась базовая цена <b>" . fmt_money(get_price($p['id'])) . " ₽/сутки</b>.", ['reply_markup' => menu_kb()]);
    else tg_send($chatId, "✅ На $cnt дат(ы) «{$house['name']}» установлена цена <b>" . fmt_money($n) . " ₽/сутки</b>.", ['reply_markup' => menu_kb()]);
    return;
  }
}

function on_busy_input($chatId, $house, $p, $text) {
  $r = parse_date_entries($text);
  if (!count($r['dates'])) { tg_send($chatId, "Не удалось распознать даты" . (count($r['bad']) ? " (" . implode(', ', $r['bad']) . ")" : '') . ".\n\n" . DATE_HELP); return; }
  $occupy = ($p['mode'] ?? '') === 'occupy';
  set_busy_dates($p['id'], $r['dates'], $occupy);
  pending_del($chatId);
  $out = "Дом «{$house['name']}».\n";
  $out .= $occupy ? "🔴 Занято дат: +" . count($r['dates']) . "\n" : "🟢 Освобождено дат: " . count($r['dates']) . "\n";
  if (count($r['bad'])) $out .= "Не распознано: " . implode(', ', $r['bad']) . "\n";
  $out .= "\nТекущая занятость: <b>" . busy_info($p['id']) . "</b>";
  tg_send($chatId, $out, ['reply_markup' => menu_kb()]);
}

function on_callback($cq) {
  $chatId = $cq['message']['chat']['id'];
  $data = $cq['data'] ?? '';
  tg_answer($cq['id']);
  if (!is_admin($chatId)) return;

  if ($data === 'menu:main')     { pending_del($chatId); tg_send($chatId, MENU_TEXT, ['reply_markup' => menu_kb()]); return; }
  if ($data === 'menu:price')    { pending_del($chatId); tg_send($chatId, 'Шаг 1. Выберите дом, цену которого меняем:', ['reply_markup' => houses_kb('price')]); return; }
  if ($data === 'menu:busy')     { pending_del($chatId); tg_send($chatId, 'Шаг 1. Выберите дом для управления занятостью:', ['reply_markup' => houses_kb('busy')]); return; }
  if ($data === 'menu:overview') { pending_del($chatId); tg_send($chatId, overview_text(), ['reply_markup' => overview_kb()]); return; }

  if ($data === 'busyall:ask') {
    pending_del($chatId);
    $total = 0;
    foreach (HOUSES as $h) $total += count(get_busy($h['id']));
    tg_send($chatId,
      "⚠️ <b>Внимание!</b>\n\nСейчас будет снята <b>вся занятость по всем домам</b> — сразу освободятся все занятые даты " .
      "(сейчас занято дней всего: <b>$total</b>). Это действие <b>нельзя отменить</b>.\n\nТочно продолжить?",
      ['reply_markup' => confirm_reset_all_kb()]);
    return;
  }
  if ($data === 'busyall:yes') {
    pending_del($chatId);
    $cleared = 0;
    foreach (HOUSES as $h) { $b = get_busy($h['id']); if (count($b)) { set_busy_dates($h['id'], $b, false); $cleared += count($b); } }
    tg_send($chatId, "🧹 Готово. Снята вся занятость по всем домам (освобождено дней: <b>$cleared</b>). Все даты свободны.", ['reply_markup' => menu_kb()]);
    return;
  }

  $parts = explode(':', $data);
  $kind = $parts[0];

  if ($kind === 'price') {
    $house = get_house($parts[1] ?? null);
    if (!$house) return;
    pending_del($chatId);
    tg_send($chatId,
      "Дом «{$house['name']}».\nБазовая цена: <b>" . fmt_money(get_price($house['id'])) . " ₽/сутки</b>.\n" .
      "Спеццены: " . price_dates_info($house['id']) . "\n\nШаг 2. Что настраиваем?",
      ['reply_markup' => price_mode_kb($house['id'])]);
    return;
  }

  if ($kind === 'busy') {
    $house = get_house($parts[1] ?? null);
    if (!$house) return;
    pending_del($chatId);
    tg_send($chatId,
      "Дом «{$house['name']}».\nЗанятость сейчас: <b>" . busy_info($house['id']) . "</b>.\n\nШаг 2. Занять или освободить даты?",
      ['reply_markup' => busy_mode_kb($house['id'])]);
    return;
  }

  if ($kind === 'pm') {
    $mode = $parts[1] ?? ''; $id = $parts[2] ?? '';
    $house = get_house($id);
    if (!$house) return;
    if ($mode === 'base') {
      pending_set($chatId, ['action' => 'price', 'mode' => 'base', 'id' => $id]);
      tg_send($chatId, "Шаг 3. «{$house['name']}» — базовая цена сейчас <b>" . fmt_money(get_price($id)) . " ₽</b>.\nПришлите новую цену за сутки (число в рублях):");
      return;
    }
    if ($mode === 'dates') {
      pending_set($chatId, ['action' => 'price', 'mode' => 'dates', 'id' => $id, 'step' => 'dates']);
      tg_send($chatId, "Шаг 2 из 3. «{$house['name']}» — на какие даты меняем цену?\n\n" . DATE_HELP);
      return;
    }
    if ($mode === 'month') {
      pending_set($chatId, ['action' => 'price', 'mode' => 'month', 'id' => $id, 'step' => 'month']);
      tg_send($chatId, "Шаг 2 из 3. «{$house['name']}» — цена на какой месяц?\n\n" . MONTH_HELP);
      return;
    }
    if ($mode === 'clear') {
      clear_price_dates($id);
      pending_del($chatId);
      tg_send($chatId, "♻️ Все спеццены «{$house['name']}» сброшены — везде базовая цена <b>" . fmt_money(get_price($id)) . " ₽/сутки</b>.", ['reply_markup' => menu_kb()]);
      return;
    }
  }

  if ($kind === 'bm') {
    $mode = $parts[1] ?? ''; $id = $parts[2] ?? '';
    $house = get_house($id);
    if (!$house) return;
    if ($mode === 'clear') {
      $all = get_busy($id);
      if (count($all)) set_busy_dates($id, $all, false);
      pending_del($chatId);
      tg_send($chatId, "🧹 Вся занятость «{$house['name']}» снята — все даты свободны.", ['reply_markup' => busy_mode_kb($id)]);
      return;
    }
    pending_set($chatId, ['action' => 'busy', 'mode' => $mode, 'id' => $id]);
    $verb = $mode === 'occupy' ? 'занять' : 'освободить';
    tg_send($chatId, "Шаг 3. «{$house['name']}» — какие даты $verb?\n\n" . DATE_HELP);
    return;
  }
}
