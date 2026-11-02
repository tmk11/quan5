// Thành phố Quận 5 Online — nhiều người cùng chơi, theo khung Chùa Online.
// Không dùng npm, chỉ dùng module có sẵn của Node.
// Phòng/người chơi trong phiên vẫn chỉ giữ trong RAM (restart là mất, như cũ).
// RIÊNG tiền và nhà ở thì lưu bền trong economy.json (v1, 2026-11-02 tối):
// restart server không mất nhà đã mua, không mất tiền. Tiền là tiền trong game,
// không phải tiền thật. Chủ nhà và tiền gắn với deviceId của trình duyệt
// (lưu ở localStorage), không có mật khẩu ở v1 — ai dùng cùng thiết bị/trình
// duyệt thì dùng chung ví, xóa localStorage là mất ví.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3102;
const HOST = '127.0.0.1';
const MAX_BODY = 10 * 1024;
const PRUNE_MS = 25 * 1000;

const NAMES = ['Bé Ba','Cô Ba Chợ Lớn','Chú Tám','Tí Lồng Đèn','Chị Hai','Anh Tư','Bé Hủ Tiếu','Cô Năm','Cậu Bảy','Bé Sen','Chú Sáu','Dì Ba','Tèo','Bé Mít','Anh Ba'];
const LANDMARKS = ['Chợ Bình Tây','Chợ An Đông','Chợ Kim Biên','Chùa Bà Thiên Hậu','Hội quán Nghĩa An','Công viên Văn Lang','Phố lồng đèn Lương Nhữ Học','Phố Đông y Hải Thượng Lãn Ông','Bến xe Chợ Lớn','Chợ Hòa Bình','Bệnh viện Chợ Rẫy'];

// type -> { diem, checkin, message }
const ACTIONS = {
  chao:    { diem: 1, message: 'đã vẫy tay chào mọi người' },
  an:      { diem: 2, message: 'đã ăn một tô hủ tiếu Chợ Lớn' },
  cafe:    { diem: 2, message: 'đã uống cà phê vợt' },
  mua:     { diem: 3, message: 'đã mua một chiếc lồng đèn' },
  muasam:  { diem: 3, message: 'đã mua sắm ở phố' },
  chup:    { diem: 1, message: 'đã chụp một tấm ảnh kỷ niệm' },
  checkin: { diem: 10, checkin: 1, message: 'đã check-in' },
  buoi:    { diem: 0, message: 'đã đổi buổi trong thành phố' },
};
const ALIASES = { 'chào': 'chao', 'ăn': 'an', 'cà phê': 'cafe', 'mua lồng đèn': 'mua', 'mua sắm': 'muasam', 'chụp ảnh': 'chup', 'check-in': 'checkin', 'checkin': 'checkin', 'đổi buổi': 'buoi' };
const BUOI_VALUES = { sang: 'sang', 'hoang-hon': 'hoang-hon', dem: 'dem' };
const BUOI_ALIASES = { 'sáng': 'sang', 'sang': 'sang', 'hoàng hôn': 'hoang-hon', 'chiều': 'hoang-hon', 'chieu': 'hoang-hon', 'đêm': 'dem', 'dem': 'dem', 'tối': 'dem' };

const rooms = new Map();

// ---------- Kinh tế nhà ở v1 ----------
// Giá nhà tính từ diện tích footprint thật, PHẢI khớp đúng với client
// (client dùng cùng công thức từ cùng dữ liệu nhà trong quan5-map.json).
// area_m2 = (hw*2 * hd*2) / SCALE^2, giá = 20.000 + area*300, làm tròn nghìn,
// sàn 20.000, trần 1.000.000. Nhà nhỏ ~80m2 -> ~45.000, nhà ~400m2 -> ~144.000.
const ECONOMY_PATH = path.join(__dirname, 'economy.json');
const START_TIEN = 100000;
const CHECKIN_TIEN = 5000;
const SELL_RATE = 0.8;
const economy = { players: {}, houses: {} };
function loadEconomy() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ECONOMY_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      if (parsed.players && typeof parsed.players === 'object') economy.players = parsed.players;
      if (parsed.houses && typeof parsed.houses === 'object') economy.houses = parsed.houses;
    }
  } catch { /* chưa có file hoặc file hỏng -> bắt đầu trống */ }
}
function saveEconomy() {
  try { const tmp = ECONOMY_PATH + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(economy)); fs.renameSync(tmp, ECONOMY_PATH); }
  catch (e) { console.error('Không lưu được economy.json:', e.message); }
}
let cachedMap = null, cachedMapMtime = 0;
function getMap() {
  try {
    const p = path.join(__dirname, 'public', 'quan5-map.json');
    const st = fs.statSync(p);
    if (!cachedMap || st.mtimeMs !== cachedMapMtime) { cachedMap = JSON.parse(fs.readFileSync(p, 'utf8')); cachedMapMtime = st.mtimeMs; }
    return cachedMap;
  } catch { return cachedMap; }
}
function housePrice(b, map) {
  const scale = (map && map.origin && map.origin.scale_units_per_meter) || (280 / 4018);
  const area = ((b.hw * 2) * (b.hd * 2)) / (scale * scale);
  const p = Math.round((20000 + area * 300) / 1000) * 1000;
  return Math.max(20000, Math.min(1000000, p));
}
function findHouse(houseId) {
  const map = getMap();
  if (!map || !Array.isArray(map.buildings)) return null;
  const b = map.buildings.find((x) => x.id === houseId);
  return b ? { building: b, map, price: housePrice(b, map) } : null;
}
function pointInPolyGame(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
function homeSpawn(house, map) {
  // Spawn ngay ngoài nhà (cách mép nhà 2 đơn vị), thử 4 hướng, lấy hướng
  // đầu tiên còn trong ranh Quận 5; không hướng nào vừa thì về điểm mặc định.
  const offs = [[0, house.hd + 2], [0, -(house.hd + 2)], [house.hw + 2, 0], [-(house.hw + 2), 0]];
  for (const [dx, dz] of offs) {
    const x = Math.max(-140, Math.min(140, house.x + dx)), z = Math.max(-75, Math.min(75, house.z + dz));
    if (!map.boundary || !map.boundary.length || pointInPolyGame(x, z, map.boundary)) return { x, z };
  }
  return { x: 25, z: -10 };
}
function cleanupOrphans() {
  // Nhà bị bỏ khỏi bản đồ trong một lần cập nhật sau thì hoàn tiền cho chủ
  // theo đúng giá đã mua, và xóa nhà khỏi sổ — chủ không mất tiền oan.
  const map = getMap();
  if (!map || !Array.isArray(map.buildings)) return;
  const ids = new Set(map.buildings.map((b) => b.id));
  let changed = false;
  for (const hid of Object.keys(economy.houses)) {
    if (ids.has(hid)) continue;
    const rec = economy.houses[hid];
    const owner = economy.players[rec.owner];
    if (owner) { owner.tien = (Number(owner.tien) || 0) + (Number(rec.price) || 0); if (owner.home === hid) owner.home = null; }
    delete economy.houses[hid];
    changed = true;
  }
  if (changed) saveEconomy();
}
function getOrCreateEconPlayer(deviceId, name) {
  let rec = economy.players[deviceId];
  if (!rec) { rec = { name, tien: START_TIEN, home: null }; economy.players[deviceId] = rec; saveEconomy(); }
  else if (name && rec.name !== name) { rec.name = name; saveEconomy(); }
  return rec;
}
function normalizeRoom(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{1,12}$/.test(code) ? code : null;
}
function getRoom(code) {
  if (!rooms.has(code)) rooms.set(code, { buoi: 'sang', players: new Map(), events: [] });
  return rooms.get(code);
}
function prune(room) {
  const now = Date.now();
  for (const [id, p] of room.players) if (now - p.lastSeen > PRUNE_MS) room.players.delete(id);
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, robe: p.robe, skin: p.skin, x: p.x, z: p.z, rot: p.rot, pose: p.pose, diem: p.diem, checkin: p.checkin, tien: p.tien || 0, home: p.home || null };
}
function pickName(room) {
  const used = new Set([...room.players.values()].map((p) => p.name));
  const free = NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  for (let i = 2; i < 100; i++) { const c = NAMES[0] + ' ' + i; if (!used.has(c)) return c; }
  return NAMES[0] + ' ' + Date.now();
}
function sendJson(res, status, obj) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function readBody(req, res) {
  return new Promise((resolve) => {
    let size = 0; const chunks = []; let rejected = false;
    req.on('data', (chunk) => { size += chunk.length; if (size > MAX_BODY && !rejected) { rejected = true; sendJson(res, 413, { error: 'Body quá lớn (tối đa 10KB)' }); req.destroy(); resolve(null); return; } chunks.push(chunk); });
    req.on('end', () => { if (rejected) return; const text = Buffer.concat(chunks).toString('utf8'); if (!text) return resolve({}); try { const parsed = JSON.parse(text); if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) { sendJson(res, 400, { error: 'Body phải là một JSON object' }); return resolve(null); } resolve(parsed); } catch { sendJson(res, 400, { error: 'JSON không hợp lệ' }); resolve(null); } });
    req.on('error', () => { if (!rejected) resolve(null); });
  });
}
function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function validColor(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (req.method === 'GET' && pathname === '/') {
    try { const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html')); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
    catch { sendJson(res, 500, { error: 'Không tìm thấy public/index.html' }); }
    return;
  }
  if (req.method === 'GET' && pathname === '/quan5-map.json') {
    try { const data = fs.readFileSync(path.join(__dirname, 'public', 'quan5-map.json')); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(data); }
    catch { sendJson(res, 500, { error: 'Không tìm thấy public/quan5-map.json' }); }
    return;
  }
  if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true });
  if (req.method === 'POST' && pathname === '/api/join') {
    const body = await readBody(req, res); if (body === null) return;
    const roomCode = normalizeRoom(body.room); if (!roomCode) return sendJson(res, 400, { error: 'Mã phòng không hợp lệ (chỉ chữ/số, tối đa 12 ký tự)' });
    const room = getRoom(roomCode); prune(room);
    let name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : '';
    if (!name) name = pickName(room);
    const deviceId = (typeof body.deviceId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.deviceId)) ? body.deviceId : (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const econ = getOrCreateEconPlayer(deviceId, name);
    // Spawn: nếu đã có nhà chính và nhà còn trên bản đồ thì spawn ngay ngoài
    // nhà đó; không thì spawn mặc định gần Chợ An Đông như cũ.
    let spawn = { x: 25, z: -10 };
    if (econ.home) { const found = findHouse(econ.home); if (found) spawn = homeSpawn(found.building, found.map); else econ.home = null; }
    const player = { id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'), name, robe: validColor(body.robe) || '#e0651f', skin: validColor(body.skin) || '#ffe0bd', x: spawn.x, z: spawn.z, rot: 0, pose: 'dung', diem: 0, checkin: 0, deviceId, tien: econ.tien, home: econ.home, lastSeen: Date.now() };
    room.players.set(player.id, player);
    return sendJson(res, 200, { playerId: player.id, name: player.name, room: roomCode, deviceId, tien: econ.tien, home: econ.home, x: spawn.x, z: spawn.z });
  }
  if (req.method === 'POST' && pathname === '/api/heartbeat') {
    const body = await readBody(req, res); if (body === null) return;
    const roomCode = normalizeRoom(body.room); if (!roomCode) return sendJson(res, 400, { error: 'Mã phòng không hợp lệ' });
    const room = rooms.get(roomCode); const player = room ? room.players.get(body.playerId) : undefined;
    if (!player) return sendJson(res, 404, { error: 'Không tìm thấy người chơi trong phòng' });
    player.x = clamp(num(body.x, player.x), -140, 140);
    player.z = clamp(num(body.z, player.z), -75, 75);
    player.rot = num(body.rot, player.rot);
    if (typeof body.pose === 'string' && body.pose.length <= 20) player.pose = body.pose;
    player.lastSeen = Date.now();
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && pathname === '/api/action') {
    const body = await readBody(req, res); if (body === null) return;
    const roomCode = normalizeRoom(body.room); if (!roomCode) return sendJson(res, 400, { error: 'Mã phòng không hợp lệ' });
    const room = rooms.get(roomCode); const player = room ? room.players.get(body.playerId) : undefined;
    if (!player) return sendJson(res, 404, { error: 'Không tìm thấy người chơi trong phòng' });
    const rawType = typeof body.type === 'string' ? body.type.trim() : '';
    const type = ACTIONS[rawType] ? rawType : ALIASES[rawType];
    if (!type || !ACTIONS[type]) return sendJson(res, 400, { error: 'Loại hành động không hợp lệ' });
    const spec = ACTIONS[type];
    player.diem += spec.diem || 0; player.checkin += spec.checkin || 0; player.lastSeen = Date.now();
    // Check-in vừa +điểm như cũ, vừa +tiền để dành mua nhà.
    if (type === 'checkin' && player.deviceId) {
      const econ = economy.players[player.deviceId];
      if (econ) { econ.tien = (Number(econ.tien) || 0) + CHECKIN_TIEN; player.tien = econ.tien; saveEconomy(); }
    }
    let place = '';
    if (type === 'checkin') { const v = typeof body.value === 'string' ? body.value.trim().slice(0, 40) : ''; place = LANDMARKS.includes(v) ? v : 'một địa điểm ở Quận 5'; }
    if (type === 'buoi') { const v = typeof body.value === 'string' ? body.value.trim().toLowerCase() : ''; const normalized = BUOI_VALUES[v] || BUOI_ALIASES[v]; if (normalized) room.buoi = normalized; }
    const msg = type === 'checkin' ? (player.name + ' đã check-in tại ' + place + ' (+' + CHECKIN_TIEN.toLocaleString('vi-VN') + 'đ)') : (player.name + ' ' + spec.message);
    room.events.push({ at: Date.now(), playerId: player.id, name: player.name, type, message: msg, value: place || undefined });
    room.events = room.events.slice(-30);
    return sendJson(res, 200, { ok: true, diem: player.diem, checkin: player.checkin, buoi: room.buoi, tien: player.tien || 0 });
  }
  if (req.method === 'POST' && pathname === '/api/house') {
    const body = await readBody(req, res); if (body === null) return;
    const roomCode = normalizeRoom(body.room); if (!roomCode) return sendJson(res, 400, { error: 'Mã phòng không hợp lệ' });
    const room = rooms.get(roomCode); const player = room ? room.players.get(body.playerId) : undefined;
    if (!player) return sendJson(res, 404, { error: 'Không tìm thấy người chơi trong phòng' });
    const action = body.action;
    if (action !== 'buy' && action !== 'sell' && action !== 'sethome') return sendJson(res, 400, { error: 'Hành động nhà không hợp lệ (buy/sell/sethome)' });
    const houseId = typeof body.houseId === 'string' ? body.houseId : '';
    cleanupOrphans();
    const found = findHouse(houseId);
    if (!found) return sendJson(res, 404, { error: 'Không tìm thấy nhà này trên bản đồ hiện tại' });
    const econ = getOrCreateEconPlayer(player.deviceId, player.name);
    player.lastSeen = Date.now();
    if (action === 'buy') {
      if (economy.houses[houseId]) return sendJson(res, 400, { error: 'Nhà này đã có chủ: ' + (economy.houses[houseId].ownerName || '') });
      if ((Number(econ.tien) || 0) < found.price) return sendJson(res, 400, { error: 'Không đủ tiền. Nhà này ' + found.price.toLocaleString('vi-VN') + 'đ, bạn có ' + (Number(econ.tien) || 0).toLocaleString('vi-VN') + 'đ' });
      econ.tien -= found.price; econ.home = houseId;
      economy.houses[houseId] = { owner: player.deviceId, ownerName: player.name, price: found.price };
      player.tien = econ.tien; player.home = houseId;
      saveEconomy();
      const label = found.building.name || 'một ngôi nhà';
      room.events.push({ at: Date.now(), playerId: player.id, name: player.name, type: 'house', message: player.name + ' đã mua ' + label + ' (' + found.price.toLocaleString('vi-VN') + 'đ) và dọn vào ở' });
      room.events = room.events.slice(-30);
      return sendJson(res, 200, { ok: true, tien: econ.tien, home: houseId, houseId, price: found.price });
    }
    if (action === 'sell') {
      const rec = economy.houses[houseId];
      if (!rec || rec.owner !== player.deviceId) return sendJson(res, 400, { error: 'Bạn không phải chủ nhà này nên không bán được' });
      const refund = Math.round((Number(rec.price) || 0) * SELL_RATE / 1000) * 1000;
      econ.tien = (Number(econ.tien) || 0) + refund;
      if (econ.home === houseId) econ.home = null;
      delete economy.houses[houseId];
      player.tien = econ.tien; player.home = econ.home;
      saveEconomy();
      const label = found.building.name || 'một ngôi nhà';
      room.events.push({ at: Date.now(), playerId: player.id, name: player.name, type: 'house', message: player.name + ' đã bán ' + label + ' (nhận lại ' + refund.toLocaleString('vi-VN') + 'đ, 80% giá mua)' });
      room.events = room.events.slice(-30);
      return sendJson(res, 200, { ok: true, tien: econ.tien, home: econ.home, houseId, refund });
    }
    // sethome
    const rec = economy.houses[houseId];
    if (!rec || rec.owner !== player.deviceId) return sendJson(res, 400, { error: 'Bạn không phải chủ nhà này nên không đặt làm nhà chính được' });
    econ.home = houseId; player.home = houseId;
    saveEconomy();
    return sendJson(res, 200, { ok: true, tien: econ.tien, home: houseId, houseId });
  }
  if (req.method === 'GET' && pathname === '/api/state') {
    const roomCode = normalizeRoom(url.searchParams.get('room')); if (!roomCode) return sendJson(res, 400, { error: 'Thiếu mã phòng hợp lệ' });
    const room = rooms.get(roomCode); if (!room) { cleanupOrphans(); return sendJson(res, 200, { players: [], events: [], buoi: 'sang', houses: economy.houses }); }
    prune(room);
    cleanupOrphans();
    // Đồng bộ tiền/nhà chính từ sổ kinh tế vào phiên chơi (để sau khi hoàn
    // tiền do nhà bị bỏ khỏi bản đồ thì người chơi thấy đúng số tiền ngay).
    for (const p of room.players.values()) {
      const econ = p.deviceId ? economy.players[p.deviceId] : null;
      if (econ) { p.tien = econ.tien; p.home = econ.home; }
    }
    return sendJson(res, 200, { players: [...room.players.values()].map(publicPlayer), events: room.events.slice(-30), buoi: room.buoi, houses: economy.houses });
  }
  return sendJson(res, 404, { error: 'Không tìm thấy' });
});
loadEconomy();
server.listen(PORT, HOST, () => { console.log('Quan 5 Online dang chay tai http://' + HOST + ':' + PORT + '/'); });
