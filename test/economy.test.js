const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EconomyStore } = require('../src/economyStore.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-econ-'));
}

test('economy: lưu và tải lại đúng tiền và nhà, backup được xoay', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  const rec = store.getOrCreatePlayer('dev-test-1', 'Boss').record;
  rec.tien = 55000;
  rec.home = 'h106.000001_10.000001';
  store.houses['h106.000001_10.000001'] = { owner: 'dev-test-1', ownerName: 'Boss', price: 45000 };
  store.save();
  assert.equal(fs.existsSync(path.join(dir, 'economy.json')), true);
  const store2 = new EconomyStore(path.join(dir, 'economy.json'));
  store2.load();
  assert.equal(store2.players['dev-test-1'].tien, 55000);
  assert.equal(store2.players['dev-test-1'].home, 'h106.000001_10.000001');
  assert.equal(store2.houses['h106.000001_10.000001'].price, 45000);
  // Lưu lần hai phải tạo backup của lần một.
  store2.players['dev-test-1'].tien = 60000;
  store2.save();
  assert.equal(fs.existsSync(path.join(dir, 'economy.json.bak')), true);
  const bak = JSON.parse(fs.readFileSync(path.join(dir, 'economy.json.bak'), 'utf8'));
  assert.equal(bak.players['dev-test-1'].tien, 55000);
});

test('economy: snapshot và restore rollback được giao dịch thất bại', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  const rec = store.getOrCreatePlayer('dev-test-2', 'Boss').record;
  rec.tien = 100000;
  store.save();
  const snap = store.snapshot();
  rec.tien -= 45000;
  store.houses['h106.000002_10.000002'] = { owner: 'dev-test-2', ownerName: 'Boss', price: 45000 };
  store.restore(snap);
  assert.equal(store.players['dev-test-2'].tien, 100000);
  assert.equal(store.houses['h106.000002_10.000002'], undefined);
});

test('economy: file hỏng thì khôi phục từ backup, không âm thầm trống', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  store.getOrCreatePlayer('dev-test-3', 'Boss');
  store.save();
  fs.copyFileSync(path.join(dir, 'economy.json'), path.join(dir, 'economy.json.bak'));
  fs.writeFileSync(path.join(dir, 'economy.json'), '{ hỏng json');
  const store2 = new EconomyStore(path.join(dir, 'economy.json'));
  const summary = store2.load();
  assert.equal(summary.restoredFromBackup, true);
  assert.equal(store2.players['dev-test-3'].tien, 100000);
});

test('economy: file hỏng và backup cũng hỏng thì fail nhanh, không trống', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  fs.writeFileSync(path.join(dir, 'economy.json'), '{ hỏng');
  fs.writeFileSync(path.join(dir, 'economy.json.bak'), '{ hỏng luôn');
  assert.throws(() => store.load(), (e) => e.code === 'ECONOMY_CORRUPT');
  assert.equal(Object.keys(store.players).length, 0);
});

test('economy: cleanupOrphans chỉ chạy khi bản đồ đổi, hoàn đủ tiền', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  const rec = store.getOrCreatePlayer('dev-test-4', 'Boss').record;
  rec.tien = 55000;
  rec.home = 'h106.000003_10.000003';
  store.houses['h106.000003_10.000003'] = { owner: 'dev-test-4', ownerName: 'Boss', price: 45000 };
  store.save();
  const map = { buildings: [{ id: 'h106.000004_10.000004' }] };
  const result1 = store.cleanupOrphans(map, 12345);
  assert.equal(result1.changed, true);
  assert.equal(result1.refunded.length, 1);
  assert.equal(result1.refunded[0].amount, 45000);
  assert.equal(store.players['dev-test-4'].tien, 100000);
  assert.equal(store.players['dev-test-4'].home, null);
  assert.equal(store.houses['h106.000003_10.000003'], undefined);
  const result2 = store.cleanupOrphans(map, 12345);
  assert.equal(result2.changed, false);
});

test('economy v1.4: snapshot/restore gồm cả mốc cooldown doanh thu', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  store.incomeCooldown['dev-a:h1'] = 100000;
  const snap = store.snapshot();
  store.incomeCooldown['dev-a:h1'] = 200000;
  store.incomeCooldown['dev-b:h2'] = 300000;
  store.restore(snap);
  assert.equal(store.incomeCooldown['dev-a:h1'], 100000);
  assert.equal(store.incomeCooldown['dev-b:h2'], undefined);
});

test('economy v1.4: lưu dọn mốc cooldown hết hạn, giữ mốc còn hạn', () => {
  const dir = tmpDir();
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  const now = Date.now();
  store.incomeCooldown['dev-a:h1'] = now - 120000;
  store.incomeCooldown['dev-b:h2'] = now;
  store.save();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'economy.json'), 'utf8'));
  assert.equal(saved.incomeCooldown['dev-a:h1'], undefined);
  assert.equal(saved.incomeCooldown['dev-b:h2'], now);
});

test('economy v1.4: tải sổ nhà cũ (chưa có shopType/paid) thì chuẩn hóa', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'economy.json'), JSON.stringify({
    players: { 'dev-old': { tien: 58000, home: 'h106.000005_10.000005', name: 'ChuCu' } },
    houses: { 'h106.000005_10.000005': { owner: 'dev-old', ownerName: 'ChuCu', price: 42000 } }
  }));
  const store = new EconomyStore(path.join(dir, 'economy.json'));
  store.load();
  const h = store.houses['h106.000005_10.000005'];
  assert.equal(h.shopType, null);
  assert.equal(h.paid, 42000);
});
