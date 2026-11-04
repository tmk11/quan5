const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/js/shared-core.js');

test('roadWidth: tỉ lệ đúng, sàn và trần đúng', () => {
  assert.equal(S.roadWidthFromMeters(16), 4.0);
  assert.equal(S.roadWidthFromMeters(8), 2.0);
  assert.equal(S.roadWidthFromMeters(5), 1.8);
  assert.equal(S.roadWidthFromMeters(3), 1.8);
  assert.equal(S.roadWidthFromMeters(30), 5.0);
  assert.equal(S.roadWidthFromMeters(undefined), 1.8);
});

test('housePrice: nhà nhỏ, nhà lớn, trần giá', () => {
  assert.equal(S.housePrice({ hw: 0.2, hd: 0.5 }, 280 / 4018), 45000);
  assert.equal(S.housePrice({ hw: 5, hd: 3 }, 280 / 4018), 1000000);
  assert.equal(S.sellRefund(45000), 36000);
  assert.equal(S.sellRefund(100000), 80000);
});

test('validateRoomCode: chấp nhận và từ chối đúng', () => {
  assert.equal(S.validateRoomCode('quan5').value, 'QUAN5');
  assert.equal(S.validateRoomCode('').ok, false);
  assert.equal(S.validateRoomCode('a b').ok, false);
  assert.equal(S.validateRoomCode('ABCDEFGHIJKLM').ok, false);
  assert.equal(S.validateRoomCode(null).ok, false);
});

test('validatePlayerName: chặn HTML và ký tự điều khiển', () => {
  assert.equal(S.validatePlayerName('Boss').ok, true);
  assert.equal(S.validatePlayerName('   ').ok, false);
  assert.equal(S.validatePlayerName('<img>').ok, false);
  assert.equal(S.validatePlayerName('a'.repeat(25)).ok, false);
  assert.equal(S.validatePlayerName('a\tb').ok, false);
});

test('validateDeviceId: chặn __proto__ và constructor', () => {
  assert.equal(S.validateDeviceId('dev-abc123').ok, true);
  assert.equal(S.validateDeviceId('__proto__').ok, false);
  assert.equal(S.validateDeviceId('constructor').ok, false);
  assert.equal(S.validateDeviceId('').ok, false);
  assert.equal(S.validateDeviceId('a b').ok, false);
});

test('validateHouseId: đúng định dạng h<lon>_<lat>', () => {
  assert.equal(S.validateHouseId('h106.667876_10.755658').ok, true);
  assert.equal(S.validateHouseId('h106.667876_10.755658_2').ok, true);
  assert.equal(S.validateHouseId('abc').ok, false);
  assert.equal(S.validateHouseId('__proto__').ok, false);
});

test('validateActionType và validateBuoiValue', () => {
  assert.equal(S.validateActionType('chao').value, 'chao');
  assert.equal(S.validateActionType('chào').value, 'chao');
  assert.equal(S.validateActionType('không có').ok, false);
  assert.equal(S.validateBuoiValue('đêm').value, 'dem');
  assert.equal(S.validateBuoiValue('trưa').ok, false);
});

test('geometry: pointInPoly, distToSeg, boxDistance', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(S.pointInPoly(5, 5, square), true);
  assert.equal(S.pointInPoly(20, 5, square), false);
  assert.equal(S.distToSeg(5, 3, 0, 0, 10, 0).d, 3);
  assert.equal(S.boxDistance(5, 0, { x: 0, z: 0, hw: 1, hd: 1, rot: 0 }), 4);
  assert.equal(S.boxDistance(0.5, 0.5, { x: 0, z: 0, hw: 1, hd: 1, rot: 0 }), 0);
});

test('escapeHtml: chặn thẻ script và img onerror', () => {
  assert.equal(S.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(S.escapeHtml('a & b'), 'a &amp; b');
});

test('validateMap: bản đồ hợp lệ qua, bản đồ hỏng liệt kê lỗi cụ thể', () => {
  const good = {
    origin: { scale_units_per_meter: 280 / 4018 },
    boundary: [[0, 0], [10, 0], [10, 10]],
    roads: [{ pts: [[0, 0], [1, 1]], width_m: 8 }],
    buildings: [{ id: 'h106.000001_10.000001', x: 0, z: 0, hw: 1, hd: 1, h: 3 }],
    landmarks: [{ name: 'Chợ An Đông', x: 0, z: 0 }],
    waters: [], parks: []
  };
  assert.equal(S.validateMap(good).ok, true);
  const bad = { origin: {}, boundary: [], roads: [], buildings: [{ id: 'x', x: 0 }], landmarks: [] };
  const result = S.validateMap(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3);
});

test('validateEconomy: ví âm tiền và sổ nhà thiếu owner bị bắt', () => {
  assert.equal(S.validateEconomy({ players: {}, houses: {} }).ok, true);
  assert.equal(S.validateEconomy({ players: { a: { tien: -1, home: null } }, houses: {} }).ok, false);
  assert.equal(S.validateEconomy({ players: {}, houses: { h1: { owner: '', price: 100 } } }).ok, false);
  // Lưu ý: object literal { '__proto__': ... } không tạo own property trong
  // JS, nhưng JSON.parse (đường load file thật) thì có. Test phải dùng
  // JSON.parse để mô phỏng đúng dữ liệu từ đĩa.
  var fromJson = JSON.parse('{"players":{"__proto__":{"tien":0,"home":null}},"houses":{}}');
  assert.equal(Object.keys(fromJson.players).includes('__proto__'), true);
  assert.equal(S.validateEconomy(fromJson).ok, false);
});
