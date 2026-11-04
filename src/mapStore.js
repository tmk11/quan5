// Quản lý bản đồ: đọc file khi mtime đổi, validate schema trước khi dùng,
// giữ bản đồ cũ nếu file mới hỏng (để game không sập giữa lúc deploy), và
// chỉ fail khi chưa từng có bản đồ hợp lệ nào.
// Không có code nào khác được đọc trực tiếp quan5-map.json nữa.
const fs = require('fs');
const S = require('../public/js/shared-core.js');
const config = require('./config.js');
const { AppError, internal } = require('./errors.js');

class MapStore {
  constructor(mapPath) {
    this.mapPath = mapPath || config.MAP_PATH;
    this.cachedMap = null;
    this.cachedMtimeMs = -1;
    this.lastErrorAt = null;
  }

  loadIfNeeded() {
    let stat;
    try {
      stat = fs.statSync(this.mapPath);
    } catch (e) {
      if (this.cachedMap) {
        console.error(
          '[' + new Date().toISOString() + '] Không đọc được stat của bản đồ ' +
          this.mapPath + ': ' + e.message + '. Đang dùng bản đồ cũ đã cache.'
        );
        return this.cachedMap;
      }
      throw new AppError(
        500, 'MAP_UNAVAILABLE',
        'Không tìm thấy file bản đồ trên server (' + this.mapPath + '). ' +
        'Vui lòng kiểm tra lại triển khai trước khi chơi.'
      );
    }
    if (this.cachedMap && stat.mtimeMs === this.cachedMtimeMs) {
      return this.cachedMap;
    }
    let raw;
    try {
      raw = fs.readFileSync(this.mapPath, 'utf8');
    } catch (e) {
      if (this.cachedMap) {
        console.error(
          '[' + new Date().toISOString() + '] Không đọc được file bản đồ: ' +
          e.message + '. Đang dùng bản đồ cũ đã cache.'
        );
        return this.cachedMap;
      }
      throw new AppError(500, 'MAP_UNAVAILABLE', 'Không đọc được file bản đồ: ' + e.message + '.');
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      if (this.cachedMap) {
        console.error(
          '[' + new Date().toISOString() + '] File bản đồ không phải JSON hợp lệ: ' +
          e.message + '. Đang dùng bản đồ cũ đã cache.'
        );
        return this.cachedMap;
      }
      throw new AppError(500, 'MAP_INVALID', 'File bản đồ không phải JSON hợp lệ: ' + e.message + '.');
    }
    const check = S.validateMap(parsed);
    if (!check.ok) {
      if (this.cachedMap) {
        console.error(
          '[' + new Date().toISOString() + '] File bản đồ không đạt schema, ' +
          check.errors.slice(0, 5).join(' | ') + '. Đang dùng bản đồ cũ đã cache.'
        );
        return this.cachedMap;
      }
      throw new AppError(
        500, 'MAP_INVALID',
        'File bản đồ không đạt schema: ' + check.errors.slice(0, 5).join(' | ')
      );
    }
    this.cachedMap = parsed;
    this.cachedMtimeMs = stat.mtimeMs;
    return parsed;
  }

  getMap() {
    return this.loadIfNeeded();
  }
  getMtimeMs() {
    this.loadIfNeeded();
    return this.cachedMtimeMs;
  }
  findHouse(houseId) {
    const map = this.loadIfNeeded();
    const b = map.buildings.find((x) => x.id === houseId);
    if (!b) {
      return null;
    }
    return { building: b, map, price: S.housePrice(b, map.origin.scale_units_per_meter) };
  }
  findLandmark(name) {
    const map = this.loadIfNeeded();
    return map.landmarks.find((l) => l.name === name) || null;
  }
  landmarkNames() {
    const map = this.loadIfNeeded();
    return new Set(map.landmarks.map((l) => l.name));
  }
  // Vị trí spawn khi vào nhà chính: thử 4 phía ngoài mép nhà, lấy phía
  // đầu tiên nằm trong ranh Quận 5, nếu không có phía nào thì về spawn mặc định.
  homeSpawn(house) {
    const map = this.loadIfNeeded();
    const boundary = map.boundary;
    // Thứ tự thử giữ như bản cũ (trước/sau theo hd, rồi trái/phải theo hw),
    // nhưng offset được xoay theo house.rot để spawn thực sự ở ngoài nhà
    // ngay cả khi nhà đã xoay, thay vì có thể spawn lọt vào trong nhà xoay.
    // Quy ước xoay phải khớp đúng với Three.js (rotation.y): trục X local
    // trong world là (cos, -sin), trục Z local là (sin, cos), nên world =
    // (ox*cos + oz*sin, -ox*sin + oz*cos). Đây cũng là công thức mà
    // boxCollides / boxDistance đã dùng từ đầu, không được đổi một bên.
    const offsets = [
      [0, house.hd + 2], [0, -house.hd - 2],
      [house.hw + 2, 0], [-house.hw - 2, 0]
    ];
    for (const off of offsets) {
      const cos = Math.cos(house.rot || 0);
      const sin = Math.sin(house.rot || 0);
      const dx = off[0] * cos + off[1] * sin;
      const dz = -off[0] * sin + off[1] * cos;
      const x = house.x + dx;
      const z = house.z + dz;
      if (S.pointInPoly(x, z, boundary)) {
        return { x, z };
      }
    }
    return { x: S.SPAWN.x, z: S.SPAWN.z };
  }
  summary() {
    const map = this.loadIfNeeded();
    return {
      roads: map.roads.length,
      buildings: map.buildings.length,
      landmarks: map.landmarks.length,
      waters: Array.isArray(map.waters) ? map.waters.length : 0,
      parks: Array.isArray(map.parks) ? map.parks.length : 0
    };
  }
}

module.exports = { MapStore };
