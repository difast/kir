<?php
// Разбор дат в свободном формате «день месяц год» (порт из server/store.js).
// Используется админ-командами бота (цены/занятость) и расчётами.

/** Любой формат даты -> 'YYYY-MM-DD' или null. Порядок ввода: день месяц год. */
function normalize_date($input) {
  if ($input === null) return null;
  $parts = preg_split('/[^\d]+/', trim((string)$input), -1, PREG_SPLIT_NO_EMPTY);
  if (count($parts) === 1 && preg_match('/^\d{6,8}$/', $parts[0])) {
    $d = $parts[0];
    $parts = strlen($d) === 8
      ? [substr($d, 0, 2), substr($d, 2, 2), substr($d, 4, 4)]
      : [substr($d, 0, 2), substr($d, 2, 2), substr($d, 4, 2)];
  }
  if (count($parts) !== 3) return null;
  if (strlen($parts[0]) === 4) {           // YYYY M D
    $Y = (int)$parts[0]; $M = (int)$parts[1]; $D = (int)$parts[2];
  } else {                                  // D M (YY)YY
    $D = (int)$parts[0]; $M = (int)$parts[1]; $Y = (int)$parts[2];
    if ($Y < 100) $Y += 2000;
  }
  if ($M > 12 && $D <= 12) { $t = $D; $D = $M; $M = $t; }   // подстраховка
  if (!($Y >= 2020 && $Y <= 2100 && $M >= 1 && $M <= 12 && $D >= 1 && $D <= 31)) return null;
  if (!checkdate($M, $D, $Y)) return null;
  return sprintf('%04d-%02d-%02d', $Y, $M, $D);
}

/** Диапазон 'YYYY-MM-DD'..'YYYY-MM-DD' (включительно) в список дат */
function range_dates($a, $b) {
  $s = strtotime($a . ' UTC');
  $e = strtotime($b . ' UTC');
  if ($e < $s) { $t = $s; $s = $e; $e = $t; }
  $out = [];
  for ($t = $s; $t <= $e; $t += 86400) $out[] = gmdate('Y-m-d', $t);
  return $out;
}

/**
 * Разбор сообщения с датами. Поддерживает несколько дат через запятую/;/перенос строки,
 * одну дату в любом формате и диапазон (10.08.2026 - 20.08.2026 / «по» / «..»).
 * @return array{dates: string[], bad: string[]}
 */
function parse_date_entries($text) {
  $dates = [];
  $bad = [];
  $entries = preg_split('/[\n,;]+/', (string)$text, -1, PREG_SPLIT_NO_EMPTY);
  $rangeSep = '/\s*\.\.\s*|\s*—\s*|\s*–\s*|\s+по\s+|\s+до\s+|\s+-\s+/u';
  foreach ($entries as $e) {
    $e = trim($e);
    if ($e === '') continue;
    $m = preg_split($rangeSep, $e, -1, PREG_SPLIT_NO_EMPTY);
    $m = array_values(array_filter(array_map('trim', $m), fn($x) => $x !== ''));
    if (count($m) === 2) {
      $a = normalize_date($m[0]);
      $b = normalize_date($m[1]);
      if ($a && $b) { foreach (range_dates($a, $b) as $d) $dates[] = $d; continue; }
    }
    $d = normalize_date($e);
    if ($d) $dates[] = $d; else $bad[] = $e;
  }
  return ['dates' => array_values(array_unique($dates)), 'bad' => $bad];
}

/** Все даты месяца: вход '08 2026' / '08.2026' / '2026-08' -> список дат или null */
function month_dates($text) {
  $parts = preg_split('/[^\d]+/', trim((string)$text), -1, PREG_SPLIT_NO_EMPTY);
  if (count($parts) < 2) return null;
  if (strlen($parts[0]) === 4) { $Y = (int)$parts[0]; $M = (int)$parts[1]; }
  else { $M = (int)$parts[0]; $Y = (int)$parts[1]; }
  if ($Y < 100) $Y += 2000;
  if (!($M >= 1 && $M <= 12 && $Y >= 2020 && $Y <= 2100)) return null;
  $days = (int)gmdate('t', gmmktime(0, 0, 0, $M, 1, $Y));
  $out = [];
  for ($d = 1; $d <= $days; $d++) $out[] = sprintf('%04d-%02d-%02d', $Y, $M, $d);
  return $out;
}
