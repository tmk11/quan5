// Quan5Shared: nguồn sự thật duy nhất dùng chung cho server (Node) và
// client (trình duyệt). Mọi công thức, giới hạn và quy tắc validate phải
// sống ở đây, không được copy sang nơi khác rồi sửa lệch nhau.
// Cách dùng:
//   Node:    const S = require('./public/js/shared-core.js');
//   Browser: <script src="js/shared-core.js"></script> rồi dùng Quan5Shared,
//            hoặc dùng trực tiếp các tên toàn cục (const ở top-level của
//            classic script vẫn chia sẻ scope giữa các script).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.Quan5Shared = api;
  }
  root.Quan5Shared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------- Hằng số cốt lõi ----------
  var BOUNDS = { xMin: -140, xMax: 140, zMin: -75, zMax: 75 };
  var SPAWN = { x: 25, z: -10 };
  var SCALE_DEFAULT = 280 / 4018;
  var ROAD_WIDTH_FACTOR = 0.25;
  var ROAD_WIDTH_MIN = 1.8;
  var ROAD_WIDTH_MAX = 5.0;
  var PRICE_BASE = 20000;
  var PRICE_PER_M2 = 300;
  var PRICE_MIN = 20000;
  var PRICE_MAX = 1000000;
  var START_TIEN = 100000;
  var CHECKIN_TIEN = 5000;
  var SELL_RATE = 0.8;
  var CHECKIN_CLIENT_MAX_DISTANCE = 22;
  var CHECKIN_SERVER_MAX_DISTANCE = 30;
  var HOUSE_CLIENT_MAX_DISTANCE = 4;
  var HOUSE_SERVER_MAX_DISTANCE = 6;
  var ACTION_COOLDOWN_MS = 1000;
  var RATE_LIMIT_WINDOW_MS = 60000;
  var RATE_LIMIT_MAX_ACTIONS = 60;
  var PRUNE_MS = 25 * 1000;
  var MAX_BODY_BYTES = 10 * 1024;
  var MAX_EVENTS = 30;
  var MAX_NAME_LENGTH = 24;
  var POSES = ['dung', 'chao', 'chup', 'an', 'cafe', 'mua'];

  var ACTIONS = {
    chao: { diem: 1, message: 'đã vẫy tay chào mọi người' },
    an: { diem: 2, message: 'đã ăn một tô hủ tiếu Chợ Lớn' },
    cafe: { diem: 2, message: 'đã uống cà phê vợt' },
    mua: { diem: 3, message: 'đã mua một chiếc lồng đèn' },
    muasam: { diem: 3, message: 'đã mua sắm ở phố' },
    chup: { diem: 1, message: 'đã chụp một tấm ảnh kỷ niệm' },
    checkin: { diem: 10, checkin: 1, message: 'đã check-in' },
    buoi: { diem: 0, message: 'đã đổi buổi trong thành phố' }
  };
  var ALIASES = {
    'chào': 'chao', 'ăn': 'an', 'cà phê': 'cafe', 'mua lồng đèn': 'mua',
    'mua sắm': 'muasam', 'chụp ảnh': 'chup', 'check-in': 'checkin',
    'checkin': 'checkin', 'đổi buổi': 'buoi'
  };
  var BUOI_VALUES = { sang: 'sang', 'hoang-hon': 'hoang-hon', dem: 'dem' };
  var BUOI_ALIASES = {
    'sáng': 'sang', 'sang': 'sang', 'hoàng hôn': 'hoang-hon',
    'chiều': 'hoang-hon', 'chieu': 'hoang-hon', 'đêm': 'dem',
    'dem': 'dem', 'tối': 'dem'
  };
  var BUOI_LABELS = { sang: 'Sáng', 'hoang-hon': 'Hoàng hôn', dem: 'Đêm' };
  var NAMES = [
    'Bé Ba', 'Cô Ba Chợ Lớn', 'Chú Tám', 'Tí Lồng Đèn', 'Chị Hai', 'Anh Tư',
    'Bé Hủ Tiếu', 'Cô Năm', 'Cậu Bảy', 'Bé Sen', 'Chú Sáu', 'Dì Ba',
    'Tèo', 'Bé Mít', 'Anh Ba'
  ];

  var ROOM_CODE_RE = /^[A-Z0-9]{1,12}$/;
  var COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  var DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var PLAYER_ID_RE = /^[A-Za-z0-9-]{1,128}$/;
  var HOUSE_ID_RE = /^h\d+\.\d+_\d+\.\d+(_\d+)?$/;
  var BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];

  // ---------- Tiện ích số học và hình học ----------
  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function pointInPoly(x, z, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
  function distToSeg(px, pz, x1, z1, x2, z2) {
    var dx = x2 - x1, dz = z2 - z1, len2 = dx * dx + dz * dz;
    var t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2)) : 0;
    var cx = x1 + dx * t, cz = z1 + dz * t;
    return { d: Math.hypot(px - cx, pz - cz), x: cx, z: cz };
  }
  function boxDistance(px, pz, b) {
    var dx = px - b.x, dz = pz - b.z;
    var c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
    var lx = dx * c - dz * s, lz = dx * s + dz * c;
    var qx = Math.max(Math.abs(lx) - b.hw, 0);
    var qz = Math.max(Math.abs(lz) - b.hd, 0);
    return Math.hypot(qx, qz);
  }
  function roadWidthFromMeters(m) {
    var v = (Number(m) || 6) * ROAD_WIDTH_FACTOR;
    return Math.max(ROAD_WIDTH_MIN, Math.min(ROAD_WIDTH_MAX, v));
  }
  function housePrice(b, scale) {
    var s = isFiniteNumber(scale) && scale > 0 ? scale : SCALE_DEFAULT;
    var area = ((b.hw * 2) * (b.hd * 2)) / (s * s);
    var p = Math.round((PRICE_BASE + area * PRICE_PER_M2) / 1000) * 1000;
    return Math.max(PRICE_MIN, Math.min(PRICE_MAX, p));
  }
  function sellRefund(price) {
    return Math.round((Number(price) || 0) * SELL_RATE / 1000) * 1000;
  }
  function fmtMoney(n) {
    var v = Math.round(Number(n) || 0);
    try {
      return v.toLocaleString('vi-VN') + 'đ';
    } catch (e) {
      return String(v) + 'đ';
    }
  }
  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  // ---------- Validate: trả về { ok, value, error } ----------
  // Quy ước: mọi validator đều trả về object, không throw, để cả server
  // (chuyển thành AppError) và client (hiện lỗi inline) đều dùng được.
  function fail(error) {
    return { ok: false, value: null, error: error };
  }
  function ok(value) {
    return { ok: true, value: value, error: null };
  }
  function validateRoomCode(raw) {
    if (typeof raw !== 'string') {
      return fail('Mã phòng phải là chuỗi ký tự.');
    }
    var code = raw.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(code)) {
      return fail('Mã phòng không hợp lệ: chỉ gồm chữ và số, tối đa 12 ký tự.');
    }
    return ok(code);
  }
  function validatePlayerName(raw) {
    if (typeof raw !== 'string') {
      return fail('Tên người chơi phải là chuỗi ký tự.');
    }
    var name = raw.trim();
    if (name.length === 0) {
      return fail('Tên người chơi không được để trống.');
    }
    if (name.length > MAX_NAME_LENGTH) {
      return fail('Tên người chơi tối đa ' + MAX_NAME_LENGTH + ' ký tự.');
    }
    if (/[<>&"'`]/.test(name)) {
      return fail('Tên người chơi không được chứa ký tự < > & " \' `.');
    }
    for (var i = 0; i < name.length; i++) {
      if (name.charCodeAt(i) < 32) {
        return fail('Tên người chơi không được chứa ký tự điều khiển.');
      }
    }
    return ok(name);
  }
  function validateColor(raw) {
    if (typeof raw !== 'string' || !COLOR_RE.test(raw)) {
      return fail('Màu không hợp lệ: phải có dạng #RRGGBB.');
    }
    return ok(raw);
  }
  function validateDeviceId(raw) {
    if (typeof raw !== 'string' || !DEVICE_ID_RE.test(raw)) {
      return fail('Mã thiết bị không hợp lệ.');
    }
    if (BLOCKED_KEYS.indexOf(raw.toLowerCase()) !== -1) {
      return fail('Mã thiết bị không hợp lệ.');
    }
    return ok(raw);
  }
  function validatePlayerId(raw) {
    if (typeof raw !== 'string' || !PLAYER_ID_RE.test(raw)) {
      return fail('Mã người chơi không hợp lệ.');
    }
    return ok(raw);
  }
  function validateHouseId(raw) {
    if (typeof raw !== 'string' || !HOUSE_ID_RE.test(raw)) {
      return fail('Mã nhà không hợp lệ.');
    }
    return ok(raw);
  }
  function validateActionType(raw) {
    if (typeof raw !== 'string') {
      return fail('Loại hành động không hợp lệ.');
    }
    var t = raw.trim();
    var type = ACTIONS[t] ? t : ALIASES[t];
    if (!type || !ACTIONS[type]) {
      return fail('Loại hành động không hợp lệ: ' + t + '.');
    }
    return ok(type);
  }
  function validateBuoiValue(raw) {
    if (typeof raw !== 'string') {
      return fail('Giá trị buổi không hợp lệ.');
    }
    var v = raw.trim().toLowerCase();
    var normalized = BUOI_VALUES[v] || BUOI_ALIASES[v];
    if (!normalized) {
      return fail('Giá trị buổi không hợp lệ: chỉ nhận sáng, hoàng hôn, đêm.');
    }
    return ok(normalized);
  }
  function validatePose(raw) {
    if (typeof raw !== 'string' || POSES.indexOf(raw) === -1) {
      return fail('Tư thế không hợp lệ.');
    }
    return ok(raw);
  }
  function validateCoordinate(raw, fallback, lo, hi, label) {
    if (raw === undefined || raw === null) {
      return ok(fallback);
    }
    var n = Number(raw);
    if (!Number.isFinite(n)) {
      return fail(label + ' phải là số hợp lệ.');
    }
    return ok(clamp(n, lo, hi));
  }
  function validateBodyObject(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return fail('Body phải là một JSON object.');
    }
    return ok(body);
  }

  // ---------- Schema cho quan5-map.json ----------
  function validateMap(map) {
    var errors = [];
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return { ok: false, errors: ['Bản đồ không phải là một JSON object.'] };
    }
    if (!map.origin || !isFiniteNumber(map.origin.scale_units_per_meter) || map.origin.scale_units_per_meter <= 0) {
      errors.push('Bản đồ thiếu origin.scale_units_per_meter hợp lệ.');
    }
    if (!Array.isArray(map.boundary) || map.boundary.length < 3) {
      errors.push('Bản đồ thiếu boundary hợp lệ (ít nhất 3 điểm).');
    } else {
      map.boundary.forEach(function (p, i) {
        if (!Array.isArray(p) || p.length < 2 || !isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) {
          errors.push('Boundary tại vị trí ' + i + ' không phải là [x, z] hợp lệ.');
        }
      });
    }
    if (!Array.isArray(map.roads)) {
      errors.push('Bản đồ thiếu roads (phải là mảng).');
    } else {
      map.roads.forEach(function (r, i) {
        if (!r || !Array.isArray(r.pts) || r.pts.length < 2) {
          errors.push('Đường tại vị trí ' + i + ' thiếu pts hợp lệ.');
        }
        if (!isFiniteNumber(r.width_m) || r.width_m <= 0) {
          errors.push('Đường tại vị trí ' + i + ' thiếu width_m hợp lệ.');
        }
      });
    }
    if (!Array.isArray(map.buildings)) {
      errors.push('Bản đồ thiếu buildings (phải là mảng).');
    } else {
      var seen = {};
      map.buildings.forEach(function (b, i) {
        if (!b || typeof b.id !== 'string' || !HOUSE_ID_RE.test(b.id)) {
          errors.push('Nhà tại vị trí ' + i + ' thiếu id hợp lệ.');
        } else if (seen[b.id]) {
          errors.push('Nhà bị trùng id: ' + b.id + '.');
        } else {
          seen[b.id] = true;
        }
        ['x', 'z', 'hw', 'hd', 'h'].forEach(function (k) {
          if (!isFiniteNumber(b[k])) {
            errors.push('Nhà ' + (b.id || i) + ' thiếu ' + k + ' hợp lệ.');
          }
        });
        if (isFiniteNumber(b.hw) && b.hw <= 0) {
          errors.push('Nhà ' + (b.id || i) + ' có hw không dương.');
        }
        if (isFiniteNumber(b.hd) && b.hd <= 0) {
          errors.push('Nhà ' + (b.id || i) + ' có hd không dương.');
        }
      });
    }
    if (!Array.isArray(map.landmarks)) {
      errors.push('Bản đồ thiếu landmarks (phải là mảng).');
    } else {
      map.landmarks.forEach(function (l, i) {
        if (!l || typeof l.name !== 'string' || !isFiniteNumber(l.x) || !isFiniteNumber(l.z)) {
          errors.push('Landmark tại vị trí ' + i + ' thiếu name, x, z hợp lệ.');
        }
      });
    }
    if (map.waters !== undefined && !Array.isArray(map.waters)) {
      errors.push('Bản đồ có waters nhưng không phải là mảng.');
    }
    if (map.parks !== undefined && !Array.isArray(map.parks)) {
      errors.push('Bản đồ có parks nhưng không phải là mảng.');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // ---------- Schema cho economy.json ----------
  function validateEconomy(data) {
    var errors = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, errors: ['Dữ liệu kinh tế không phải là một JSON object.'] };
    }
    if (data.players !== undefined && (typeof data.players !== 'object' || data.players === null || Array.isArray(data.players))) {
      errors.push('Dữ liệu kinh tế có players nhưng không phải là object.');
    } else if (data.players) {
      Object.keys(data.players).forEach(function (k) {
        if (BLOCKED_KEYS.indexOf(k.toLowerCase()) !== -1) {
          errors.push('Mã thiết bị không hợp lệ trong sổ kinh tế: ' + k + '.');
          return;
        }
        var p = data.players[k];
        if (!p || typeof p !== 'object') {
          errors.push('Ví của ' + k + ' không phải là object.');
          return;
        }
        if (!isFiniteNumber(p.tien) || p.tien < 0) {
          errors.push('Ví của ' + k + ' có số tiền không hợp lệ.');
        }
        if (p.home !== null && p.home !== undefined && typeof p.home !== 'string') {
          errors.push('Ví của ' + k + ' có nhà chính không hợp lệ.');
        }
      });
    }
    if (data.houses !== undefined && (typeof data.houses !== 'object' || data.houses === null || Array.isArray(data.houses))) {
      errors.push('Dữ liệu kinh tế có houses nhưng không phải là object.');
    } else if (data.houses) {
      Object.keys(data.houses).forEach(function (k) {
        var h = data.houses[k];
        if (!h || typeof h !== 'object') {
          errors.push('Sổ nhà ' + k + ' không phải là object.');
          return;
        }
        if (typeof h.owner !== 'string' || h.owner.length === 0) {
          errors.push('Sổ nhà ' + k + ' thiếu owner hợp lệ.');
        }
        if (!isFiniteNumber(h.price) || h.price < 0) {
          errors.push('Sổ nhà ' + k + ' có giá không hợp lệ.');
        }
      });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  return {
    BOUNDS: BOUNDS,
    SPAWN: SPAWN,
    SCALE_DEFAULT: SCALE_DEFAULT,
    ROAD_WIDTH_FACTOR: ROAD_WIDTH_FACTOR,
    ROAD_WIDTH_MIN: ROAD_WIDTH_MIN,
    ROAD_WIDTH_MAX: ROAD_WIDTH_MAX,
    PRICE_BASE: PRICE_BASE,
    PRICE_PER_M2: PRICE_PER_M2,
    PRICE_MIN: PRICE_MIN,
    PRICE_MAX: PRICE_MAX,
    START_TIEN: START_TIEN,
    CHECKIN_TIEN: CHECKIN_TIEN,
    SELL_RATE: SELL_RATE,
    CHECKIN_CLIENT_MAX_DISTANCE: CHECKIN_CLIENT_MAX_DISTANCE,
    CHECKIN_SERVER_MAX_DISTANCE: CHECKIN_SERVER_MAX_DISTANCE,
    HOUSE_CLIENT_MAX_DISTANCE: HOUSE_CLIENT_MAX_DISTANCE,
    HOUSE_SERVER_MAX_DISTANCE: HOUSE_SERVER_MAX_DISTANCE,
    ACTION_COOLDOWN_MS: ACTION_COOLDOWN_MS,
    RATE_LIMIT_WINDOW_MS: RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_ACTIONS: RATE_LIMIT_MAX_ACTIONS,
    PRUNE_MS: PRUNE_MS,
    MAX_BODY_BYTES: MAX_BODY_BYTES,
    MAX_EVENTS: MAX_EVENTS,
    MAX_NAME_LENGTH: MAX_NAME_LENGTH,
    POSES: POSES,
    ACTIONS: ACTIONS,
    ALIASES: ALIASES,
    BUOI_VALUES: BUOI_VALUES,
    BUOI_ALIASES: BUOI_ALIASES,
    BUOI_LABELS: BUOI_LABELS,
    NAMES: NAMES,
    BLOCKED_KEYS: BLOCKED_KEYS,
    isFiniteNumber: isFiniteNumber,
    clamp: clamp,
    pointInPoly: pointInPoly,
    distToSeg: distToSeg,
    boxDistance: boxDistance,
    roadWidthFromMeters: roadWidthFromMeters,
    housePrice: housePrice,
    sellRefund: sellRefund,
    fmtMoney: fmtMoney,
    escapeHtml: escapeHtml,
    hashStr: hashStr,
    validateRoomCode: validateRoomCode,
    validatePlayerName: validatePlayerName,
    validateColor: validateColor,
    validateDeviceId: validateDeviceId,
    validatePlayerId: validatePlayerId,
    validateHouseId: validateHouseId,
    validateActionType: validateActionType,
    validateBuoiValue: validateBuoiValue,
    validatePose: validatePose,
    validateCoordinate: validateCoordinate,
    validateBodyObject: validateBodyObject,
    validateMap: validateMap,
    validateEconomy: validateEconomy
  };
});
