// Cấu hình server. Các hằng số dùng chung với client (giá nhà, bề rộng
// đường, giới hạn, v.v.) sống ở shared-core, không được định nghĩa lại ở
// đây. File này chỉ chứa cấu hình riêng của server và cách đọc PORT.
const path = require('path');
const S = require('../public/js/shared-core.js');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const MAP_PATH = path.join(PUBLIC_DIR, 'quan5-map.json');
const ECONOMY_PATH = path.join(ROOT_DIR, 'economy.json');
const HOST = '127.0.0.1';

function readPort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === '') {
    return 3102;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(
      'Biến môi trường PORT không hợp lệ: "' + raw + '". ' +
      'PORT phải là số nguyên từ 1 đến 65535, hoặc bỏ trống để dùng 3102.'
    );
  }
  return n;
}

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR,
  MAP_PATH,
  ECONOMY_PATH,
  HOST,
  readPort,
  // Re-export các hằng số dùng chung để handler chỉ import từ một nơi.
  BOUNDS: S.BOUNDS,
  SPAWN: S.SPAWN,
  START_TIEN: S.START_TIEN,
  CHECKIN_TIEN: S.CHECKIN_TIEN,
  SELL_RATE: S.SELL_RATE,
  CHECKIN_SERVER_MAX_DISTANCE: S.CHECKIN_SERVER_MAX_DISTANCE,
  HOUSE_SERVER_MAX_DISTANCE: S.HOUSE_SERVER_MAX_DISTANCE,
  ACTION_COOLDOWN_MS: S.ACTION_COOLDOWN_MS,
  RATE_LIMIT_WINDOW_MS: S.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_ACTIONS: S.RATE_LIMIT_MAX_ACTIONS,
  PRUNE_MS: S.PRUNE_MS,
  MAX_BODY_BYTES: S.MAX_BODY_BYTES,
  MAX_EVENTS: S.MAX_EVENTS,
  SHARED: S
};
