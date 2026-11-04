// Validate phía server: mọi hàm require* đều throw AppError với message
// tiếng Việt cụ thể khi đầu vào không hợp lệ. Không có trường hợp nào
// validate thất bại mà vẫn âm thầm dùng giá trị mặc định, trừ những trường
// hợp được ghi rõ là optional (tên trống thì chọn tên ngẫu nhiên, màu trống
// thì dùng màu mặc định, tọa độ trống thì giữ vị trí hiện tại).
const crypto = require('crypto');
const S = require('../public/js/shared-core.js');
const { badRequest } = require('./errors.js');

function requireOrThrow(result) {
  if (!result.ok) {
    throw badRequest(result.error);
  }
  return result.value;
}
function requireRoomCode(raw) {
  return requireOrThrow(S.validateRoomCode(raw));
}
function requirePlayerNameOrNull(raw) {
  // Join: tên trống nghĩa là để server chọn tên ngẫu nhiên, không phải lỗi.
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  return requireOrThrow(S.validatePlayerName(raw));
}
function requireColorOrDefault(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  return requireOrThrow(S.validateColor(raw));
}
function requireDeviceIdOrGenerate(raw) {
  // Phân biệt rõ: không gửi deviceId thì server cấp mới (tương thích client
  // cũ), gửi deviceId sai định dạng thì báo lỗi, không âm thầm cấp mới
  // vì như vậy sẽ tạo ví mồ côi và che lỗi ở client.
  if (raw === undefined || raw === null || raw === '') {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }
  return requireOrThrow(S.validateDeviceId(raw));
}
function requirePlayerId(raw) {
  return requireOrThrow(S.validatePlayerId(raw));
}
function requireHouseId(raw) {
  return requireOrThrow(S.validateHouseId(raw));
}
function requireActionType(raw) {
  return requireOrThrow(S.validateActionType(raw));
}
function requireBuoiValue(raw) {
  return requireOrThrow(S.validateBuoiValue(raw));
}
function requirePoseOrNull(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  return requireOrThrow(S.validatePose(raw));
}
function requireCoordinate(raw, fallback, lo, hi, label) {
  return requireOrThrow(S.validateCoordinate(raw, fallback, lo, hi, label));
}
function requireBodyObject(body) {
  return requireOrThrow(S.validateBodyObject(body));
}
function requireHouseAction(raw) {
  if (raw !== 'buy' && raw !== 'sell' && raw !== 'sethome' && raw !== 'takeover' && raw !== 'shop') {
    throw badRequest('Hành động nhà không hợp lệ: chỉ nhận buy, sell, sethome, takeover, shop.');
  }
  return raw;
}
function requireShopType(raw) {
  return requireOrThrow(S.validateShopType(raw));
}
function requireNonEmptyString(raw, label) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw badRequest(label + ' không được để trống.');
  }
  return raw.trim();
}

module.exports = {
  requireOrThrow,
  requireRoomCode,
  requirePlayerNameOrNull,
  requireColorOrDefault,
  requireDeviceIdOrGenerate,
  requirePlayerId,
  requireHouseId,
  requireActionType,
  requireBuoiValue,
  requirePoseOrNull,
  requireCoordinate,
  requireBodyObject,
  requireHouseAction,
  requireShopType,
  requireNonEmptyString
};
