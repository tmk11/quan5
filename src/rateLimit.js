// Giới hạn tần suất đơn giản, chỉ dùng bộ nhớ, không cần database.
// Mỗi key (playerId) giữ danh sách thời gian gọi trong cửa sổ gần nhất.
// Khi gọi quá giới hạn, check() trả về { allowed: false, retryAfterMs }.
// Lớp này tự dọn các key đã hết hạn để không phình bộ nhớ vô hạn.
const S = require('../public/js/shared-core.js');
const { rateLimited } = require('./errors.js');

class RateLimiter {
  constructor(windowMs, maxCalls) {
    this.windowMs = windowMs;
    this.maxCalls = maxCalls;
    this.callsByKey = new Map();
    this.cooldownByKey = new Map();
    this.lastCleanupAt = Date.now();
  }

  cleanupIfNeeded(now) {
    if (now - this.lastCleanupAt < this.windowMs) {
      return;
    }
    this.lastCleanupAt = now;
    for (const [key, times] of this.callsByKey) {
      const fresh = times.filter((t) => now - t < this.windowMs);
      if (fresh.length === 0) {
        this.callsByKey.delete(key);
      } else {
        this.callsByKey.set(key, fresh);
      }
    }
    for (const [key, at] of this.cooldownByKey) {
      if (now - at >= S.ACTION_COOLDOWN_MS) {
        this.cooldownByKey.delete(key);
      }
    }
  }

  // Cooldown giữa hai hành động liên tiếp của cùng một người chơi.
  checkCooldown(key) {
    const now = Date.now();
    this.cleanupIfNeeded(now);
    const last = this.cooldownByKey.get(key);
    if (last !== undefined && now - last < S.ACTION_COOLDOWN_MS) {
      throw rateLimited(
        'Thao tác quá nhanh, vui lòng chờ ' +
        Math.ceil((S.ACTION_COOLDOWN_MS - (now - last)) / 1000) +
        ' giây rồi thử lại.'
      );
    }
    this.cooldownByKey.set(key, now);
  }

  // Giới hạn tổng số hành động trong một cửa sổ thời gian.
  checkRate(key) {
    const now = Date.now();
    this.cleanupIfNeeded(now);
    const times = this.callsByKey.get(key) || [];
    const fresh = times.filter((t) => now - t < this.windowMs);
    if (fresh.length >= this.maxCalls) {
      const oldest = Math.min.apply(null, fresh);
      const retryAfterMs = this.windowMs - (now - oldest);
      throw rateLimited(
        'Bạn đã thao tác quá nhiều trong 1 phút, vui lòng chờ ' +
        Math.ceil(retryAfterMs / 1000) + ' giây rồi thử lại.'
      );
    }
    fresh.push(now);
    this.callsByKey.set(key, fresh);
  }

  checkAction(key) {
    this.checkCooldown(key);
    this.checkRate(key);
  }
}

module.exports = { RateLimiter };
