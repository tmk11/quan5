// Smoke test tích hợp: chạy server thật trong thư mục tạm (không chạm
// vào economy.json thật), rồi gọi API thật qua HTTP để kiểm tra toàn bộ
// luồng join, heartbeat, action, check-in, mua, bán, state và các lỗi
// validate. Chạy bằng: node scripts/smoke.js
// Thoát 0 khi mọi kiểm tra pass, thoát 1 và in rõ kiểm tra nào fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3999;
const BASE = 'http://127.0.0.1:' + PORT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('SMOKE FAIL: ' + msg);
  }
}
async function post(p, body, raw) {
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body)
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
  // Đọc body một lần qua text rồi parse, không dùng clone().json() vì
  // clone để lại body gốc chưa đọc, làm bẩn connection keep-alive và gây
  // lỗi "other side closed" ở request sau.
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
    } catch (e) {
      // Server chưa lên, thử lại.
    }
    await sleep(200);
  }
  throw new Error('SMOKE FAIL: server không lên health trong 10 giây.');
}

let currentStep = 'khởi động';
let smokeStderr = '';
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-smoke-'));
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
    child.stderr.on('data', (d) => { stderr += d.toString(); smokeStderr += d.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitHealth();
    console.log('health ok, version=' + health.version + ', roads=' + health.map.roads);
    assert(health.map.roads === 1913, 'health phải báo 1913 đường, nhận ' + health.map.roads);
    assert(health.map.buildings === 474, 'health phải báo 474 nhà, nhận ' + health.map.buildings);

    const home = await get('/');
    assert(home.status === 200, 'GET / phải 200, nhận ' + home.status);
    assert(home.text.includes('js/app.js'), 'trang chủ phải load js/app.js (client đã tách module)');
    assert(home.text.includes('css/style.css'), 'trang chủ phải load css/style.css');
    for (const asset of ['/js/shared-core.js', '/js/render.js', '/js/map.js', '/js/net.js', '/js/app.js', '/css/style.css']) {
      const a = await get(asset);
      assert(a.status === 200, 'tài nguyên ' + asset + ' phải 200, nhận ' + a.status);
    }

    const mapRes = await get('/quan5-map.json');
    assert(mapRes.status === 200, 'GET /quan5-map.json phải 200');
    assert(Array.isArray(mapRes.json.buildings), 'map phải có buildings');

    // Join hợp lệ.
    currentStep = 'join';
    const join = await post('/api/join', {
      room: 'QUAN5', name: 'Boss', deviceId: 'test-smoke-001',
      robe: '#e0651f', skin: '#ffe0bd'
    });
    assert(join.status === 200, 'join hợp lệ phải 200, nhận ' + join.status + ' ' + JSON.stringify(join.json));
    assert(join.json.tien === 100000, 'join phải có 100000đ, nhận ' + join.json.tien);
    assert(join.json.home === null, 'join lần đầu phải chưa có nhà chính');
    const playerId = join.json.playerId;
    const deviceId = join.json.deviceId;

    // Join sai: tên chứa HTML, deviceId __proto__, mã phòng sai.
    const badName = await post('/api/join', { room: 'QUAN5', name: '<img>', deviceId: 'test-smoke-bad1' });
    assert(badName.status === 400, 'tên HTML phải 400, nhận ' + badName.status);
    const badDevice = await post('/api/join', { room: 'QUAN5', name: 'Boss', deviceId: '__proto__' });
    assert(badDevice.status === 400, 'deviceId __proto__ phải 400, nhận ' + badDevice.status);
    const badRoom = await post('/api/join', { room: 'a b', name: 'Boss', deviceId: 'test-smoke-bad2' });
    assert(badRoom.status === 400, 'mã phòng sai phải 400, nhận ' + badRoom.status);

    // Heartbeat hợp lệ và heartbeat sai tọa độ.
    const hb = await post('/api/heartbeat', { room: 'QUAN5', playerId, x: join.json.x, z: join.json.z, rot: 0, pose: 'dung' });
    assert(hb.status === 200, 'heartbeat hợp lệ phải 200, nhận ' + hb.status + ' ' + JSON.stringify(hb.json));
    const hbBad = await post('/api/heartbeat', { room: 'QUAN5', playerId, x: 'abc', z: 0, rot: 0 });
    assert(hbBad.status === 400, 'heartbeat x không phải số phải 400, nhận ' + hbBad.status);

    // Action chào thành công, rồi action ngay sau đó bị cooldown chặn.
    await sleep(1100);
    const chao = await post('/api/action', { room: 'QUAN5', playerId, type: 'chao' });
    assert(chao.status === 200 && chao.json.diem === 1, 'chao phải diem=1, nhận ' + JSON.stringify(chao.json));
    const chaoFast = await post('/api/action', { room: 'QUAN5', playerId, type: 'chao' });
    assert(chaoFast.status === 429, 'action ngay sau đó phải 429 cooldown, nhận ' + chaoFast.status);
    await sleep(1100);

    // Check-in sai landmark và check-in xa đều không được tiền.
    const checkinBad = await post('/api/action', { room: 'QUAN5', playerId, type: 'checkin', value: 'Không có chỗ này' });
    assert(checkinBad.status === 400, 'check-in sai landmark phải 400, nhận ' + checkinBad.status);
    await sleep(1100);
    const checkinFar = await post('/api/action', { room: 'QUAN5', playerId, type: 'checkin', value: 'Chợ Bình Tây' });
    assert(checkinFar.status === 400, 'check-in xa phải 400, nhận ' + checkinFar.status + ' ' + JSON.stringify(checkinFar.json));
    assert(String(checkinFar.json.error).includes('đơn vị'), 'lỗi check-in xa phải ghi rõ đơn vị');
    await sleep(1100);

    // Đổi buổi sai giá trị không được đẩy event, buổi vẫn là sáng.
    const buoiBad = await post('/api/action', { room: 'QUAN5', playerId, type: 'buoi', value: 'trưa' });
    assert(buoiBad.status === 400, 'buoi sai phải 400, nhận ' + buoiBad.status);
    await sleep(1100);

    // Mua nhà xa phải bị chặn vì khoảng cách.
    const farHouse = mapRes.json.buildings.find((b) => b.x < -100);
    assert(farHouse, 'bản đồ phải có nhà ở phía tây xa để test khoảng cách');
    const buyFar = await post('/api/house', { room: 'QUAN5', playerId, action: 'buy', houseId: farHouse.id });
    assert(buyFar.status === 400, 'mua nhà xa phải 400, nhận ' + buyFar.status + ' ' + JSON.stringify(buyFar.json));
    await sleep(1100);

    // Mua nhà thành công: chọn nhà rẻ nhất trong bản đồ để ví 100.000đ
    currentStep = 'mua nhà';
    // mua được, rồi di chuyển tới nhà đó và mua.
    const S = require(path.join(ROOT, 'public', 'js', 'shared-core.js'));
    let house = null;
    let price = Infinity;
    for (const b of mapRes.json.buildings) {
      const p = S.housePrice(b, mapRes.json.origin.scale_units_per_meter);
      if (p < price) {
        price = p;
        house = b;
      }
    }
    assert(house && price <= 100000, 'bản đồ phải có nhà rẻ để ví 100.000đ mua được, nhà rẻ nhất là ' + price);
    const hb2 = await post('/api/heartbeat', { room: 'QUAN5', playerId, x: house.x, z: house.z, rot: 0 });
    assert(hb2.status === 200, 'heartbeat tới nhà phải 200');
    const buy = await post('/api/house', { room: 'QUAN5', playerId, action: 'buy', houseId: house.id });
    assert(buy.status === 200, 'mua nhà gần phải 200, nhận ' + buy.status + ' ' + JSON.stringify(buy.json));
    assert(buy.json.price === price, 'giá mua phải khớp công thức, nhận ' + buy.json.price + ' so với ' + price);
    assert(buy.json.tien === 100000 - price, 'tiền sau mua phải là ' + (100000 - price) + ', nhận ' + buy.json.tien);
    assert(buy.json.home === house.id, 'nhà mua phải thành nhà chính');
    await sleep(1100);

    // Ví thứ hai mua cùng nhà phải bị chặn.
    const join2 = await post('/api/join', { room: 'QUAN5', name: 'Khach', deviceId: 'test-smoke-002' });
    assert(join2.status === 200, 'join ví thứ hai phải 200');
    await post('/api/heartbeat', { room: 'QUAN5', playerId: join2.json.playerId, x: house.x, z: house.z, rot: 0 });
    await sleep(1100);
    const buy2 = await post('/api/house', { room: 'QUAN5', playerId: join2.json.playerId, action: 'buy', houseId: house.id });
    assert(buy2.status === 400, 'ví thứ hai mua cùng nhà phải 400, nhận ' + buy2.status);
    assert(String(buy2.json.error).includes('đã có chủ'), 'lỗi mua trùng nhà phải ghi rõ đã có chủ');

    // Bán nhà hoàn 80%, nhà chính bị xóa.
    await sleep(1100);
    const refund = S.sellRefund(price);
    const sell = await post('/api/house', { room: 'QUAN5', playerId, action: 'sell', houseId: house.id });
    assert(sell.status === 200, 'bán nhà phải 200, nhận ' + sell.status + ' ' + JSON.stringify(sell.json));
    assert(sell.json.refund === refund, 'hoàn tiền phải là ' + refund + ', nhận ' + sell.json.refund);
    assert(sell.json.tien === 100000 - price + refund, 'tiền sau bán phải đúng, nhận ' + sell.json.tien);
    assert(sell.json.home === null, 'bán nhà chính phải xóa nhà chính');

    // State phải thấy 2 người chơi và sổ nhà trống sau khi bán.
    currentStep = 'state';
    const state = await get('/api/state?room=QUAN5');
    assert(state.status === 200, 'state phải 200');
    assert(state.json.players.length >= 2, 'state phải có ít nhất 2 người chơi, nhận ' + state.json.players.length);
    assert(Object.keys(state.json.houses).length === 0, 'sau khi bán, sổ nhà phải trống');

    // Lỗi body và đường dẫn. Test body quá lớn để cuối cùng vì nó đóng
    // connection sau response, dù server đã gửi Connection: close.
    const badJson = await post('/api/join', null, '{ hỏng');
    assert(badJson.status === 400, 'JSON hỏng phải 400, nhận ' + badJson.status);
    const unknown = await get('/api/khongco');
    assert(unknown.status === 404, 'đường dẫn không có phải 404, nhận ' + unknown.status);
    const traversal = await get('/server.js');
    assert(traversal.status === 404, 'truy cập /server.js phải 404, không được lộ code server, nhận ' + traversal.status);
    const bigBody = await post('/api/join', null, JSON.stringify({ room: 'QUAN5', name: 'x'.repeat(20000) }));
    assert(bigBody.status === 413, 'body quá lớn phải 413, nhận ' + bigBody.status);

    console.log('SMOKE PASS: toàn bộ luồng API hoạt động đúng, device=' + deviceId + ', nhà test=' + house.id + ', giá=' + price);
  } finally {
    if (child) {
      const exited = new Promise((resolve) => {
        child.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
      try { child.kill('SIGTERM'); } catch (e) {}
      await exited;
      if (child.exitCode === null) {
        try { child.kill('SIGKILL'); } catch (e) {}
        await new Promise((resolve) => {
          child.once('exit', resolve);
          setTimeout(resolve, 2000);
        });
      }
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      console.error('Không dọn được thư mục tạm smoke test: ' + e.message);
    }
  }
}

main().catch((e) => {
  console.error('SMOKE FAIL tại bước: ' + currentStep);
  console.error(e && e.stack ? e.stack : e.message);
  if (e && e.cause) {
    console.error('Nguyên nhân: ' + (e.cause.stack || e.cause.message || String(e.cause)));
  }
  console.error('--- server stderr (cuối) ---');
  console.error(smokeStderr.slice(-3000));
  process.exit(1);
});
