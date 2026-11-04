// Test tích hợp NPC cư dân bất đồng bộ (v1.7): chạy server thật trong
// thư mục tạm (không chạm economy.json thật), rồi gọi API thật:
// A join với áo xanh #1565c0, mua nhà rẻ nhất → B join cùng phòng thì
// state trả ownerOnline true + ownerRobe đúng màu xanh + ownerName đúng
// → A ngừng heartbeat 30s (vượt mốc prune ~25s) trong khi B vẫn
// heartbeat đều thì state sau đó trả ownerOnline false nhưng ownerRobe
// vẫn xanh (màu áo đã lưu vào ví, không mất khi chủ offline) → restart
// server (cùng thư mục tạm, economy.json còn nguyên) thì C join vẫn
// thấy ownerRobe xanh + ownerOnline false (dữ liệu sống qua restart)
// → và record nhà trên đĩa KHÔNG bị lọt ownerRobe/ownerOnline (hai
// trường này chỉ là bản sao lúc trả state, không ghi vào sổ).
// Phần dựng NPC 3D và bong bóng chào là code client (cần DOM/Three),
// không chạy được trong Node — kiểm chứng bằng browser check sau
// deploy (chủ offline → khách thấy NPC mặc đúng màu áo trước hiên,
// lại gần 5 đơn vị thì NPC quay mặt + bong bóng chào).
// Chạy bằng: node scripts/npc-smoke.js
// Thoát 0 khi mọi kiểm tra pass, thoát 1 và in rõ kiểm tra nào fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3995;
const BASE = 'http://127.0.0.1:' + PORT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('NPC SMOKE FAIL: ' + msg);
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
  return { status: res.status, json };
}
async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await get('/api/health');
      if (r.status === 200 && r.json && r.json.ok) return r.json;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('NPC SMOKE FAIL: server không lên health trong 10 giây.');
}
async function joinAs(name, deviceId, robe) {
  const j = await post('/api/join', { room: 'QUAN5', name, deviceId, robe: robe || '#e0651f', skin: '#ffe0bd' });
  assert(j.status === 200, 'join ' + name + ' phải 200, nhận ' + j.status + ' ' + JSON.stringify(j.json));
  return j.json;
}
async function heartbeat(pid) {
  const hb = await post('/api/heartbeat', { room: 'QUAN5', playerId: pid, x: 25, z: -10, rot: 0, pose: 'dung' });
  assert(hb.status === 200, 'heartbeat phải 200, nhận ' + hb.status);
  return hb.json || {};
}
async function state() {
  const s = await get('/api/state?room=QUAN5');
  assert(s.status === 200, 'state phải 200, nhận ' + s.status);
  return s.json;
}
function startServer(tmp) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: tmp,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', () => {});
  child.stdout.on('data', () => {});
  return child;
}
async function stopServer(child) {
  if (!child) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((r) => child.on('exit', r)),
    sleep(3000)
  ]);
  try {
    child.kill('SIGKILL');
  } catch (e) {}
}

let currentStep = 'khởi động';
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-npc-smoke-'));
  let child = null;
  try {
    for (const item of ['server.js', 'src', 'public', 'package.json']) {
      fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
    }
    child = startServer(tmp);
    const health = await waitHealth();
    console.log('health ok, version=' + health.version);
    const S = require(path.join(ROOT, 'public', 'js', 'shared-core.js'));
    const mapRes = await get('/quan5-map.json');
    assert(mapRes.status === 200, 'GET /quan5-map.json phải 200');
    const map = mapRes.json;
    const byPrice = map.buildings.slice().sort((a, b) =>
      S.housePrice(a, map.origin.scale_units_per_meter) - S.housePrice(b, map.origin.scale_units_per_meter));
    const cheap = byPrice[0];
    const cheapPrice = S.housePrice(cheap, map.origin.scale_units_per_meter);
    assert(cheapPrice <= 100000, 'nhà rẻ nhất phải mua được bằng 100.000đ, giá ' + cheapPrice);

    currentStep = 'chủ nhà join áo xanh, mua nhà rẻ nhất';
    const owner = await joinAs('ChuNha', 'npc-owner-001', '#1565c0');
    // Mua nhà yêu cầu đứng trong 6 đơn vị của nhà (kiểm tra phía
    // server), nên heartbeat ngay tại nhà trước khi mua.
    await post('/api/heartbeat', { room: 'QUAN5', playerId: owner.playerId, x: cheap.x, z: cheap.z, rot: 0, pose: 'dung' });
    const buy = await post('/api/house', { room: 'QUAN5', playerId: owner.playerId, action: 'buy', houseId: cheap.id });
    assert(buy.status === 200, 'mua nhà phải 200, nhận ' + buy.status + ' ' + JSON.stringify(buy.json));

    currentStep = 'chủ còn online: state trả ownerOnline true + robe xanh';
    const visitor = await joinAs('Khach', 'npc-visitor-001', '#e0651f');
    await heartbeat(visitor.playerId);
    let st = await state();
    let rec = st.houses[cheap.id];
    assert(rec, 'state phải có nhà vừa mua');
    assert(rec.ownerOnline === true, 'chủ đang online thì ownerOnline phải true, nhận ' + JSON.stringify(rec));
    assert(rec.ownerRobe === '#1565c0', 'ownerRobe phải là màu áo lúc join (#1565c0), nhận ' + JSON.stringify(rec));
    assert(rec.ownerName === 'ChuNha', 'ownerName phải là ChuNha, nhận ' + JSON.stringify(rec));

    currentStep = 'chủ offline (30s không heartbeat, vượt mốc prune ~25s)';
    // B vẫn heartbeat đều để tự nó không bị prune; mỗi lần B poll state
    // là một lần server prune (handleState có prune), nên A sẽ bị loại
    // ngay poll đầu tiên sau mốc 25s mà không cần B join lại.
    for (let i = 0; i < 6; i++) {
      await heartbeat(visitor.playerId);
      await state();
      await sleep(5000);
    }
    st = await state();
    rec = st.houses[cheap.id];
    assert(rec.ownerOnline === false, 'sau 30s chủ im lặng thì ownerOnline phải false, nhận ' + JSON.stringify(rec));
    assert(rec.ownerRobe === '#1565c0', 'chủ offline rồi ownerRobe vẫn phải xanh (đã lưu vào ví), nhận ' + JSON.stringify(rec));

    currentStep = 'restart server: dữ liệu NPC sống qua restart, sổ đĩa không bị lọt trường state';
    await stopServer(child);
    child = startServer(tmp);
    await waitHealth();
    const newcomer = await joinAs('KhachMoi', 'npc-visitor-002', '#e0651f');
    await heartbeat(newcomer.playerId);
    st = await state();
    rec = st.houses[cheap.id];
    assert(rec.ownerOnline === false, 'sau restart, chủ vẫn offline thì ownerOnline false, nhận ' + JSON.stringify(rec));
    assert(rec.ownerRobe === '#1565c0', 'sau restart ownerRobe vẫn xanh, nhận ' + JSON.stringify(rec));
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'economy.json'), 'utf8'));
    assert(onDisk.players['npc-owner-001'].robe === '#1565c0',
      'economy.json trên đĩa phải lưu robe xanh, nhận ' + JSON.stringify(onDisk.players['npc-owner-001']));
    const diskHouse = onDisk.houses[cheap.id];
    assert(diskHouse && !('ownerRobe' in diskHouse) && !('ownerOnline' in diskHouse),
      'record nhà trên đĩa không được lọt ownerRobe/ownerOnline, nhận ' + JSON.stringify(diskHouse));

    console.log('NPC SMOKE PASS: online true + robe xanh, offline false + robe còn nguyên, restart vẫn nguyên, sổ đĩa sạch.');
  } finally {
    await stopServer(child);
  }
}
main().catch((e) => {
  console.error('Ở bước: ' + currentStep);
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
