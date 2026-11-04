// Phòng chơi: rooms là Map (không phải object thường) nên mã phòng hay
// tên người chơi không bao giờ gây prototype pollution. Mỗi phòng giữ
// players (Map), events, buổi hiện tại và thời gian hoạt động gần nhất.
// Phòng rỗng quá 1 giờ sẽ bị xóa để bộ nhớ không tăng vô hạn; phòng rỗng
// dưới 1 giờ vẫn giữ buổi và lịch sử để người chơi vào lại thấy tiếp.
const S = require('../public/js/shared-core.js');

const EMPTY_ROOM_TTL_MS = 60 * 60 * 1000;

class RoomStore {
  constructor() {
    this.rooms = new Map();
  }

  getOrCreate(code) {
    let room = this.rooms.get(code);
    if (!room) {
      room = {
        code,
        players: new Map(),
        events: [],
        buoi: 'sang',
        lastActiveAt: Date.now(),
        lion: null,
        claimedEnvelopes: Object.create(null)
      };
      this.rooms.set(code, room);
    }
    return room;
  }
  get(code) {
    return this.rooms.get(code) || null;
  }
  touch(room) {
    room.lastActiveAt = Date.now();
  }
  // Event giữ đúng hình dạng cũ để client cũ không gãy:
  // { at, playerId, name, type, message, value? }.
  pushEvent(room, event) {
    const full = Object.assign({ at: Date.now() }, event);
    room.events.push(full);
    if (room.events.length > S.MAX_EVENTS) {
      room.events = room.events.slice(-S.MAX_EVENTS);
    }
    this.touch(room);
  }
  prune(room) {
    const now = Date.now();
    for (const [id, p] of room.players) {
      if (now - p.lastSeen > S.PRUNE_MS) {
        room.players.delete(id);
      }
    }
  }
  cleanupEmptyRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.players.size === 0 && now - room.lastActiveAt > EMPTY_ROOM_TTL_MS) {
        this.rooms.delete(code);
      }
    }
  }
  pickName(room) {
    for (const candidate of S.NAMES) {
      let used = false;
      for (const p of room.players.values()) {
        if (p.name === candidate) {
          used = true;
          break;
        }
      }
      if (!used) {
        return candidate;
      }
    }
    return 'Khách ' + Math.floor(Math.random() * 1000);
  }
  publicPlayer(p, econ) {
    const rec = econ ? econ : null;
    return {
      id: p.id,
      name: p.name,
      robe: p.robe,
      skin: p.skin,
      x: p.x,
      z: p.z,
      rot: p.rot,
      pose: p.pose,
      diem: p.diem,
      checkin: p.checkin,
      tien: rec ? rec.tien : 0,
      home: rec ? rec.home : null,
      buffUntil: p.buffUntil || 0,
      mission: p.mission || null
    };
  }
  summary() {
    let players = 0;
    for (const room of this.rooms.values()) {
      players += room.players.size;
    }
    return { rooms: this.rooms.size, players };
  }
}

module.exports = { RoomStore, EMPTY_ROOM_TTL_MS };
