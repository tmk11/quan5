// Test tích hợp Shophouse & Takeover (v1.4): chạy server thật trong thư
// mục tạm (không chạm economy.json thật), rồi gọi API thật qua HTTP để
// kiểm tra toàn bộ luồng: mua nhà → chọn biển → khách ghé ăn (doanh thu
// + buff + feed) → cooldown doanh thu → mua lại (+25%, chủ cũ nhận đúng tiền gốc, đốt
// 25%) → bảng Top Địa Chủ → mua trùng / mua lại sai → race 2 người mua
// cùng lúc và 2 người mua lại cùng lúc (chỉ 1 người thắng).
// Chạy bằng: node scripts/shop-smoke.js
// Thoát 0 khi mọi kiểm tra pass, thoát 1 và in rõ kiểm tra nào fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3998;
const BASE = 'http://127.0.0.1:' + PORT;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function assert(cond, msg) {
  if (!cond) {
    throw new Error('SHOP SMOKE FAIL: ' + msg);
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
  throw new Error('SHOP SMOKE FAIL: server không lên health trong 10 giây.');
}
async function joinAs(name, deviceId) {
  const j = await post('/api/join', { room: 'QUAN5', name, deviceId, robe: '#e0651f', skin: '#ffe0bd' });
  assert(j.status === 200, 'join ' + name + ' phải 200, nhận ' + j.status + ' ' + JSON.stringify(j.json));
  return j.json;
}
async function moveTo(pid, x, z) {
  const hb = await post('/api/heartbeat', { room: 'QUAN5', playerId: pid, x, z, rot: 0, pose: 'dung' });
  assert(hb.status === 200, 'heartbeat phải 200, nhận ' + hb.status);
}
async function house(pid, action, houseId, extra) {
  return post('/api/house', Object.assign({ room: 'QUAN5', playerId: pid, action, houseId }, extra || {}));
}
async function action(pid, type) {
  return post('/api/action', { room: 'QUAN5', playerId: pid, type });
}

let currentStep = 'khởi động';
let shopStderr = '';
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quan5-shop-smoke-'));
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
    child.stderr.on('data', (d) => { stderr += d.toString(); shopStderr += d.toString(); });
    child.stdout.on('data', () => {});

    const health = await waitHealth();
    console.log('health ok, version=' + health.version);
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    assert(health.version === expectedVersion, 'version phải là ' + expectedVersion + ', nhận ' + health.version);
    const S = require(path.join(ROOT, 'public', 'js', 'shared-core.js'));
    const mapRes = await get('/quan5-map.json');
    assert(mapRes.status === 200, 'GET /quan5-map.json phải 200');
    const byPrice = mapRes.json.buildings.slice().sort((a, b) =>
      S.housePrice(a, mapRes.json.origin.scale_units_per_meter) - S.housePrice(b, mapRes.json.origin.scale_units_per_meter));
    const cheap = byPrice[0];
    const cheapPrice = S.housePrice(cheap, mapRes.json.origin.scale_units_per_meter);
    assert(cheapPrice <= 100000, 'nhà rẻ nhất phải mua được bằng 100.000đ, giá ' + cheapPrice);

    // Mua nhà + chọn biển hiệu.
    currentStep = 'mua nhà + biển hiệu';
    const owner = await joinAs('ChuQuan', 'shop-owner-001');
    await moveTo(owner.playerId, cheap.x, cheap.z);
    const buy = await house(owner.playerId, 'buy', cheap.id);
    assert(buy.status === 200, 'mua nhà phải 200, nhận ' + buy.status + ' ' + JSON.stringify(buy.json));
    assert(buy.json.tien === 100000 - cheapPrice, 'tiền sau mua phải là ' + (100000 - cheapPrice) + ', nhận ' + buy.json.tien);
    assert(buy.json.shopType === null, 'nhà mới mua chưa có biển, nhận ' + buy.json.shopType);
    await sleep(1100);
    const shopBad = await house(owner.playerId, 'shop', cheap.id, { shopType: 'pho' });
    assert(shopBad.status === 400, 'biển sai phải 400, nhận ' + shopBad.status);
    await sleep(1100);
    const shop = await house(owner.playerId, 'shop', cheap.id, { shopType: 'vitquay' });
    assert(shop.status === 200 && shop.json.shopType === 'vitquay', 'chọn biển vịt quay phải 200, nhận ' + JSON.stringify(shop.json));
    let st = await get('/api/state?room=QUAN5');
    assert(st.json.houses[cheap.id].shopType === 'vitquay', 'state phải thấy biển vịt quay');
    assert(st.json.houses[cheap.id].paid === cheapPrice, 'state phải thấy tiền gốc bằng giá mua');

    // Khách ghé ăn: doanh thu + buff + feed đúng câu.
    currentStep = 'khách ghé quán';
    const visitor = await joinAs('KhachGhe', 'shop-visitor-001');
    await moveTo(visitor.playerId, cheap.x, cheap.z);
    const an1 = await action(visitor.playerId, 'an');
    assert(an1.status === 200, 'khách ăn phải 200, nhận ' + an1.status + ' ' + JSON.stringify(an1.json));
    assert(an1.json.shopIncome && an1.json.shopIncome.amount === 2000, 'lần ghé đầu phải có doanh thu 2000, nhận ' + JSON.stringify(an1.json.shopIncome));
    assert(an1.json.shopIncome.shopLabel === '🦆 Tiệm Vịt Quay', 'nhãn quán phải là Tiệm Vịt Quay, nhận ' + an1.json.shopIncome.shopLabel);
    assert(an1.json.buffUntil > Date.now(), 'khách phải có buffUntil trong tương lai');
    await moveTo(owner.playerId, cheap.x, cheap.z);
    await moveTo(visitor.playerId, cheap.x, cheap.z);
    st = await get('/api/state?room=QUAN5');
    const ownerInState = st.json.players.find((p) => p.name === 'ChuQuan');
    assert(ownerInState && ownerInState.tien === 100000 - cheapPrice + 2000, 'chủ quán phải nhận 2000, tiền phải là ' + (100000 - cheapPrice + 2000) + ', nhận ' + (ownerInState && ownerInState.tien));
    const shopEvent = (st.json.events || []).find((e) => e.type === 'shop');
    assert(shopEvent, 'feed phải có event shop');
    assert(shopEvent.message === 'KhachGhe vừa ghé 🦆 Tiệm Vịt Quay của ChuQuan ủng hộ 2.000đ!', 'câu feed phải đúng mẫu, nhận: ' + shopEvent.message);

    // Cooldown doanh thu: ăn lần 2 trong 60 giây thì không có tiền nữa
    // (nhưng vẫn có điểm và buff gia hạn), hành động mua lồng đèn thì
    // không tính tiền dù đứng ngay quán, chủ tự ăn ở quán mình cũng không.
    currentStep = 'cooldown doanh thu';
    await sleep(1100);
    const an2 = await action(visitor.playerId, 'an');
    assert(an2.status === 200, 'ăn lần 2 phải 200 (chỉ chặn tiền, không chặn hành động)');
    assert(!an2.json.shopIncome, 'ăn lần 2 trong cooldown không được có shopIncome, nhận ' + JSON.stringify(an2.json.shopIncome));
    await sleep(1100);
    const mua = await action(visitor.playerId, 'mua');
    assert(mua.status === 200, 'mua lồng đèn phải 200');
    assert(!mua.json.shopIncome, 'mua lồng đèn không phải hành động ghé quán, không được có shopIncome');
    await sleep(1100);
    const ownerAn = await action(owner.playerId, 'an');
    assert(ownerAn.status === 200, 'chủ ăn phải 200');
    assert(!ownerAn.json.shopIncome, 'chủ tự ăn ở quán mình không được tự in tiền');
    await moveTo(owner.playerId, cheap.x, cheap.z);
    await moveTo(visitor.playerId, cheap.x, cheap.z);
    st = await get('/api/state?room=QUAN5');
    const ownerAfter = st.json.players.find((p) => p.name === 'ChuQuan');
    assert(ownerAfter.tien === 100000 - cheapPrice + 2000, 'sau các lần không tính tiền, chủ vẫn chỉ có ' + (100000 - cheapPrice + 2000) + ', nhận ' + ownerAfter.tien);

    // Mua lại: giá +25%, chủ cũ nhận đúng tiền gốc (v1.9), biển giữ nguyên, nhà chính đổi chủ.
    currentStep = 'mua lại';
    const newPrice = S.takeoverPrice(cheapPrice);
    const payout = S.takeoverPayout(cheapPrice);
    const buyer = await joinAs('NguoiMuaLai', 'shop-buyer-001');
    await moveTo(buyer.playerId, cheap.x, cheap.z);
    const buyOwned = await house(buyer.playerId, 'buy', cheap.id);
    assert(buyOwned.status === 400 && String(buyOwned.json.error).includes('đã có chủ'), 'mua thường nhà đã có chủ phải 400 đã có chủ, nhận ' + JSON.stringify(buyOwned.json));
    await sleep(1100);
    const takeOwn = await house(owner.playerId, 'takeover', cheap.id);
    assert(takeOwn.status === 400, 'mua lại chính nhà mình phải 400, nhận ' + takeOwn.status);
    await sleep(1100);
    const take = await house(buyer.playerId, 'takeover', cheap.id);
    assert(take.status === 200, 'mua lại phải 200, nhận ' + take.status + ' ' + JSON.stringify(take.json));
    assert(take.json.price === newPrice, 'giá sau mua lại phải là ' + newPrice + ', nhận ' + take.json.price);
    assert(take.json.payout === payout, 'chủ cũ phải nhận ' + payout + ', nhận ' + take.json.payout);
    assert(take.json.tien === 100000 - newPrice, 'tiền người mua lại phải là ' + (100000 - newPrice) + ', nhận ' + take.json.tien);
    assert(take.json.shopType === 'vitquay', 'mua lại giữ biển cũ, nhận ' + take.json.shopType);
    await moveTo(owner.playerId, cheap.x, cheap.z);
    await moveTo(buyer.playerId, cheap.x, cheap.z);
    st = await get('/api/state?room=QUAN5');
    assert(st.json.houses[cheap.id].price === newPrice, 'state phải thấy giá mới');
    assert(st.json.houses[cheap.id].ownerName === 'NguoiMuaLai', 'state phải thấy chủ mới');
    const oldOwnerInState = st.json.players.find((p) => p.name === 'ChuQuan');
    assert(oldOwnerInState.tien === 100000 - cheapPrice + 2000 + payout, 'chủ cũ phải có ' + (100000 - cheapPrice + 2000 + payout) + ', nhận ' + oldOwnerInState.tien);
    assert(oldOwnerInState.home === null, 'chủ cũ mất nhà chính sau khi bị mua lại');
    const buyerInState = st.json.players.find((p) => p.name === 'NguoiMuaLai');
    assert(buyerInState.home === cheap.id, 'người mua lại phải có nhà chính mới');
    const takeEvent = (st.json.events || []).find((e) => e.type === 'house' && String(e.message).includes('đã mua lại'));
    assert(takeEvent, 'feed phải có event mua lại');

    // Bảng Top Địa Chủ: chỉ người trong phòng, xếp theo tiền + giá nhà.
    currentStep = 'bảng Top Địa Chủ';
    const lb = st.json.leaderboard || [];
    assert(lb.length === 3, 'bảng phải có 3 người trong phòng, nhận ' + lb.length);
    assert(lb[0].name === 'ChuQuan', 'đứng đầu phải là ChuQuan (tiền mặt lớn nhất), nhận ' + lb[0].name);
    assert(lb[0].wealth === 100000 - cheapPrice + 2000 + payout, 'tài sản đầu bảng phải đúng, nhận ' + lb[0].wealth);

    // Race mua thường: 2 người mua cùng lúc 1 nhà chưa có chủ, chỉ 1 thắng.
    currentStep = 'race mua thường';
    const raceHouse = byPrice.find((b) => b.id !== cheap.id && S.housePrice(b, mapRes.json.origin.scale_units_per_meter) <= 100000);
    assert(raceHouse, 'phải có nhà rẻ thứ hai để test race');
    const ra = await joinAs('RaceA', 'shop-race-a');
    const rb = await joinAs('RaceB', 'shop-race-b');
    await moveTo(ra.playerId, raceHouse.x, raceHouse.z);
    await moveTo(rb.playerId, raceHouse.x, raceHouse.z);
    await sleep(1100);
    const [buyA, buyB] = await Promise.all([
      house(ra.playerId, 'buy', raceHouse.id),
      house(rb.playerId, 'buy', raceHouse.id)
    ]);
    const buyWins = [buyA, buyB].filter((r) => r.status === 200);
    const buyLosses = [buyA, buyB].filter((r) => r.status === 400);
    assert(buyWins.length === 1 && buyLosses.length === 1, 'race mua thường phải đúng 1 thắng 1 thua, nhận ' + buyA.status + '/' + buyB.status);
    assert(String(buyLosses[0].json.error).includes('đã có chủ'), 'người thua race mua phải báo đã có chủ');
    await moveTo(ra.playerId, raceHouse.x, raceHouse.z);
    await moveTo(rb.playerId, raceHouse.x, raceHouse.z);
    st = await get('/api/state?room=QUAN5');
    const raceWinner = buyA.status === 200 ? 'RaceA' : 'RaceB';
    assert(st.json.houses[raceHouse.id].ownerName === raceWinner, 'chủ nhà race phải là người thắng, nhận ' + st.json.houses[raceHouse.id].ownerName);

    // Race mua lại: 2 người cùng mua lại 1 nhà, mỗi người chỉ đủ tiền cho
    // lần mua lại đầu (không đủ cho lần hai sau khi giá tăng), chỉ 1 thắng.
    currentStep = 'race mua lại';
    const target = raceHouse;
    const targetPrice = S.housePrice(target, mapRes.json.origin.scale_units_per_meter);
    const firstTake = S.takeoverPrice(targetPrice);
    const secondTake = S.takeoverPrice(firstTake);
    // Mỗi người mua lại mua 1 nhà rẻ khác để hạ tiền mặt xuống dưới giá
    // mua lại lần hai nhưng vẫn đủ cho lần đầu.
    const walletHouseA = byPrice.find((b) => b.id !== cheap.id && b.id !== target.id && S.housePrice(b, mapRes.json.origin.scale_units_per_meter) <= 100000 - firstTake);
    const walletHouseB = byPrice.find((b) => b.id !== cheap.id && b.id !== target.id && b.id !== walletHouseA.id && S.housePrice(b, mapRes.json.origin.scale_units_per_meter) <= 100000 - firstTake);
    assert(walletHouseA && walletHouseB, 'phải có nhà rẻ để hạ tiền mặt cho test race mua lại');
    const ta = await joinAs('TakeA', 'shop-take-a');
    const tb = await joinAs('TakeB', 'shop-take-b');
    await moveTo(ta.playerId, walletHouseA.x, walletHouseA.z);
    const wa = await house(ta.playerId, 'buy', walletHouseA.id);
    assert(wa.status === 200, 'TakeA mua nhà hạ tiền phải 200');
    await sleep(1100);
    await moveTo(tb.playerId, walletHouseB.x, walletHouseB.z);
    const wb = await house(tb.playerId, 'buy', walletHouseB.id);
    assert(wb.status === 200, 'TakeB mua nhà hạ tiền phải 200');
    const moneyA = wa.json.tien;
    const moneyB = wb.json.tien;
    assert(moneyA >= firstTake && moneyA < secondTake, 'TakeA phải đủ lần đầu (' + firstTake + ') nhưng không đủ lần hai (' + secondTake + '), có ' + moneyA);
    assert(moneyB >= firstTake && moneyB < secondTake, 'TakeB phải đủ lần đầu (' + firstTake + ') nhưng không đủ lần hai (' + secondTake + '), có ' + moneyB);
    await moveTo(ta.playerId, target.x, target.z);
    await moveTo(tb.playerId, target.x, target.z);
    await sleep(1100);
    const [takeA, takeB] = await Promise.all([
      house(ta.playerId, 'takeover', target.id),
      house(tb.playerId, 'takeover', target.id)
    ]);
    const takeWins = [takeA, takeB].filter((r) => r.status === 200);
    const takeLosses = [takeA, takeB].filter((r) => r.status === 400);
    assert(takeWins.length === 1 && takeLosses.length === 1, 'race mua lại phải đúng 1 thắng 1 thua, nhận ' + takeA.status + '/' + takeB.status + ' ' + JSON.stringify(takeA.json) + ' ' + JSON.stringify(takeB.json));
    await moveTo(ta.playerId, target.x, target.z);
    await moveTo(tb.playerId, target.x, target.z);
    st = await get('/api/state?room=QUAN5');
    assert(st.json.houses[target.id].price === firstTake, 'sau race mua lại, giá nhà phải là giá lần đầu ' + firstTake + ' (không bị mua lại lần hai), nhận ' + st.json.houses[target.id].price);
    const takeWinner = takeA.status === 200 ? 'TakeA' : 'TakeB';
    assert(st.json.houses[target.id].ownerName === takeWinner, 'chủ nhà race mua lại phải là người thắng');

    console.log('SHOP SMOKE PASS: mua → biển → doanh thu → cooldown → mua lại → bảng → race đều đúng, nhà test=' + cheap.id + ', giá=' + cheapPrice + ', giá mua lại=' + newPrice + ', tiền trả chủ cũ=' + payout);
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
      console.error('Không dọn được thư mục tạm shop smoke test: ' + e.message);
    }
  }
}

main().catch((e) => {
  console.error('SHOP SMOKE FAIL tại bước: ' + currentStep);
  console.error(e && e.stack ? e.stack : e.message);
  console.error('--- server stderr (cuối) ---');
  console.error(shopStderr.slice(-3000));
  process.exit(1);
});
