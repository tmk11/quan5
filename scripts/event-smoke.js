// Test tích hợp Shipper + Đoàn Lân (v1.5): chạy server thật trong thư
// mục tạm (không chạm economy.json thật), rồi gọi API thật qua HTTP:
// nhận đơn (điểm lấy/giao trong 150–400m, thưởng 8–15k, hạn 60s) → tới
// điểm lấy (chuyển phase) → tới điểm giao (cộng tiền, feed) → hủy đơn
// → nhận đơn khi đang có đơn (lỗi) → Đoàn Lân xuất hiện theo chu kỳ
// ngắn (LION_INTERVAL_MS=5000 cho test, bản thật là 10 phút) → lì xì
// rơi sau 5s → nhặt lì xì (cộng 3–10k, lì xì biến mất, người khác không
// nhặt lại được) → state trả lion/envelopes gọn nhẹ (chỉ tọa độ).
// Chạy bằng: node scripts/event-smoke.js
// Thoát 0 khi mọi kiểm tra pass, thoát 1 và in rõ kiểm tra nào fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3997;
const BASE = 'http://127.0.0.1:' + PORT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('EVENT SMOKE FAIL: ' + msg);
  }
}
async function post(p, body) {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json };
}
async function get(p) {
  const res = await fetch(BASE + p);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: res.status, json, text };
}
async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await get('/api/health');
      if (r.status === 200 && r.json && r.json.ok) {
        return r.json;
      }
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('EVENT SMOKE FAIL: server không lên health trong 10 giây.');
}
async function joinAs(name, deviceId) {
  const j = await post('/api/join', { room: 'QUAN5', name, deviceId, robe: '#e0651f', skin: '#ffe0bd' });
  assert(j.status === 200, 'join ' + name + ' phải 200, nhận ' + j.status + ' ' + JSON.stringify(j.json));
  return j.json;
}
async function heartbeat(pid, x, z) {
  const hb = await post('/api/heartbeat', { room: 'QUAN5', playerId: pid, x, z, rot: 0, pose: 'dung' });
  assert(hb.status === 200, 'heartbeat phải 200, nhận ' + hb.status);
  return hb.json || {};
}
async function state() {
  const s = await get('/api/state?room=QUAN5');
  assert(s.status === 200, 'state phải 200, nhận ' + s.status);
  return s.json;
}
async function shipper(pid, action) {
  return post('/api/shipper', { room: 'QUAN5', playerId: pid, action });
}

let currentStep = 'khởi động';
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-event-smoke-'));
  let child = null;
  let stderr = '';
  try {
    for (const item of ['server.js', 'src', 'public', 'package.json']) {
      fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
    }
    child = spawn(process.execPath, ['server.js'], {
      cwd: tmp,
      env: Object.assign({}, process.env, { PORT: String(PORT), LION_INTERVAL_MS: '5000' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitHealth();
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    console.log('health ok, version=' + health.version);
    assert(health.version === expectedVersion, 'version phải là ' + expectedVersion + ', nhận ' + health.version);
    const S = require(path.join(ROOT, 'public', 'js', 'shared-core.js'));

    currentStep = 'shipper: nhận đơn';
    const shipper1 = await joinAs('Shipper1', 'event-device-shipper1');
    // Vị trí bắt đầu (spawn gần Chợ An Đông, quanh đó nhà và landmark
    // dày nên luôn có điểm trong 150–400m) lấy từ phản hồi join, không
    // hardcode tọa độ spawn.
    const take = await shipper(shipper1.playerId, 'take');
    assert(take.status === 200, 'nhận đơn phải 200, nhận ' + take.status + ' ' + JSON.stringify(take.json));
    const m = take.json.mission;
    assert(m && m.phase === 'pickup', 'nhiệm vụ mới phải ở phase pickup');
    assert(m.pickup.id !== m.delivery.id, 'điểm lấy và điểm giao phải khác nhau');
    assert(m.reward >= 8000 && m.reward <= 15000 && m.reward % 1000 === 0, 'thưởng phải 8–15k bước 1.000đ, nhận ' + m.reward);
    assert(m.deadlineAt - Date.now() > 50000 && m.deadlineAt - Date.now() <= 60000, 'hạn phải ~60 giây');
    const startX = shipper1.x, startZ = shipper1.z;
    const dPickup = Math.hypot(startX - m.pickup.x, startZ - m.pickup.z);
    const dDelivery = Math.hypot(startX - m.delivery.x, startZ - m.delivery.z);
    assert(dPickup >= S.metersToUnits(150) - 0.01 && dPickup <= S.metersToUnits(400) + 0.01,
      'điểm lấy phải cách người chơi 150–400m, nhận ' + S.unitsToMeters(dPickup).toFixed(0) + 'm');
    assert(dDelivery >= S.metersToUnits(150) - 0.01 && dDelivery <= S.metersToUnits(400) + 0.01,
      'điểm giao phải cách người chơi 150–400m, nhận ' + S.unitsToMeters(dDelivery).toFixed(0) + 'm');

    currentStep = 'shipper: nhận đơn khi đang có đơn phải lỗi';
    await sleep(1100);
    const takeAgain = await shipper(shipper1.playerId, 'take');
    assert(takeAgain.status === 400, 'nhận đơn khi đang có đơn phải 400, nhận ' + takeAgain.status);

    currentStep = 'shipper: tới điểm lấy → chuyển phase';
    const hbPickup = await heartbeat(shipper1.playerId, m.pickup.x, m.pickup.z);
    assert(hbPickup.missionEvent && hbPickup.missionEvent.type === 'pickedup',
      'tới điểm lấy phải trả missionEvent pickedup, nhận ' + JSON.stringify(hbPickup.missionEvent));

    currentStep = 'shipper: tới điểm giao → cộng tiền';
    const before = (await state()).players.find((p) => p.id === shipper1.playerId);
    const hbDelivery = await heartbeat(shipper1.playerId, m.delivery.x, m.delivery.z);
    assert(hbDelivery.missionEvent && hbDelivery.missionEvent.type === 'delivered',
      'tới điểm giao phải trả missionEvent delivered, nhận ' + JSON.stringify(hbDelivery.missionEvent));
    assert(hbDelivery.missionEvent.reward === m.reward, 'thưởng giao phải bằng thưởng lúc nhận đơn');
    const after = (await state()).players.find((p) => p.id === shipper1.playerId);
    assert(after.tien === before.tien + m.reward, 'tiền sau giao phải tăng đúng thưởng: ' + before.tien + ' → ' + after.tien);
    assert(!after.mission, 'giao xong thì nhiệm vụ phải hết');
    const feed = (await state()).events;
    assert(feed.some((e) => e.type === 'shipper' && e.message.indexOf('đã giao hàng') !== -1),
      'feed phải có thông báo giao hàng');

    currentStep = 'shipper: hủy đơn';
    await sleep(1100);
    const take2 = await shipper(shipper1.playerId, 'take');
    assert(take2.status === 200, 'nhận đơn lần 2 phải 200');
    await sleep(1100);
    const cancel = await shipper(shipper1.playerId, 'cancel');
    assert(cancel.status === 200 && cancel.json.mission === null, 'hủy đơn phải 200 và mission null');
    await sleep(1100);
    const cancelAgain = await shipper(shipper1.playerId, 'cancel');
    assert(cancelAgain.status === 400, 'hủy khi không có đơn phải 400');

    currentStep = 'lion: xuất hiện + lì xì + nhặt';
    // Chu kỳ test 5 giây: Lân xuất hiện trong vòng 5s sau khi phòng có
    // người, lì xì đầu tiên rơi 5s sau đó. Chờ tối đa 15s cho state có
    // lì xì (đủ cho 1 lần xuất hiện + 1 lần rơi, kể cả khi server vừa
    // khởi động xong đã qua mất một chu kỳ).
    let st = null, waited = 0;
    while (waited < 15000) {
      st = await state();
      if (st.envelopes && st.envelopes.length > 0) break;
      await sleep(500);
      waited += 500;
    }
    assert(st.envelopes && st.envelopes.length > 0, 'sau tối đa 15s state phải có lì xì');
    assert(st.lion && typeof st.lion.x === 'number' && typeof st.lion.z === 'number',
      'khi có lì xì thì Lân phải còn đang đi (lion có tọa độ)');
    // State lì xì gọn nhẹ: chỉ id, tọa độ, hạn — không có giá trị tiền
    // (giá trị chỉ quay lúc nhặt, phía server).
    assert(st.envelopes.every((e) => e.id && typeof e.x === 'number' && typeof e.z === 'number' && e.expiresAt && !('value' in e) && !('amount' in e)),
      'envelope trong state chỉ được có id/x/z/expiresAt, không có giá trị tiền');
    const env = st.envelopes[0];
    const picker = await joinAs('Picker', 'event-device-picker');
    const beforePick = (await state()).players.find((p) => p.id === picker.playerId);
    const hbPick = await heartbeat(picker.playerId, env.x, env.z);
    assert(hbPick.lionPickup && hbPick.lionPickup.amount >= 3000 && hbPick.lionPickup.amount <= 10000,
      'nhặt lì xì phải trả lionPickup 3–10k, nhận ' + JSON.stringify(hbPick.lionPickup));
    const afterPick = (await state()).players.find((p) => p.id === picker.playerId);
    assert(afterPick.tien === beforePick.tien + hbPick.lionPickup.amount,
      'tiền sau nhặt phải tăng đúng số lì xì');
    const stAfter = await state();
    assert(!stAfter.envelopes.some((e) => e.id === env.id),
      'lì xì đã nhặt phải biến mất khỏi state cho mọi người');
    // Người thứ hai tới đúng chỗ đó thì không nhặt lại được cái đã mất.
    const picker2 = await joinAs('Picker2', 'event-device-picker2');
    const hbPick2 = await heartbeat(picker2.playerId, env.x, env.z);
    assert(!hbPick2.lionPickup || hbPick2.lionPickup.envelopeId !== env.id,
      'lì xì đã nhặt không được nhặt lại lần hai');
    console.log('EVENT SMOKE PASS (bước cuối: ' + currentStep + ')');
  } catch (e) {
    console.error('EVENT SMOKE FAIL ở bước "' + currentStep + '": ' + (e && e.message ? e.message : e));
    if (stderr) console.error('--- server stderr (đuôi) ---\n' + stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await sleep(300);
      if (!child.killed) child.kill('SIGKILL');
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {}
  }
}

main();
