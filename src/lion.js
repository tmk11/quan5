// Đoàn Lân Chợ Lớn (v1.5): thực thể sự kiện theo phòng, di chuyển dọc
// các trục đường lớn (đường OSM có major=true, 295 tuyến, tổng ~3072 đơn
// vị) rồi rơi bao lì xì cho người chơi tranh nhau nhặt.
// Thiết kế để không cần vòng lặp di chuyển nền:
//  - Tuyến đường được xây một lần lúc xuất hiện (nối các đoạn đường lớn
//    có chung đầu mút, tới ~300 đơn vị hoặc cụt đường) và lưu trong phòng.
//  - Vị trí Lân tại bất kỳ thời điểm nào cũng tính được từ (thời điểm
//    xuất hiện, tuyến, tốc độ) bằng S.lionPositionAt, nên mọi request
//    state đều thấy cùng một vị trí, không lệch do timer.
//  - Lì xì cũng suy ra xác định từ (seed của Lân, chỉ số đợt rơi) bằng
//    S.lionDropEnvelopes, nên không cần lưu lì xì xuống đĩa hay RAM ngoài
//    tập hợp các id đã nhặt (để nhặt rồi thì biến mất với mọi người).
//  - Chỉ gửi xuống client tọa độ gọn nhẹ (vị trí Lân + id/tọa độ/hạn của
//    từng lì xì chưa nhặt, chưa hết hạn); hiệu ứng 3D, hạt, chữ bay đều
//    render phía client. Giá trị lì xì (3.000–10.000đ, bước 1.000đ) chỉ
//    quay số lúc nhặt (server-side), không gửi trước xuống client.
const S = require('../public/js/shared-core.js');

const ROUTE_TARGET_LENGTH = 300;
const ROUTE_MAX_SEGMENTS = 100;
const CONNECT_TOLERANCE = 2;

function buildRoute(map, rand) {
  const majors = (map.roads || []).filter((r) => r.major && Array.isArray(r.pts) && r.pts.length >= 2);
  if (majors.length === 0) {
    return null;
  }
  const random = rand || Math.random;
  // Đoạn bắt đầu ngẫu nhiên, rồi nối tiếp đoạn lớn có đầu mút trùng với
  // cuối tuyến hiện tại (trong 2 đơn vị), tránh quay lại đoạn vừa đi
  // (trừ khi cụt đường thì dừng tuyến, Lân sẽ rời đi ở đó).
  let current = majors[Math.floor(random() * majors.length)];
  const used = new Set();
  const route = [];
  const pushPts = (pts, skipFirst) => {
    pts.forEach((p, i) => {
      if (skipFirst && i === 0) return;
      const last = route[route.length - 1];
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.1) return;
      route.push([p[0], p[1]]);
    });
  };
  pushPts(current.pts, false);
  used.add(current);
  let length = S.routeLength(route);
  while (length < ROUTE_TARGET_LENGTH && used.size < ROUTE_MAX_SEGMENTS) {
    const end = route[route.length - 1];
    const next = majors.find((r) => {
      if (used.has(r)) return false;
      const s = r.pts[0], e = r.pts[r.pts.length - 1];
      return Math.hypot(s[0] - end[0], s[1] - end[1]) <= CONNECT_TOLERANCE ||
        Math.hypot(e[0] - end[0], e[1] - end[1]) <= CONNECT_TOLERANCE;
    });
    if (!next) break;
    used.add(next);
    const s = next.pts[0], e = next.pts[next.pts.length - 1];
    const forward = Math.hypot(s[0] - end[0], s[1] - end[1]) <= CONNECT_TOLERANCE;
    pushPts(forward ? next.pts : next.pts.slice().reverse(), true);
    length = S.routeLength(route);
  }
  if (route.length < 2) {
    return null;
  }
  return route;
}

function spawnLion(room, map, now, roomStore) {
  const route = buildRoute(map);
  if (!route) {
    return null;
  }
  const seed = room.code + '-' + now;
  room.lion = { route, seed, spawnedAt: now, departed: false };
  room.claimedEnvelopes = Object.create(null);
  if (roomStore) {
    roomStore.pushEvent(room, {
      playerId: null,
      name: 'Đoàn Lân',
      type: 'lion',
      message: '🦁 Đoàn Lân Chợ Lớn đã xuất hiện! Chạy theo để nhặt bao lì xì!'
    });
  }
  return room.lion;
}

// Tính trạng thái Lân hiện tại. Lân rời đi khi hết tuyến (lion null),
// nhưng lì xì đã rơi vẫn nằm trên đường tới khi hết hạn 20 giây —
// người chơi vẫn nhặt được lì xì sót lại sau khi Lân đi, vì lì xì là
// vật đã rơi xuống đường, không phải bóng của Lân. Vì vậy chỉ các đợt
// rơi lúc Lân còn đang đi (thời điểm rơi ≤ thời gian hết tuyến) mới
// được tính, còn Lân thì null ngay khi hết tuyến.
function computeLionState(room, now) {
  if (!room.lion) {
    return { lion: null, envelopes: [] };
  }
  const elapsed = now - room.lion.spawnedAt;
  const pos = S.lionPositionAt(room.lion.route, elapsed);
  const routeDurationMs = (S.routeLength(room.lion.route) / S.LION_SPEED) * 1000;
  const envelopes = [];
  const dropCount = Math.floor(elapsed / S.LION_DROP_INTERVAL_MS);
  for (let d = 0; d < dropCount; d++) {
    const dropAt = room.lion.spawnedAt + (d + 1) * S.LION_DROP_INTERVAL_MS;
    if (dropAt > now) continue;
    if (dropAt + S.LION_ENVELOPE_TTL_MS <= now) continue;
    if (dropAt - room.lion.spawnedAt > routeDurationMs) continue;
    const dropPos = S.lionPositionAt(room.lion.route, dropAt - room.lion.spawnedAt);
    if (!dropPos) continue;
    for (const env of S.lionDropEnvelopes(room.lion.seed, d, dropPos)) {
      if (room.claimedEnvelopes && room.claimedEnvelopes[env.id]) continue;
      envelopes.push({
        id: env.id,
        x: env.x,
        z: env.z,
        expiresAt: dropAt + S.LION_ENVELOPE_TTL_MS
      });
    }
  }
  return { lion: pos, envelopes };
}

// Vòng đời Lân: gọi ở đầu handleState/handleHeartbeat. Khi Lân đi hết
// tuyến thì đẩy đúng một thông báo rời đi, đánh dấu departed (Lân biến
// mất khỏi bản đồ nhưng lì xì sót lại vẫn nhặt được tới khi hết hạn),
// rồi khi không còn lì xì nào thì xóa hẳn Lân khỏi phòng để chu kỳ
// 10 phút sau có thể xuất hiện Lân mới. Id đã nhặt của lì xì hết hạn
// được dọn luôn để tập claimed không phình mãi theo thời gian.
function updateLionLifecycle(room, now, roomStore) {
  if (!room.lion) return;
  if (room.claimedEnvelopes) {
    for (const id of Object.keys(room.claimedEnvelopes)) {
      const parts = id.split('-');
      const dropIndex = parseInt(parts[parts.length - 2], 10);
      if (Number.isNaN(dropIndex)) continue;
      const expiresAt = room.lion.spawnedAt + (dropIndex + 1) * S.LION_DROP_INTERVAL_MS + S.LION_ENVELOPE_TTL_MS;
      if (expiresAt <= now) delete room.claimedEnvelopes[id];
    }
  }
  if (!room.lion.departed) {
    const elapsed = now - room.lion.spawnedAt;
    if (S.lionPositionAt(room.lion.route, elapsed) !== null) return;
    room.lion.departed = true;
    if (roomStore) {
      roomStore.pushEvent(room, {
        playerId: null,
        name: 'Đoàn Lân',
        type: 'lion',
        message: '🦁 Đoàn Lân đã rời đi, hẹn gặp lại sau 10 phút!'
      });
    }
    return;
  }
  if (computeLionState(room, now).envelopes.length === 0) {
    room.lion = null;
    room.claimedEnvelopes = Object.create(null);
  }
}

function findPickupEnvelope(room, x, z, now) {
  const state = computeLionState(room, now);
  let best = null, bestD = Infinity;
  for (const env of state.envelopes) {
    const d = Math.hypot(x - env.x, z - env.z);
    if (d <= S.LION_PICKUP_RADIUS && d < bestD) {
      bestD = d;
      best = env;
    }
  }
  return best;
}

function rollEnvelopeValue(rand) {
  const r = rand || Math.random;
  return 3000 + Math.floor(r() * 8) * 1000;
}

module.exports = {
  buildRoute,
  spawnLion,
  computeLionState,
  updateLionLifecycle,
  findPickupEnvelope,
  rollEnvelopeValue,
  ROUTE_TARGET_LENGTH,
  ROUTE_MAX_SEGMENTS,
  CONNECT_TOLERANCE
};
