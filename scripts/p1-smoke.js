// Test tích hợp Cân bằng tiền v1.9 (thiết kế v2 giai đoạn 1): chạy server
// thật trong thư mục tạm (không chạm economy.json thật), rồi gọi API thật
// qua HTTP để kiểm tra toàn bộ luật P1:
//  - check-in: tiền 1 lần/ngày/landmark (lần 2 cùng landmark +0đ, landmark
//    khác cùng ngày vẫn +5.000đ), điểm vẫn cộng;
//  - hành động có giá: ăn 3.000đ, mua lồng đèn 5.000đ, chào miễn phí,
//    không đủ tiền thì 400 "Không đủ tiền" và ví không đổi;
//  - mua lại: chủ cũ nhận đúng tiền gốc (100%), nhà niêm phong 24 giờ,
//    mua lại ngay thì 400 "niêm phong";
//  - shipper: 5 đơn/ngày thưởng đầy, đơn thứ 6 +0đ nhưng vẫn hoàn thành
//    (capped: true), ví không đổi.
// Chạy bằng: node scripts/p1-smoke.js
// Thoát 0 khi mọi kiểm tra pass, thoát 1 và in rõ kiểm tra nào fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3997;
const BASE = 'http://127.0.0.1:' + PORT;
const S = require('../public/js/shared-core.js');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('P1 SMOKE FAIL: ' + msg);
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
  throw new Error('P1 SMOKE FAIL: server không lên health trong 10 giây.');
}
async function joinAs(name, deviceId) {
  const j = await post('/api/join', { room: 'QUAN5', name, deviceId, robe: '#e0651f', skin: '#ffe0bd' });
  assert(j.status === 200, 'join ' + name + ' phải 200, nhận ' + j.status + ' ' + JSON.stringify(j.json));
  return j.json;
}
async function heartbeat(pid, x, z) {
  const hb = await post('/api/heartbeat', { room: 'QUAN5', playerId: pid, x, z, rot: 0, pose: 'dung' });
  assert(hb.status === 200, 'heartbeat phải 200, nhận ' + hb.status);
  return hb.json;
}
async function action(pid, type, value) {
  const body = { room: 'QUAN5', playerId: pid, type };
  if (value !== undefined) body.value = value;
  return post('/api/action', body);
}
async function house(pid, act, houseId, extra) {
  return post('/api/house', Object.assign({ room: 'QUAN5', playerId: pid, action: act, houseId }, extra || {}));
}
async function shipper(pid, act) {
  return post('/api/shipper', { room: 'QUAN5', playerId: pid, action: act });
}
async function playerTien(name) {
  const st = await get('/api/state?room=QUAN5');
  const p = (st.json.players || []).find((x) => x.name === name);
  assert(p, 'state phải thấy người chơi ' + name);
  return p.tien;
}

let currentStep = 'khởi động';
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-p1-smoke-'));
  let child = null;
  let stderr = '';
  try {
    for (const item of ['server.js', 'src', 'public', 'package.json']) {
      fs.cpSync(path.join(ROOT, item), path.join(tmp, item), { recursive: true });
    }
    // Seed ví nghèo 2.000đ để test "không đủ tiền" (join nhận deviceId có sẵn).
    fs.writeFileSync(path.join(tmp, 'economy.json'), JSON.stringify({
      players: {
        'p1-poor': { tien: 2000, home: null, name: 'Ngheo', robe: '#e0651f', checkinMoney: {}, shipperDay: { day: '', count: 0 } }
      },
      houses: {},
      incomeCooldown: {}
    }));
    child = spawn(process.execPath, ['server.js'], {
      cwd: tmp,
      env: Object.assign({}, process.env, { PORT: String(PORT) }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitHealth();
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    assert(health.version === expectedVersion, 'version phải là ' + expectedVersion + ', nhận ' + health.version);
    console.log('health ok, version=' + health.version);

    // Không đủ tiền: ví 2.000đ ăn 3.000đ phải 400, ví không đổi.
    currentStep = 'không đủ tiền';
    const poor = await joinAs('Ngheo', 'p1-poor');
    assert(poor.tien === 2000, 'ví nghèo phải là 2000, nhận ' + poor.tien);
    const poorAn = await action(poor.playerId, 'an');
    assert(poorAn.status === 400 && String(poorAn.json.error).includes('Không đủ tiền'),
      'ăn khi không đủ tiền phải 400 Không đủ tiền, nhận ' + poorAn.status + ' ' + JSON.stringify(poorAn.json));
    assert(await playerTien('Ngheo') === 2000, 'ví nghèo sau lần ăn lỗi phải vẫn 2000');

    // Check-in theo ngày: spawn (25,-10) cách Chợ An Đông (25,-18.2) 8,2 đơn vị.
    currentStep = 'check-in theo ngày';
    const choi = await joinAs('P1Choi', 'p1-choi-001');
    assert(choi.tien === 100000, 'ví mới phải 100000, nhận ' + choi.tien);
    const ci1 = await action(choi.playerId, 'checkin', 'Chợ An Đông');
    assert(ci1.status === 200, 'check-in lần 1 phải 200, nhận ' + ci1.status + ' ' + JSON.stringify(ci1.json));
    assert(ci1.json.tienAward === 5000, 'check-in lần 1 phải thưởng 5000, nhận ' + ci1.json.tienAward);
    assert(ci1.json.tien === 105000, 'tiền sau check-in lần 1 phải 105000, nhận ' + ci1.json.tien);
    await sleep(1100);
    const ci2 = await action(choi.playerId, 'checkin', 'Chợ An Đông');
    assert(ci2.status === 200, 'check-in lần 2 phải 200 (chỉ chặn tiền, không chặn hành động)');
    assert(ci2.json.tienAward === 0, 'check-in lần 2 cùng landmark phải thưởng 0, nhận ' + ci2.json.tienAward);
    assert(ci2.json.tien === 105000, 'tiền sau check-in lần 2 phải vẫn 105000, nhận ' + ci2.json.tien);
    assert(ci2.json.diem === ci1.json.diem + 10, 'điểm lần 2 vẫn +10');
    await sleep(1100);
    await heartbeat(choi.playerId, -138.4, 49.7);
    const ci3 = await action(choi.playerId, 'checkin', 'Chợ Bình Tây');
    assert(ci3.status === 200, 'check-in landmark khác phải 200, nhận ' + ci3.status + ' ' + JSON.stringify(ci3.json));
    assert(ci3.json.tienAward === 5000, 'landmark khác cùng ngày vẫn thưởng 5000, nhận ' + ci3.json.tienAward);
    assert(ci3.json.tien === 110000, 'tiền sau check-in landmark khác phải 110000, nhận ' + ci3.json.tien);

    // Hành động có giá ngoài đường (không gần quán nào): trừ đúng giá, chào free.
    currentStep = 'giá hành động';
    await sleep(1100);
    const an = await action(choi.playerId, 'an');
    assert(an.status === 200, 'ăn phải 200');
    assert(an.json.tien === 107000, 'ăn 3000đ, tiền phải 107000, nhận ' + an.json.tien);
    await sleep(1100);
    const mua = await action(choi.playerId, 'mua');
    assert(mua.status === 200, 'mua lồng đèn phải 200');
    assert(mua.json.tien === 102000, 'mua lồng đèn 5000đ, tiền phải 102000, nhận ' + mua.json.tien);
    await sleep(1100);
    const chao = await action(choi.playerId, 'chao');
    assert(chao.status === 200, 'chào phải 200');
    assert(chao.json.tien === 102000, 'chào miễn phí, tiền phải vẫn 102000, nhận ' + chao.json.tien);

    // Mua lại + niêm phong: chủ cũ nhận đúng tiền gốc, mua lại ngay bị chặn.
    currentStep = 'mua lại + niêm phong';
    const mapRes = await get('/quan5-map.json');
    const scale = mapRes.json.origin.scale_units_per_meter;
    const byPrice = [...mapRes.json.buildings].sort((a, b) => S.housePrice(a, scale) - S.housePrice(b, scale));
    const cheap = byPrice[0];
    const cheapPrice = S.housePrice(cheap, scale);
    const chu = await joinAs('P1Chu', 'p1-chu-001');
    await heartbeat(chu.playerId, cheap.x, cheap.z);
    await sleep(1100);
    const buy = await house(chu.playerId, 'buy', cheap.id);
    assert(buy.status === 200, 'mua nhà rẻ nhất phải 200, nhận ' + buy.status + ' ' + JSON.stringify(buy.json));
    const muaLai = await joinAs('P1MuaLai', 'p1-mualai-001');
    await heartbeat(muaLai.playerId, cheap.x, cheap.z);
    await sleep(1100);
    const newPrice = S.takeoverPrice(cheapPrice);
    const take = await house(muaLai.playerId, 'takeover', cheap.id);
    assert(take.status === 200, 'mua lại phải 200, nhận ' + take.status + ' ' + JSON.stringify(take.json));
    assert(take.json.payout === cheapPrice, 'chủ cũ phải nhận đúng tiền gốc ' + cheapPrice + ', nhận ' + take.json.payout);
    assert(take.json.tien === 100000 - newPrice, 'tiền người mua lại phải là ' + (100000 - newPrice) + ', nhận ' + take.json.tien);
    const stTake = await get('/api/state?room=QUAN5');
    assert(stTake.json.houses[cheap.id].price === newPrice, 'state phải thấy giá mới ' + newPrice);
    assert(stTake.json.houses[cheap.id].shieldUntil > Date.now(), 'state phải thấy shieldUntil trong tương lai');
    assert(await playerTien('P1Chu') === 100000, 'chủ cũ: 100000 - giá + tiền gốc = 100000, nhận ' + await playerTien('P1Chu'));
    await sleep(1100);
    const retake = await house(chu.playerId, 'takeover', cheap.id);
    assert(retake.status === 400 && String(retake.json.error).includes('niêm phong'),
      'mua lại ngay trong thời gian niêm phong phải 400 niêm phong, nhận ' + retake.status + ' ' + JSON.stringify(retake.json));

    // Shipper: 5 đơn thưởng đầy, đơn thứ 6 +0đ nhưng vẫn hoàn thành.
    currentStep = 'trần shipper';
    const ship = await joinAs('P1Ship', 'p1-ship-001');
    let expectedTien = 100000;
    for (let i = 1; i <= 6; i++) {
      await sleep(1100);
      const tk = await shipper(ship.playerId, 'take');
      assert(tk.status === 200 && tk.json.mission, 'nhận đơn ' + i + ' phải 200 có mission, nhận ' + tk.status + ' ' + JSON.stringify(tk.json));
      const m = tk.json.mission;
      const hb1 = await heartbeat(ship.playerId, m.pickup.x, m.pickup.z);
      assert(hb1.missionEvent && hb1.missionEvent.type === 'pickedup', 'đơn ' + i + ' tới điểm lấy phải pickedup, nhận ' + JSON.stringify(hb1.missionEvent));
      const hb2 = await heartbeat(ship.playerId, m.delivery.x, m.delivery.z);
      assert(hb2.missionEvent && hb2.missionEvent.type === 'delivered', 'đơn ' + i + ' tới điểm giao phải delivered, nhận ' + JSON.stringify(hb2.missionEvent));
      if (i <= 5) {
        assert(hb2.missionEvent.capped !== true, 'đơn ' + i + ' trong trần không được capped');
        assert(hb2.missionEvent.reward === m.reward, 'đơn ' + i + ' thưởng phải bằng mission.reward ' + m.reward + ', nhận ' + hb2.missionEvent.reward);
        expectedTien += m.reward;
      } else {
        assert(hb2.missionEvent.capped === true, 'đơn thứ 6 phải capped, nhận ' + JSON.stringify(hb2.missionEvent));
        assert(hb2.missionEvent.reward === 0, 'đơn thứ 6 thưởng tiền phải 0, nhận ' + hb2.missionEvent.reward);
      }
      const tienNow = await playerTien('P1Ship');
      assert(tienNow === expectedTien, 'sau đơn ' + i + ' tiền phải là ' + expectedTien + ', nhận ' + tienNow);
    }

    console.log('P1 SMOKE PASS: check-in ngày + giá hành động + không đủ tiền + mua lại 100% + niêm phong + trần shipper đều đúng.');
  } catch (e) {
    console.error('P1 SMOKE FAIL ở bước [' + currentStep + ']: ' + e.message);
    if (stderr) console.error('--- server stderr ---\n' + stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    if (child) {
      child.kill();
      await sleep(300);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
