const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MapStore } = require('../src/mapStore.js');

const REAL_MAP = path.join(__dirname, '..', 'public', 'quan5-map.json');

test('mapStore: bản đồ thật tải được, số lượng đúng như bản đã giao', () => {
  const store = new MapStore(REAL_MAP);
  const summary = store.summary();
  assert.equal(summary.roads, 1913);
  assert.equal(summary.buildings, 474);
  assert.equal(summary.landmarks, 11);
  const map = store.getMap();
  const first = map.buildings[0];
  const found = store.findHouse(first.id);
  assert.ok(found);
  assert.equal(found.price, require('../public/js/shared-core.js').housePrice(first, map.origin.scale_units_per_meter));
  assert.equal(store.findHouse('h999.000001_10.000001'), null);
  assert.ok(store.findLandmark('Chợ An Đông'));
  assert.equal(store.findLandmark('Không có chỗ này'), null);
});

test('mapStore: homeSpawn nằm trong ranh và ngoài nhà', () => {
  const store = new MapStore(REAL_MAP);
  const map = store.getMap();
  const house = map.buildings.find((b) => b.hw > 0.5 && b.hd > 0.5);
  const spawn = store.homeSpawn(house);
  const S = require('../public/js/shared-core.js');
  assert.equal(S.pointInPoly(spawn.x, spawn.z, map.boundary), true);
  assert.ok(S.boxDistance(spawn.x, spawn.z, house) >= 1.9);
});

test('mapStore: file bản đồ hỏng sau khi đã cache thì giữ bản cũ, không sập', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-map-'));
  const mapPath = path.join(dir, 'quan5-map.json');
  fs.copyFileSync(REAL_MAP, mapPath);
  const store = new MapStore(mapPath);
  const first = store.summary();
  assert.equal(first.buildings, 474);
  fs.writeFileSync(mapPath, '{ hỏng');
  // Đổi mtime bằng cách chạm file sau khi ghi hỏng, để store phải thử tải lại.
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(mapPath, later, later);
  const second = store.summary();
  assert.equal(second.buildings, 474);
});
