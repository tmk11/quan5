const test = require('node:test');
const assert = require('node:assert/strict');
const { RateLimiter } = require('../src/rateLimit.js');

test('rateLimit: cooldown chặn hành động thứ hai trong 1 giây', () => {
  const limiter = new RateLimiter(60000, 60);
  limiter.checkAction('player-1');
  assert.throws(() => limiter.checkAction('player-1'), (e) => e.status === 429);
  limiter.checkAction('player-2');
});

test('rateLimit: quá 60 hành động trong 1 phút thì chặn', () => {
  const limiter = new RateLimiter(60000, 3);
  // Bỏ qua cooldown bằng cách dùng key khác cho mỗi lần, chỉ test rate.
  limiter.checkRate('a');
  limiter.checkRate('a');
  limiter.checkRate('a');
  assert.throws(() => limiter.checkRate('a'), (e) => e.status === 429);
});
