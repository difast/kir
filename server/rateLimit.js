'use strict';

/**
 * Простой in-memory rate-limit по IP: не больше N запросов в минуту.
 * Для одного инстанса на Railway/VPS этого достаточно.
 */
function createRateLimiter(perMin) {
  const limit = Number(perMin) > 0 ? Number(perMin) : 5;
  const windowMs = 60 * 1000;
  const hits = new Map(); // ip -> number[] (метки времени)

  // Периодически чистим старые записи, чтобы карта не росла бесконечно.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(ip, fresh);
      else hits.delete(ip);
    }
  }, windowMs);
  if (timer.unref) timer.unref();

  /** @returns {boolean} true — можно, false — превышен лимит */
  return function allow(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      hits.set(ip, arr);
      return false;
    }
    arr.push(now);
    hits.set(ip, arr);
    return true;
  };
}

module.exports = { createRateLimiter };
