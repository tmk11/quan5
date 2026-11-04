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

test('shophouse v1.4: giá mua lại, tiền lời chủ cũ, đốt 10%', () => {
  assert.equal(S.takeoverPrice(42000), 53000);
  assert.equal(S.takeoverPrice(56000), 70000);
  assert.equal(S.takeoverPayout(42000), 48000);
  // 56.000đ × 1,15 = 64.400đ, làm tròn về nghìn thành 64.000đ.
  assert.equal(S.takeoverPayout(56000), 64000);
  // Mua lại 42.000đ: người mua trả 53.000đ, chủ cũ nhận 48.000đ, đốt 5.000đ
  // (10% lý thuyết là 4.200đ, chênh 800đ do làm tròn về nghìn hai đầu).
  assert.equal(S.takeoverPrice(42000) - S.takeoverPayout(42000), 5000);
});

test('shophouse v1.4: biển hiệu và fallback quán khi chưa chọn', () => {
  assert.equal(S.shopLabel('vitquay'), '🦆 Tiệm Vịt Quay');
  assert.equal(S.shopLabel('che'), '🥣 Quán Chè Chợ Lớn');
  assert.equal(S.shopLabel('tiemvang'), '🪙 Tiệm Vàng');
  assert.equal(S.shopLabel('thuocbac'), '🌿 Tiệm Thuốc Bắc');
  assert.equal(S.shopLabel(null), 'quán');
  assert.equal(S.shopLabel('pho'), 'quán');
  assert.equal(S.validateShopType('vitquay').ok, true);
  assert.equal(S.validateShopType('pho').ok, false);
  assert.equal(S.validateShopType(null).ok, false);
});

test('shophouse v1.4: cooldown doanh thu 60 giây / khách / nhà', () => {
  assert.equal(S.canGrantShopIncome(undefined, 100000), true);
  assert.equal(S.canGrantShopIncome(100000, 130000), false);
  assert.equal(S.canGrantShopIncome(100000, 159999), false);
  assert.equal(S.canGrantShopIncome(100000, 160000), true);
  assert.deepEqual(S.SHOP_INCOME_ACTIONS, ['an', 'cafe', 'muasam']);
  assert.equal(S.SHOP_INCOME, 2000);
  assert.equal(S.SHOP_BUFF_MS, 30000);
});

test('shophouse v1.4: bảng Top Địa Chủ chỉ tính người trong phòng, hòa thì tên trước', () => {
  const room = [
    { deviceId: 'd1', name: 'ChuQuan' },
    { deviceId: 'd2', name: 'KhachGhe' },
    { deviceId: 'd3', name: 'NguoiMuaLai' }
  ];
  const players = { d1: { tien: 108000 }, d2: { tien: 100000 }, d3: { tien: 47000 } };
  const houses = {
    h1: { owner: 'd3', price: 53000 },
    // d4 giàu nhất thành phố (999.000đ nhà) nhưng không trong phòng.
    h2: { owner: 'd4', price: 999000 }
  };
  const top = S.rankLandlords(room, players, houses);
  assert.equal(top.length, 3);
  assert.equal(top[0].name, 'ChuQuan');
  assert.equal(top[0].wealth, 108000);
  // d2 và d3 cùng 100.000đ, tên KhachGhe trước NguoiMuaLai.
  assert.equal(top[1].name, 'KhachGhe');
  assert.equal(top[2].name, 'NguoiMuaLai');
  assert.equal(top[2].houseCount, 1);
  // d4 giàu nhất thành phố nhưng không trong phòng thì không lên bảng.
  assert.equal(top.some((r) => r.name === 'NguoiNgoai'), false);
  // Top 5: 6 người trong phòng thì chỉ lấy 5.
  const many = Array.from({ length: 6 }, (_, i) => ({ deviceId: 'x' + i, name: 'P' + i }));
  const manyPlayers = {};
  many.forEach((p, i) => { manyPlayers[p.deviceId] = { tien: (6 - i) * 1000 }; });
  assert.equal(S.rankLandlords(many, manyPlayers, {}).length, 5);
});

test('shipper: đổi đơn vị mét/game và thưởng theo quãng đường', () => {
  // 150m ≈ 10,45 đơn vị, 400m ≈ 27,88 đơn vị (SCALE 280/4018).
  assert.ok(Math.abs(S.metersToUnits(150) - 10.45) < 0.1);
  assert.ok(Math.abs(S.metersToUnits(400) - 27.88) < 0.1);
  assert.ok(Math.abs(S.unitsToMeters(S.metersToUnits(250)) - 250) < 0.01);
  // Thưởng: 300m → 8.000đ, 800m → 15.000đ, giữa làm tròn về nghìn
  // (550m: 11.500 → 12.000đ vì Math.round làm tròn nửa lên; 400m:
  // 9.400 → 9.000đ), ngắn hơn 300m vẫn 8.000đ, dài hơn 800m vẫn 15.000đ.
  assert.equal(S.shipperReward(300), 8000);
  assert.equal(S.shipperReward(800), 15000);
  assert.equal(S.shipperReward(550), 12000);
  assert.equal(S.shipperReward(400), 9000);
  assert.equal(S.shipperReward(150), 8000);
  assert.equal(S.shipperReward(1200), 15000);
});

test('lion: vị trí dọc tuyến, độ dài tuyến, lì xì xác định theo seed', () => {
  const route = [[0, 0], [10, 0], [10, 10]];
  assert.equal(S.routeLength(route), 20);
  // Tốc độ 3 đơn vị/giây: 1 giây → (3, 0); 4 giây (12 đơn vị) → (10, 2).
  assert.deepEqual(S.lionPositionAt(route, 1000), { x: 3, z: 0 });
  assert.deepEqual(S.lionPositionAt(route, 4000), { x: 10, z: 2 });
  // Đi hết tuyến (20 đơn vị = 6.667 giây) thì null (Lân rời đi).
  assert.equal(S.lionPositionAt(route, 7000), null);
  assert.equal(S.lionPositionAt([[0, 0]], 1000), null);
  // Cùng seed + đợt rơi thì cùng số lượng và vị trí, khác đợt thì khác.
  const a = S.lionDropEnvelopes('R-1', 0, { x: 15, z: 0 });
  const b = S.lionDropEnvelopes('R-1', 0, { x: 15, z: 0 });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 3);
  a.forEach((e) => {
    assert.ok(Math.abs(e.x - 15) <= 1.5);
    assert.ok(Math.abs(e.z - 0) <= 1.5);
  });
  const c = S.lionDropEnvelopes('R-1', 1, { x: 15, z: 0 });
  assert.notDeepEqual(a.map((e) => e.id), c.map((e) => e.id));
});
