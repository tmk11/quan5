// Các handler API. Mỗi handler chỉ làm một việc: validate đầu vào, gọi
// service (rooms / map / economy / rate limit), xử lý giao dịch có rollback
// khi lưu thất bại, rồi trả JSON đúng hình dạng cũ. Không handler nào được
// nuốt lỗi hay trả success khi lưu thất bại.
const crypto = require('crypto');
const S = require('../public/js/shared-core.js');
const V = require('./validate.js');
const { AppError, badRequest } = require('./errors.js');
const { sendJson } = require('./httpUtil.js');

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}
function sessionNotFound() {
  return new AppError(404, 'SESSION_NOT_FOUND', 'Không tìm thấy người chơi trong phòng. Phiên có thể đã hết hạn, vui lòng bấm Vào lại.');
}
function roomNotFound() {
  return new AppError(404, 'ROOM_NOT_FOUND', 'Phòng không tồn tại.');
}
function getSession(roomStore, roomCode, playerIdRaw) {
  const playerId = V.requirePlayerId(playerIdRaw);
  const room = roomStore.get(roomCode);
  if (!room) {
    throw roomNotFound();
  }
  const player = room.players.get(playerId);
  if (!player) {
    throw sessionNotFound();
  }
  return { room, player };
}
function econTien(econStore, deviceId) {
  const rec = deviceId ? econStore.players[deviceId] : null;
  return rec ? rec.tien : 0;
}
function econHome(econStore, deviceId) {
  const rec = deviceId ? econStore.players[deviceId] : null;
  return rec ? rec.home : null;
}

async function handleHealth(req, res, ctx) {
  let mapSummary;
  try {
    mapSummary = ctx.mapStore.summary();
  } catch (e) {
    throw new AppError(503, 'MAP_UNAVAILABLE', 'Bản đồ chưa sẵn sàng: ' + e.message);
  }
  sendJson(res, 200, {
    ok: true,
    version: ctx.version,
    uptimeSeconds: Math.floor(process.uptime()),
    map: mapSummary,
    economy: ctx.economyStore.summary(),
    rooms: ctx.roomStore.summary()
  });
}

async function handleJoin(req, res, ctx) {
  const { readBody, clientIp } = ctx.httpUtil;
  const body = V.requireBodyObject(await readBody(req));
  const roomCode = V.requireRoomCode(body.room);
  const nameRaw = V.requirePlayerNameOrNull(body.name);
  const robe = V.requireColorOrDefault(body.robe, '#e0651f');
  const skin = V.requireColorOrDefault(body.skin, '#ffe0bd');
  const deviceId = V.requireDeviceIdOrGenerate(body.deviceId);
  ctx.joinLimiter.checkRate(clientIp(req));

  const room = ctx.roomStore.getOrCreate(roomCode);
  ctx.roomStore.prune(room);
  ctx.roomStore.cleanupEmptyRooms();

  const name = nameRaw || ctx.roomStore.pickName(room);
  const map = ctx.mapStore.getMap();
  const cleanup = ctx.economyStore.cleanupOrphans(map, ctx.mapStore.getMtimeMs());
  if (cleanup.saveError) {
    console.error('[' + new Date().toISOString() + '] Dọn nhà mồ côi khi join thất bại khi lưu: ' + cleanup.saveError);
  }

  // Giao dịch join: tạo ví / đổi tên / xóa nhà chính mồ côi, rồi lưu một
  // lần. Lưu thất bại thì rollback toàn bộ và trả 500, không trả success.
  const snap = ctx.economyStore.snapshot();
  let econ;
  try {
    const created = ctx.economyStore.getOrCreatePlayer(deviceId, name);
    econ = created.record;
    let spawn = { x: S.SPAWN.x, z: S.SPAWN.z };
    if (econ.home) {
      const found = ctx.mapStore.findHouse(econ.home);
      if (found) {
        spawn = ctx.mapStore.homeSpawn(found.building);
      } else {
        econ.home = null;
      }
    }
    ctx.economyStore.save();
    const player = {
      id: newId(),
      name,
      robe,
      skin,
      x: spawn.x,
      z: spawn.z,
      rot: 0,
      pose: 'dung',
      diem: 0,
      checkin: 0,
      deviceId,
      lastSeen: Date.now(),
      buffUntil: 0
    };
    room.players.set(player.id, player);
    ctx.roomStore.touch(room);
    sendJson(res, 200, {
      playerId: player.id,
      name: player.name,
      room: roomCode,
      deviceId,
      tien: econ.tien,
      home: econ.home,
      x: spawn.x,
      z: spawn.z
    });
  } catch (e) {
    ctx.economyStore.restore(snap);
    throw e;
  }
}

async function handleHeartbeat(req, res, ctx) {
  const { readBody } = ctx.httpUtil;
  const body = V.requireBodyObject(await readBody(req));
  const roomCode = V.requireRoomCode(body.room);
  const { room, player } = getSession(ctx.roomStore, roomCode, body.playerId);
  player.x = V.requireCoordinate(body.x, player.x, S.BOUNDS.xMin, S.BOUNDS.xMax, 'Tọa độ x');
  player.z = V.requireCoordinate(body.z, player.z, S.BOUNDS.zMin, S.BOUNDS.zMax, 'Tọa độ z');
  player.rot = V.requireCoordinate(body.rot, player.rot, -1e9, 1e9, 'Góc xoay');
  const pose = V.requirePoseOrNull(body.pose);
  if (pose !== null) {
    player.pose = pose;
  }
  player.lastSeen = Date.now();
  ctx.roomStore.touch(room);
  sendJson(res, 200, { ok: true });
}

async function handleAction(req, res, ctx) {
  const { readBody } = ctx.httpUtil;
  const body = V.requireBodyObject(await readBody(req));
  const roomCode = V.requireRoomCode(body.room);
  const type = V.requireActionType(body.type);
  // Validate toàn bộ giá trị đặc thù trước khi trừ rate limit, để request
  // sai không làm hao quota của người chơi.
  let buoiValue = null;
  let checkinPlace = null;
  if (type === 'buoi') {
    buoiValue = V.requireBuoiValue(body.value);
  }
  if (type === 'checkin') {
    checkinPlace = V.requireNonEmptyString(body.value, 'Tên địa điểm check-in');
  }
  const { room, player } = getSession(ctx.roomStore, roomCode, body.playerId);
  ctx.actionLimiter.checkAction(player.id);

  const spec = S.ACTIONS[type];
  if (type === 'checkin') {
    const landmark = ctx.mapStore.findLandmark(checkinPlace);
    if (!landmark) {
      throw badRequest('Địa điểm check-in không hợp lệ: ' + checkinPlace + '. Chỉ check-in được tại các landmark có trên bản đồ.');
    }
    const dist = Math.hypot(player.x - landmark.x, player.z - landmark.z);
    if (dist > S.CHECKIN_SERVER_MAX_DISTANCE) {
      throw badRequest(
        'Bạn còn cách ' + landmark.name + ' ' + dist.toFixed(1) + ' đơn vị, ' +
        'cần trong ' + S.CHECKIN_SERVER_MAX_DISTANCE + ' đơn vị mới check-in được.'
      );
    }
    // Giao dịch check-in: điểm (RAM) + tiền (đĩa) phải cùng thành công.
    const snap = ctx.economyStore.snapshot();
    const oldDiem = player.diem;
    const oldCheckin = player.checkin;
    try {
      player.diem += spec.diem || 0;
      player.checkin += spec.checkin || 0;
      player.lastSeen = Date.now();
      let econ = ctx.economyStore.players[player.deviceId];
      if (!econ) {
        econ = ctx.economyStore.getOrCreatePlayer(player.deviceId, player.name).record;
      }
      econ.tien = (Number(econ.tien) || 0) + S.CHECKIN_TIEN;
      ctx.economyStore.save();
      ctx.roomStore.pushEvent(room, {
        playerId: player.id,
        name: player.name,
        type,
        message: player.name + ' đã check-in tại ' + landmark.name + ' (+' + S.fmtMoney(S.CHECKIN_TIEN) + ')',
        value: landmark.name
      });
      sendJson(res, 200, {
        ok: true,
        diem: player.diem,
        checkin: player.checkin,
        buoi: room.buoi,
        tien: econ.tien
      });
    } catch (e) {
      ctx.economyStore.restore(snap);
      player.diem = oldDiem;
      player.checkin = oldCheckin;
      throw e;
    }
    return;
  }

  if (type === 'buoi') {
    room.buoi = buoiValue;
  }
  // Kinh doanh Shophouse: khách (không phải chủ) đứng trong bán kính giao
  // dịch nhà (boxDistance từ mép nhà, cùng hàm với mua/bán) và bấm Ăn /
  // Cà phê / Mua sắm thì luôn được buff tốc độ 30 giây; tiền doanh thu
  // 2.000đ cho chủ nhà thì chỉ tính 1 lần / 60 giây / khách / nhà (chống
  // farm bằng cách bấm liên tục, cooldown lưu bền trong economy.json nên
  // vào lại phòng cũng không reset). Nhà nào gần nhất trong số nhà của
  // người khác được chọn (nhà của chính khách thì bỏ qua, không tự in tiền).
  const now = Date.now();
  let shopIncome = null;
  let grantBuff = false;
  if (S.SHOP_INCOME_ACTIONS.indexOf(type) !== -1) {
    let best = null, bestD = Infinity;
    for (const id of Object.keys(ctx.economyStore.houses)) {
      const rec = ctx.economyStore.houses[id];
      if (!rec || rec.owner === player.deviceId) continue;
      const found = ctx.mapStore.findHouse(id);
      if (!found) continue;
      const d = S.boxDistance(player.x, player.z, found.building);
      if (d <= S.HOUSE_SERVER_MAX_DISTANCE && d < bestD) {
        bestD = d;
        best = { id, rec };
      }
    }
    if (best) {
      grantBuff = true;
      const key = player.deviceId + ':' + best.id;
      if (S.canGrantShopIncome(ctx.economyStore.incomeCooldown[key], now)) {
        shopIncome = {
          houseId: best.id,
          owner: best.rec.owner,
          ownerName: best.rec.ownerName || '',
          shopType: best.rec.shopType || null,
          amount: S.SHOP_INCOME,
          cooldownKey: key
        };
      }
    }
  }
  if (shopIncome) {
    // Giao dịch có tiền: snapshot + lưu đồng bộ như check-in, lưu hỏng
    // thì rollback toàn bộ (điểm, buff, tiền chủ, mốc cooldown) và trả lỗi.
    const snap = ctx.economyStore.snapshot();
    const oldDiem = player.diem;
    const oldBuff = player.buffUntil || 0;
    try {
      player.diem += spec.diem || 0;
      player.buffUntil = now + S.SHOP_BUFF_MS;
      player.lastSeen = now;
      let visitorEcon = ctx.economyStore.players[player.deviceId];
      if (!visitorEcon) {
        visitorEcon = ctx.economyStore.getOrCreatePlayer(player.deviceId, player.name).record;
      }
      let ownerEcon = ctx.economyStore.players[shopIncome.owner];
      if (!ownerEcon) {
        ownerEcon = ctx.economyStore.getOrCreatePlayer(shopIncome.owner, shopIncome.ownerName).record;
      }
      ownerEcon.tien = (Number(ownerEcon.tien) || 0) + S.SHOP_INCOME;
      ctx.economyStore.incomeCooldown[shopIncome.cooldownKey] = now;
      ctx.economyStore.save();
      ctx.roomStore.pushEvent(room, {
        playerId: player.id,
        name: player.name,
        type,
        message: player.name + ' ' + spec.message
      });
      ctx.roomStore.pushEvent(room, {
        playerId: player.id,
        name: player.name,
        type: 'shop',
        message: player.name + ' vừa ghé ' + S.shopLabel(shopIncome.shopType) + ' của ' + shopIncome.ownerName + ' ủng hộ ' + S.fmtMoney(S.SHOP_INCOME) + '!'
      });
      sendJson(res, 200, {
        ok: true,
        diem: player.diem,
        checkin: player.checkin,
        buoi: room.buoi,
        tien: visitorEcon.tien,
        buffUntil: player.buffUntil,
        shopIncome: {
          houseId: shopIncome.houseId,
          ownerName: shopIncome.ownerName,
          shopLabel: S.shopLabel(shopIncome.shopType),
          amount: S.SHOP_INCOME
        }
      });
    } catch (e) {
      ctx.economyStore.restore(snap);
      player.diem = oldDiem;
      player.buffUntil = oldBuff;
      throw e;
    }
    return;
  }
  player.diem += spec.diem || 0;
  if (grantBuff) {
    player.buffUntil = now + S.SHOP_BUFF_MS;
  }
  player.lastSeen = Date.now();
  ctx.roomStore.pushEvent(room, {
    playerId: player.id,
    name: player.name,
    type,
    message: player.name + ' ' + spec.message
  });
  // Hành động không liên quan đến tiền: nếu ví chưa tồn tại (trường hợp
  // hiếm sau khi khôi phục economy), tạo ví trong bộ nhớ và thử lưu, nhưng
  // lỗi lưu không được chặn hành động vì điểm là RAM và không phụ thuộc
  // vào ví. Lỗi vẫn được log rõ ràng.
  let econ = ctx.economyStore.players[player.deviceId];
  if (!econ) {
    econ = ctx.economyStore.getOrCreatePlayer(player.deviceId, player.name).record;
    try {
      ctx.economyStore.save();
    } catch (e) {
      console.error('[' + new Date().toISOString() + '] Tạo ví khi hành động thất bại khi lưu: ' + e.message);
    }
  }
  sendJson(res, 200, {
    ok: true,
    diem: player.diem,
    checkin: player.checkin,
    buoi: room.buoi,
    tien: econ.tien,
    buffUntil: player.buffUntil || 0
  });
}

async function handleHouse(req, res, ctx) {
  const { readBody } = ctx.httpUtil;
  const body = V.requireBodyObject(await readBody(req));
  const roomCode = V.requireRoomCode(body.room);
  const action = V.requireHouseAction(body.action);
  const houseId = V.requireHouseId(body.houseId);
  let shopType = null;
  if (action === 'shop') {
    shopType = V.requireShopType(body.shopType);
  }
  const { room, player } = getSession(ctx.roomStore, roomCode, body.playerId);
  ctx.actionLimiter.checkAction(player.id);

  const map = ctx.mapStore.getMap();
  const cleanup = ctx.economyStore.cleanupOrphans(map, ctx.mapStore.getMtimeMs());
  if (cleanup.saveError) {
    console.error('[' + new Date().toISOString() + '] Dọn nhà mồ côi khi giao dịch nhà thất bại khi lưu: ' + cleanup.saveError);
  }
  const found = ctx.mapStore.findHouse(houseId);
  if (!found) {
    throw new AppError(404, 'HOUSE_NOT_FOUND', 'Không tìm thấy nhà này trên bản đồ hiện tại.');
  }
  const dist = S.boxDistance(player.x, player.z, found.building);
  if (dist > S.HOUSE_SERVER_MAX_DISTANCE) {
    throw badRequest(
      'Bạn còn cách ngôi nhà ' + dist.toFixed(1) + ' đơn vị, ' +
      'cần trong ' + S.HOUSE_SERVER_MAX_DISTANCE + ' đơn vị mới giao dịch được.'
    );
  }

  const snap = ctx.economyStore.snapshot();
  try {
    let econ = ctx.economyStore.players[player.deviceId];
    if (!econ) {
      econ = ctx.economyStore.getOrCreatePlayer(player.deviceId, player.name).record;
    }
    player.lastSeen = Date.now();
    const label = found.building.name || 'một ngôi nhà';

    if (action === 'buy') {
      const existing = ctx.economyStore.houses[houseId];
      if (existing) {
        throw badRequest('Nhà này đã có chủ: ' + (existing.ownerName || ''));
      }
      if ((Number(econ.tien) || 0) < found.price) {
        throw badRequest(
          'Không đủ tiền. Nhà này ' + S.fmtMoney(found.price) + ', bạn có ' + S.fmtMoney(econ.tien) + '.'
        );
      }
      econ.tien -= found.price;
      econ.home = houseId;
      ctx.economyStore.houses[houseId] = {
        owner: player.deviceId,
        ownerName: player.name,
        price: found.price,
        paid: found.price,
        shopType: null
      };
      ctx.economyStore.save();
      ctx.roomStore.pushEvent(room, {
        playerId: player.id,
        name: player.name,
        type: 'house',
        message: player.name + ' đã mua ' + label + ' (' + S.fmtMoney(found.price) + ') và dọn vào ở'
      });
      sendJson(res, 200, { ok: true, tien: econ.tien, home: houseId, houseId, price: found.price, shopType: null });
      return;
    }
    if (action === 'takeover') {
      // Mua lại (thâu tóm): chỉ nhà đã có chủ của người khác mới mua lại
      // được. Người mua trả giá hiện tại +25%, chủ cũ nhận lại tiền gốc
      // lúc mua +15% lời (trả thẳng vào ví economy.json nên offline cũng
      // nhận được), 10% còn lại đốt khỏi hệ thống (không trả cho ai).
      // Biển hiệu giữ nguyên của chủ cũ, chủ mới đổi miễn phí sau nếu muốn.
      // Chống race: toàn bộ khối kiểm tra → đổi → lưu là đồng bộ, không
      // có await ở giữa, nên hai request cùng lúc không thể cùng đọc giá
      // cũ rồi cùng trả success — request thứ hai chạy sau sẽ thấy giá
      // mới (tăng 25%) và chủ mới, và thường sẽ rớt vì không đủ tiền cho
      // giá mới hoặc vì nhà đã đổi chủ.
      const rec = ctx.economyStore.houses[houseId];
      if (!rec) {
        throw badRequest('Nhà này chưa có chủ, bấm Mua nhà thay vì Mua lại.');
      }
      if (rec.owner === player.deviceId) {
        throw badRequest('Đây là nhà của bạn, không mua lại chính mình được.');
      }
      const newPrice = S.takeoverPrice(rec.price);
      if ((Number(econ.tien) || 0) < newPrice) {
        throw badRequest(
          'Không đủ tiền mua lại. Giá mua lại là ' + S.fmtMoney(newPrice) + ' (giá hiện tại ' + S.fmtMoney(rec.price) + ' +25%), bạn có ' + S.fmtMoney(econ.tien) + '.'
        );
      }
      const oldOwnerName = rec.ownerName || '';
      const oldPaid = Number(rec.paid) || rec.price;
      const payout = S.takeoverPayout(oldPaid);
      const keptShop = rec.shopType || null;
      econ.tien -= newPrice;
      econ.home = houseId;
      let oldEcon = ctx.economyStore.players[rec.owner];
      if (!oldEcon) {
        oldEcon = ctx.economyStore.getOrCreatePlayer(rec.owner, oldOwnerName).record;
      }
      oldEcon.tien = (Number(oldEcon.tien) || 0) + payout;
      if (oldEcon.home === houseId) {
        oldEcon.home = null;
      }
      ctx.economyStore.houses[houseId] = {
        owner: player.deviceId,
        ownerName: player.name,
        price: newPrice,
        paid: newPrice,
        shopType: keptShop
      };
      ctx.economyStore.save();
      ctx.roomStore.pushEvent(room, {
        playerId: player.id,
        name: player.name,
        type: 'house',
        message: player.name + ' đã mua lại ' + label + ' của ' + oldOwnerName + ' với ' + S.fmtMoney(newPrice) + ' (giá tăng 25%)! ' + oldOwnerName + ' nhận lại ' + S.fmtMoney(payout) + ' (gốc + 15% lời).'
      });
      sendJson(res, 200, { ok: true, tien: econ.tien, home: houseId, houseId, price: newPrice, payout, oldOwner: oldOwnerName, shopType: keptShop });
      return;
    }
    if (action === 'shop') {
      const rec = ctx.economyStore.houses[houseId];
      if (!rec || rec.owner !== player.deviceId) {
        throw badRequest('Bạn không phải chủ nhà này nên không chọn biển hiệu được.');
      }
      rec.shopType = shopType;
      ctx.economyStore.save();
      sendJson(res, 200, { ok: true, tien: econ.tien, home: econ.home, houseId, shopType });
      return;
    }
    if (action === 'sell') {
      const rec = ctx.economyStore.houses[houseId];
      if (!rec || rec.owner !== player.deviceId) {
        throw badRequest('Bạn không phải chủ nhà này nên không bán được.');
      }
      const refund = S.sellRefund(rec.price);
      econ.tien = (Number(econ.tien) || 0) + refund;
      if (econ.home === houseId) {
        econ.home = null;
      }
      delete ctx.economyStore.houses[houseId];
      ctx.economyStore.save();
      ctx.roomStore.pushEvent(room, {
        playerId: player.id,
        name: player.name,
        type: 'house',
        message: player.name + ' đã bán ' + label + ' (nhận lại ' + S.fmtMoney(refund) + ', 80% giá mua)'
      });
      sendJson(res, 200, { ok: true, tien: econ.tien, home: econ.home, houseId, refund });
      return;
    }
    // sethome
    const rec = ctx.economyStore.houses[houseId];
    if (!rec || rec.owner !== player.deviceId) {
      throw badRequest('Bạn không phải chủ nhà này nên không đặt làm nhà chính được.');
    }
    econ.home = houseId;
    ctx.economyStore.save();
    sendJson(res, 200, { ok: true, tien: econ.tien, home: houseId, houseId });
  } catch (e) {
    // Chỉ rollback khi lỗi là do lưu thất bại hoặc lỗi sau khi đã đổi
    // bộ nhớ. Lỗi validate trước khi đổi (đã có chủ, không đủ tiền, không
    // phải chủ) cũng rollback về snapshot, và snapshot lúc đó bằng trạng
    // thái ban đầu nên không có hại gì.
    ctx.economyStore.restore(snap);
    throw e;
  }
}

async function handleState(req, res, ctx, query) {
  const roomCode = V.requireRoomCode(query.get('room'));
  const room = ctx.roomStore.get(roomCode);
  const map = ctx.mapStore.getMap();
  const cleanup = ctx.economyStore.cleanupOrphans(map, ctx.mapStore.getMtimeMs());
  if (cleanup.saveError) {
    console.error('[' + new Date().toISOString() + '] Dọn nhà mồ côi khi state thất bại khi lưu: ' + cleanup.saveError);
  }
  if (!room) {
    sendJson(res, 200, { players: [], events: [], buoi: 'sang', houses: ctx.economyStore.houses, leaderboard: [] });
    return;
  }
  ctx.roomStore.prune(room);
  ctx.roomStore.cleanupEmptyRooms();
  const players = [];
  for (const p of room.players.values()) {
    const econ = p.deviceId ? ctx.economyStore.players[p.deviceId] : null;
    players.push(ctx.roomStore.publicPlayer(p, econ));
  }
  sendJson(res, 200, {
    players,
    events: room.events.slice(-S.MAX_EVENTS),
    buoi: room.buoi,
    houses: ctx.economyStore.houses,
    leaderboard: S.rankLandlords([...room.players.values()], ctx.economyStore.players, ctx.economyStore.houses)
  });
}

module.exports = {
  handleHealth,
  handleJoin,
  handleHeartbeat,
  handleAction,
  handleHouse,
  handleState,
  econTien,
  econHome
};
