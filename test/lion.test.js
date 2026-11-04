// Test Đoàn Lân (v1.5): xây tuyến chỉ theo đường lớn, vòng đời xuất
// hiện → rơi lì xì → rời đi, nhặt (ai tới trước thì được, đã nhặt thì
// biến mất), và giá trị lì xì 3.000–10.000đ bước 1.000đ.
// Chạy bằng: node --test test/lion.test.js (hoặc npm test).
const test = require('node:test');
const assert = require('node:assert/strict');
const Lion = require('../src/lion.js');
const S = require('../public/js/shared-core.js');

function fakeRoom() {
  const room = {
    code: 'TEST',
    players: new Map(),
    events: [],
    lion: null,
    claimedEnvelopes: Object.create(null)
  };
  const roomStore = { pushEvent(r, ev) { r.events.push(Object.assign({ at: Date.now() }, ev)); } };
  return { room, roomStore };
}

const chainMap = {
  roads: [
    { major: true, pts: [[0, 0], [10, 0]] },
    { major: true, pts: [[10, 0], [20, 0]] },
    { major: true, pts: [[20, 0], [30, 0]] },
    { major: false, pts: [[0, 0], [0, 10]] }
  ]
};

test('lion: tuyến chỉ nối đường lớn có chung đầu mút, dừng khi cụt đường', () => {
  const route = Lion.buildRoute(chainMap, () => 0);
  assert.deepEqual(route, [[0, 0], [10, 0], [20, 0], [30, 0]]);
  assert.equal(S.routeLength(route), 30);
  assert.equal(Lion.buildRoute({ roads: [{ major: false, pts: [[0, 0], [1, 0]] }] }), null);
  assert.equal(Lion.buildRoute({ roads: [] }), null);
});

test('lion: rơi lì xì mỗi 5 giây, hết hạn sau 20 giây, rời đi khi hết tuyến', () => {
  const { room, roomStore } = fakeRoom();
  // Tuyến dài 100 đơn vị (33,3 giây) để Lân còn đang đi ở cả 6s và 26s.
  room.lion = { route: [[0, 0], [100, 0]], seed: 'TEST-1', spawnedAt: 1000000, departed: false };
  // 6 giây sau xuất hiện: Lân ở (18, 0), chỉ đợt 0 (rơi lúc 5s) đã rơi,
  // hết hạn lúc 5+20=25s nên còn sống.
  let st = Lion.computeLionState(room, 1006000);
  assert.deepEqual(st.lion, { x: 18, z: 0 });
  assert.ok(st.envelopes.length >= 1 && st.envelopes.length <= 3);
  assert.equal(st.envelopes[0].expiresAt, 1000000 + 5000 + 20000);
  // 26 giây: đợt 0 đã hết hạn, đợt 1–4 (rơi lúc 10, 15, 20, 25s) còn sống.
  st = Lion.computeLionState(room, 1026000);
  assert.ok(st.envelopes.length >= 4 && st.envelopes.length <= 12);
  assert.ok(st.envelopes.every((e) => e.expiresAt > 1026000));
  // Tuyến ngắn 30 đơn vị (10 giây) thì hết ở 10s: lúc 11 giây Lân đã
  // rời (compute trả lion null) nhưng lì xì đợt 0 (rơi 5s, hết hạn 25s)
  // và đợt 1 (rơi 10s, hết hạn 30s) vẫn còn trên đường cho tới khi hết
  // hạn; lifecycle đẩy đúng một thông báo rời đi, lần gọi sau không
  // đẩy trùng, và chỉ xóa hẳn Lân khi không còn lì xì nào.
  const short = fakeRoom();
  short.room.lion = { route: [[0, 0], [30, 0]], seed: 'TEST-1', spawnedAt: 1000000, departed: false };
  assert.equal(Lion.computeLionState(short.room, 1011000).lion, null);
  assert.ok(Lion.computeLionState(short.room, 1011000).envelopes.length >= 2);
  Lion.updateLionLifecycle(short.room, 1011000, short.roomStore);
  assert.equal(short.room.lion.departed, true);
  assert.equal(short.room.events.filter((e) => e.message.indexOf('đã rời đi') !== -1).length, 1);
  Lion.updateLionLifecycle(short.room, 1012000, short.roomStore);
  assert.equal(short.room.events.filter((e) => e.message.indexOf('đã rời đi') !== -1).length, 1);
  assert.ok(short.room.lion);
  Lion.updateLionLifecycle(short.room, 1031000, short.roomStore);
  assert.equal(short.room.lion, null);
});

test('lion: nhặt trong 3 đơn vị, đã nhặt thì không còn trong state', () => {
  const { room } = fakeRoom();
  room.lion = { route: [[0, 0], [30, 0]], seed: 'TEST-1', spawnedAt: 1000000, departed: false };
  const st = Lion.computeLionState(room, 1006000);
  const env = st.envelopes[0];
  assert.ok(Lion.findPickupEnvelope(room, env.x, env.z, 1006000));
  assert.equal(Lion.findPickupEnvelope(room, env.x + 10, env.z, 1006000), null);
  room.claimedEnvelopes[env.id] = true;
  assert.ok(!Lion.computeLionState(room, 1006000).envelopes.some((e) => e.id === env.id));
  // Đứng đúng chỗ lì xì vừa nhặt thì không nhặt lại chính nó nữa, nhưng
  // vẫn có thể nhặt cái khác cùng đợt rơi (các lì xì rơi chụm quanh Lân
  // trong ±1,5 đơn vị nên thường nằm trong 3 đơn vị của nhau) — đó là
  // đúng, người chơi nhặt từng cái một mỗi tick, không phải lỗi.
  const after = Lion.findPickupEnvelope(room, env.x, env.z, 1006000);
  assert.ok(!after || after.id !== env.id);
});

test('lion: giá trị lì xì 3.000–10.000đ, bước 1.000đ', () => {
  assert.equal(Lion.rollEnvelopeValue(() => 0), 3000);
  assert.equal(Lion.rollEnvelopeValue(() => 0.999), 10000);
  assert.equal(Lion.rollEnvelopeValue(() => 0.5), 7000);
  for (let i = 0; i < 100; i++) {
    const v = Lion.rollEnvelopeValue();
    assert.ok(v >= 3000 && v <= 10000 && v % 1000 === 0);
  }
});
