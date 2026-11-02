// Thành phố Quận 5 Online — nhiều người cùng chơi, theo khung Chùa Online.
// Không dùng npm, chỉ dùng module có sẵn của Node. Dữ liệu chỉ giữ trong RAM.
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
  return { id: p.id, name: p.name, robe: p.robe, skin: p.skin, x: p.x, z: p.z, rot: p.rot, pose: p.pose, diem: p.diem, checkin: p.checkin };
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
    const player = { id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'), name, robe: validColor(body.robe) || '#e0651f', skin: validColor(body.skin) || '#ffe0bd', x: 25, z: -10, rot: 0, pose: 'dung', diem: 0, checkin: 0, lastSeen: Date.now() };
    room.players.set(player.id, player);
    return sendJson(res, 200, { playerId: player.id, name: player.name, room: roomCode });
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
    let place = '';
    if (type === 'checkin') { const v = typeof body.value === 'string' ? body.value.trim().slice(0, 40) : ''; place = LANDMARKS.includes(v) ? v : 'một địa điểm ở Quận 5'; }
    if (type === 'buoi') { const v = typeof body.value === 'string' ? body.value.trim().toLowerCase() : ''; const normalized = BUOI_VALUES[v] || BUOI_ALIASES[v]; if (normalized) room.buoi = normalized; }
    const msg = type === 'checkin' ? (player.name + ' đã check-in tại ' + place) : (player.name + ' ' + spec.message);
    room.events.push({ at: Date.now(), playerId: player.id, name: player.name, type, message: msg, value: place || undefined });
    room.events = room.events.slice(-30);
    return sendJson(res, 200, { ok: true, diem: player.diem, checkin: player.checkin, buoi: room.buoi });
  }
  if (req.method === 'GET' && pathname === '/api/state') {
    const roomCode = normalizeRoom(url.searchParams.get('room')); if (!roomCode) return sendJson(res, 400, { error: 'Thiếu mã phòng hợp lệ' });
    const room = rooms.get(roomCode); if (!room) return sendJson(res, 200, { players: [], events: [], buoi: 'sang' });
    prune(room);
    return sendJson(res, 200, { players: [...room.players.values()].map(publicPlayer), events: room.events.slice(-30), buoi: room.buoi });
  }
  return sendJson(res, 404, { error: 'Không tìm thấy' });
});
server.listen(PORT, HOST, () => { console.log('Quan 5 Online dang chay tai http://' + HOST + ':' + PORT + '/'); });
