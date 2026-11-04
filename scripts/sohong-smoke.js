// Test tích hợp Deep Link ghé thăm + Sổ Hồng (v1.6): chạy server thật
// trong thư mục tạm (không chạm economy.json thật), rồi gọi API thật:
// mua nhà rẻ nhất → bạn join kèm visit=<house_id> (spawn trên đường
// trước nhà đó, visitHouse trả đúng tên chủ) → visit nhà chưa có chủ
// (owned false, ownerName null, vẫn spawn trước nhà) → visit id sai
// (join vẫn 200, spawn mặc định, visitHouse null, không chặn người
// mới) → visit đè cả nhà chính (người đã có nhà chính mà bấm link thăm
// nhà khác thì spawn ở nhà được thăm, nhà chính không đổi).
// Phần vẽ thẻ Canvas 2D và link mời trên thẻ là code client (cần DOM),
// không chạy được trong Node — kiểm chứng bằng browser check sau
// deploy (mở Sổ Hồng của người đã mua nhà, đọc link trên thẻ).
// Chạy bằng: node scripts/sohong-smoke.js
// Thoát 0 khi mọi kiểm tra pass, thoát 1 và in rõ kiểm tra nào fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3996;
const BASE = 'http://127.0.0.1:' + PORT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('SOHONG SMOKE FAIL: ' + msg);
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
  throw new Error('SOHONG SMOKE FAIL: server không lên health trong 10 giây.');
}
async function joinAs(name, deviceId, visit) {
  const body = { room: 'QUAN5', name, deviceId, robe: '#e0651f', skin: '#ffe0bd' };
  if (visit !== undefined) body.visit = visit;
  const j = await post('/api/join', body);
  assert(j.status === 200, 'join ' + name + ' phải 200, nhận ' + j.status + ' ' + JSON.stringify(j.json));
  return j.json;
}
async function heartbeat(pid, x, z) {
  const hb = await post('/api/heartbeat', { room: 'QUAN5', playerId: pid, x, z, rot: 0, pose: 'dung' });
  assert(hb.status === 200, 'heartbeat phải 200, nhận ' + hb.status);
  return hb.json || {};
}
async function house(pid, action, houseId, extra) {
  return post('/api/house', Object.assign({ room: 'QUAN5', playerId: pid, action, houseId }, extra || {}));
}
function nearestRoadPoint(S, map, b) {
  let best = null, bestD = Infinity;
  for (const r of map.roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const seg = S.distToSeg(b.x, b.z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]);
      if (seg.d < bestD) {
        bestD = seg.d;
        best = seg;
      }
    }
  }
  return best;
}

let currentStep = 'khởi động';
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-sohong-smoke-'));
  let child = null;
  let stderr = '';
  try {
    for (const item of ['server.js', 'src', 'public', 'package.json']) {
      fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
    }
    child = spawn(process.execPath, ['server.js'], {
      cwd: tmp,
      env: Object.assign({}, process.env, { PORT: String(PORT) }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitHealth();
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    console.log('health ok, version=' + health.version);
    assert(health.version === expectedVersion, 'version phải là ' + expectedVersion + ', nhận ' + health.version);
    const S = require(path.join(ROOT, 'public', 'js', 'shared-core.js'));
    const mapRes = await get('/quan5-map.json');
    assert(mapRes.status === 200, 'GET /quan5-map.json phải 200');
    const map = mapRes.json;
    const byPrice = map.buildings.slice().sort((a, b) =>
      S.housePrice(a, map.origin.scale_units_per_meter) - S.housePrice(b, map.origin.scale_units_per_meter));
    const cheap = byPrice[0];
    const cheapPrice = S.housePrice(cheap, map.origin.scale_units_per_meter);
    const other = byPrice[1];
    assert(cheapPrice <= 100000, 'nhà rẻ nhất phải mua được bằng 100.000đ, giá ' + cheapPrice);
    assert(other.id !== cheap.id, 'nhà thứ hai phải khác nhà rẻ nhất');

    currentStep = 'mua nhà rẻ nhất làm nhà được thăm';
    const owner = await joinAs('ChuQuan', 'sohong-owner-001');
    await heartbeat(owner.playerId, cheap.x, cheap.z);
    const buy = await house(owner.playerId, 'buy', cheap.id);
    assert(buy.status === 200, 'mua nhà phải 200, nhận ' + buy.status + ' ' + JSON.stringify(buy.json));
    assert(buy.json.home === cheap.id || buy.json.tien === 100000 - cheapPrice,
      'mua xong phải trừ tiền / đặt nhà chính, nhận ' + JSON.stringify(buy.json));

    currentStep = 'visit nhà đã có chủ: spawn trên đường + tên chủ';
    const want = nearestRoadPoint(S, map, cheap);
    assert(want, 'phải tính được điểm đường gần nhà rẻ nhất');
    const visitor = await joinAs('BanTham', 'sohong-visitor-001', cheap.id);
    assert(visitor.visitHouse && visitor.visitHouse.id === cheap.id,
      'visitHouse phải trả đúng id nhà, nhận ' + JSON.stringify(visitor.visitHouse));
    assert(visitor.visitHouse.owned === true && visitor.visitHouse.ownerName === 'ChuQuan',
      'visitHouse phải trả owned true + tên chủ ChuQuan, nhận ' + JSON.stringify(visitor.visitHouse));
    assert(Math.abs(visitor.x - want.x) < 1e-6 && Math.abs(visitor.z - want.z) < 1e-6,
      'spawn visit phải đúng điểm đường gần nhà nhất (' + want.x.toFixed(3) + ',' + want.z.toFixed(3) + '), nhận (' + visitor.x + ',' + visitor.z + ')');
    assert(!(visitor.x === S.SPAWN.x && visitor.z === S.SPAWN.z),
      'spawn visit không được là spawn mặc định');

    currentStep = 'visit nhà chưa có chủ: owned false, vẫn spawn trước nhà';
    const wantOther = nearestRoadPoint(S, map, other);
    const visitor2 = await joinAs('BanTham2', 'sohong-visitor-002', other.id);
    assert(visitor2.visitHouse && visitor2.visitHouse.owned === false && visitor2.visitHouse.ownerName === null,
      'nhà chưa có chủ phải trả owned false + ownerName null, nhận ' + JSON.stringify(visitor2.visitHouse));
    assert(Math.abs(visitor2.x - wantOther.x) < 1e-6 && Math.abs(visitor2.z - wantOther.z) < 1e-6,
      'spawn visit nhà chưa có chủ cũng phải là điểm đường gần nhà nhất');

    currentStep = 'visit id sai: join vẫn thành công ở spawn mặc định';
    const bad = await joinAs('BanLac', 'sohong-visitor-003', 'h999999_99.999999');
    assert(bad.visitHouse === null || bad.visitHouse === undefined,
      'visit id sai phải trả visitHouse null, nhận ' + JSON.stringify(bad.visitHouse));
    assert(bad.x === S.SPAWN.x && bad.z === S.SPAWN.z,
      'visit id sai phải fallback về spawn mặc định, nhận (' + bad.x + ',' + bad.z + ')');

    currentStep = 'visit đè nhà chính nhưng không đổi nhà chính';
    const ownerAgain = await joinAs('ChuQuan', 'sohong-owner-001', other.id);
    assert(ownerAgain.home === cheap.id,
      'nhà chính sau visit vẫn phải là nhà đã mua, nhận ' + ownerAgain.home);
    assert(Math.abs(ownerAgain.x - wantOther.x) < 1e-6 && Math.abs(ownerAgain.z - wantOther.z) < 1e-6,
      'người có nhà chính mà bấm link thăm nhà khác phải spawn ở nhà được thăm, không phải nhà chính');

    console.log('SOHONG SMOKE PASS (bước cuối: ' + currentStep + ')');
  } catch (e) {
    console.error('SOHONG SMOKE FAIL ở bước "' + currentStep + '": ' + (e && e.message ? e.message : e));
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
