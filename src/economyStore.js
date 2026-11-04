// Sổ kinh tế: tiền và nhà của người chơi, lưu ở economy.json.
// Nguyên tắc bắt buộc:
//  - Đọc file hỏng thì KHÔNG âm thầm bắt đầu từ sổ trống. Thử backup trước,
//    nếu backup cũng hỏng thì fail nhanh ở lúc khởi động, giữ file hỏng lại
//    để người vận hành khôi phục thủ công.
//  - Ghi theo kiểu atomic: ghi file tạm, fsync, đổi tên. Trước khi ghi phải
//    xoay backup (bak hiện tại -> bak.1, file hiện tại -> bak).
//  - Lỗi ghi phải throw, không được chỉ console.log rồi trả success. Caller
//    (handler mua/bán/check-in) có trách nhiệm rollback thay đổi trong bộ
//    nhớ bằng snapshot() / restore() khi save() throw.
//  - Dữ liệu trong bộ nhớ dùng object không có prototype (Object.create
//    (null)) để key '__proto__' không thể gây prototype pollution. Validate
//    ở shared-core đã chặn các key này từ đầu vào, nhưng tầng lưu trữ vẫn
//    phải an toàn ngay cả khi dữ liệu đến từ file cũ.
const fs = require('fs');
const path = require('path');
const S = require('../public/js/shared-core.js');
const config = require('./config.js');
const { AppError } = require('./errors.js');

function toNullProto(obj) {
  const out = Object.create(null);
  for (const key of Object.keys(obj || {})) {
    out[key] = obj[key];
  }
  return out;
}
function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class EconomyStore {
  constructor(economyPath) {
    this.economyPath = economyPath || config.ECONOMY_PATH;
    const dir = path.dirname(this.economyPath);
    const base = path.basename(this.economyPath);
    this.bakPath = path.join(dir, base + '.bak');
    this.bak1Path = path.join(dir, base + '.bak.1');
    this.tmpPath = path.join(dir, base + '.tmp');
    this.players = Object.create(null);
    this.houses = Object.create(null);
    this.incomeCooldown = Object.create(null);
    this.lastCleanupMapMtime = -1;
  }

  // Chuẩn hóa sổ nhà cũ (trước v1.4 chưa có shopType/paid) và mốc cooldown:
  // nhà cũ chưa có biển thì shopType null, tiền gốc mặc định bằng giá hiện
  // tại (đúng theo bất biến: tiền gốc của chủ hiện tại = giá lúc mua, và
  // giá hiện tại được đặt bằng đúng số tiền đó ở lần mua/mua lại gần nhất).
  normalizeEconomy(parsed) {
    const houses = parsed.houses || {};
    for (const id of Object.keys(houses)) {
      const h = houses[id];
      if (!h || typeof h !== 'object') continue;
      if (h.shopType === undefined || (h.shopType !== null && !S.SHOP_TYPES[h.shopType])) {
        h.shopType = null;
      }
      if (h.paid === undefined || h.paid === null || !Number.isFinite(h.paid) || h.paid < 0) {
        h.paid = h.price;
      }
    }
    if (parsed.incomeCooldown === undefined || parsed.incomeCooldown === null || typeof parsed.incomeCooldown !== 'object' || Array.isArray(parsed.incomeCooldown)) {
      parsed.incomeCooldown = {};
    }
    return parsed;
  }

  load() {
    const fromFile = (filePath) => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const check = S.validateEconomy(parsed);
      if (!check.ok) {
        throw new Error('Schema không hợp lệ: ' + check.errors.slice(0, 5).join(' | '));
      }
      return parsed;
    };
    let parsed;
    try {
      parsed = fromFile(this.economyPath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        this.players = Object.create(null);
        this.houses = Object.create(null);
        this.incomeCooldown = Object.create(null);
        console.error(
          '[' + new Date().toISOString() + '] Chưa có file ' + this.economyPath +
          ', bắt đầu với sổ kinh tế trống.'
        );
        return { players: 0, houses: 0, restoredFromBackup: false };
      }
      // File tồn tại nhưng hỏng: giữ lại để khôi phục thủ công, thử backup.
      const corruptPath = this.economyPath + '.corrupt-' + Date.now();
      try {
        fs.copyFileSync(this.economyPath, corruptPath);
        console.error(
          '[' + new Date().toISOString() + '] File kinh tế hỏng (' + e.message +
          '), đã giữ bản hỏng ở ' + corruptPath + ', đang thử khôi phục từ backup.'
        );
      } catch (copyErr) {
        console.error(
          '[' + new Date().toISOString() + '] Không giữ được file kinh tế hỏng: ' +
          copyErr.message + '.'
        );
      }
      try {
        parsed = fromFile(this.bakPath);
        console.error(
          '[' + new Date().toISOString() + '] Đã khôi phục sổ kinh tế từ backup ' +
          this.bakPath + '.'
        );
      } catch (bakErr) {
        throw new AppError(
          500, 'ECONOMY_CORRUPT',
          'File kinh tế hỏng và backup cũng hỏng, server không khởi động để tránh ' +
          'mất tiền và nhà của người chơi. Lỗi gốc: ' + e.message + '. ' +
          'Lỗi backup: ' + bakErr.message + '. Hãy khôi phục thủ công từ ' +
          corruptPath + ' hoặc ' + this.bakPath + ' rồi khởi động lại.'
        );
      }
      this.players = toNullProto(parsed.players || {});
      this.houses = toNullProto(parsed.houses || {});
      this.incomeCooldown = toNullProto(this.normalizeEconomy(parsed).incomeCooldown || {});
      return {
        players: Object.keys(this.players).length,
        houses: Object.keys(this.houses).length,
        restoredFromBackup: true
      };
    }
    parsed = this.normalizeEconomy(parsed);
    this.players = toNullProto(parsed.players || {});
    this.houses = toNullProto(parsed.houses || {});
    this.incomeCooldown = toNullProto(parsed.incomeCooldown || {});
    return {
      players: Object.keys(this.players).length,
      houses: Object.keys(this.houses).length,
      restoredFromBackup: false
    };
  }

  snapshot() {
    return {
      players: cloneJson(this.players),
      houses: cloneJson(this.houses),
      incomeCooldown: cloneJson(this.incomeCooldown)
    };
  }
  restore(snap) {
    this.players = toNullProto(snap.players);
    this.houses = toNullProto(snap.houses);
    this.incomeCooldown = toNullProto(snap.incomeCooldown || {});
  }

  save() {
    // Dọn mốc cooldown đã hết hạn trước khi ghi, để map không phình vô
    // hạn theo số lượt ghé quán (mốc hết hạn thì lần ghé sau được tính
    // tiền lại anyway, xóa đi không đổi luật, chỉ gọn file).
    const now = Date.now();
    for (const key of Object.keys(this.incomeCooldown)) {
      if (!Number.isFinite(this.incomeCooldown[key]) || now - this.incomeCooldown[key] > S.SHOP_INCOME_COOLDOWN_MS) {
        delete this.incomeCooldown[key];
      }
    }
    const payload = JSON.stringify({ players: this.players, houses: this.houses, incomeCooldown: this.incomeCooldown });
    try {
      // Xoay backup: bak -> bak.1, file hiện tại -> bak, rồi mới ghi mới.
      if (fs.existsSync(this.bakPath)) {
        fs.copyFileSync(this.bakPath, this.bak1Path);
      }
      if (fs.existsSync(this.economyPath)) {
        fs.copyFileSync(this.economyPath, this.bakPath);
      }
      const fd = fs.openSync(this.tmpPath, 'w');
      try {
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(this.tmpPath, this.economyPath);
    } catch (e) {
      // Không xóa file tạm một cách âm thầm nếu lỗi là do quyền hoặc đĩa
      // đầy: để lại file tạm để người vận hành kiểm tra, và báo lỗi rõ.
      throw new AppError(
        500, 'ECONOMY_SAVE_FAILED',
        'Không lưu được sổ kinh tế xuống đĩa: ' + e.message + '. ' +
        'Giao dịch chưa được ghi nhận, vui lòng thử lại sau.'
      );
    }
  }

  getOrCreatePlayer(deviceId, name) {
    let rec = this.players[deviceId];
    if (!rec) {
      rec = { tien: S.START_TIEN, home: null, name: name || null };
      this.players[deviceId] = rec;
      return { record: rec, created: true };
    }
    if (name && rec.name !== name) {
      rec.name = name;
      return { record: rec, created: false, nameChanged: true };
    }
    return { record: rec, created: false };
  }

  // Dọn nhà mồ côi: nhà đã bán nhưng không còn trong bản đồ hiện tại thì
  // hoàn đủ tiền cho chủ và xóa nhà chính nếu trùng. Chỉ chạy khi mtime
  // của bản đồ đã đổi kể từ lần dọn trước, không chạy mỗi lần poll state.
  // Trả về { changed, refunded, saveError }: saveError khác null nghĩa là
  // đã rollback thay đổi trong bộ nhớ để lần poll sau thử lại.
  cleanupOrphans(map, mapMtimeMs) {
    if (mapMtimeMs === this.lastCleanupMapMtime) {
      return { changed: false, refunded: [], saveError: null };
    }
    const ids = new Set(map.buildings.map((b) => b.id));
    const owned = Object.keys(this.houses);
    const orphanIds = owned.filter((id) => !ids.has(id));
    if (orphanIds.length === 0) {
      this.lastCleanupMapMtime = mapMtimeMs;
      return { changed: false, refunded: [], saveError: null };
    }
    const snap = this.snapshot();
    const refunded = [];
    for (const id of orphanIds) {
      const rec = this.houses[id];
      const ownerRec = this.players[rec.owner];
      if (ownerRec) {
        ownerRec.tien += rec.price;
        if (ownerRec.home === id) {
          ownerRec.home = null;
        }
      }
      refunded.push({ houseId: id, owner: rec.owner, amount: rec.price });
      delete this.houses[id];
    }
    try {
      this.save();
    } catch (e) {
      this.restore(snap);
      console.error(
        '[' + new Date().toISOString() + '] Dọn nhà mồ côi thất bại khi lưu: ' +
        e.message + '. Đã rollback, lần poll sau sẽ thử lại.'
      );
      return { changed: false, refunded: [], saveError: e.message };
    }
    this.lastCleanupMapMtime = mapMtimeMs;
    return { changed: true, refunded, saveError: null };
  }

  summary() {
    return {
      players: Object.keys(this.players).length,
      houses: Object.keys(this.houses).length
    };
  }
}

module.exports = { EconomyStore };
