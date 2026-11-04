// Map: dữ liệu bản đồ, lưới không gian, va chạm, và vẽ thế giới.
// Dùng chung công thức từ Quan5Shared (bề rộng đường, giá nhà, hình học)
// qua alias ở đầu file để code cũ gọi tên cũ vẫn chạy, nhưng nguồn sự
// thật duy nhất là shared-core.js, không còn copy công thức ở đây nữa.
// Dead code đã xóa so với bản cũ: LANDMARK_BOX_NAMES, LANDMARK_BOXES,
// box/cyl/sph (không còn được gọi sau khi bỏ quán, cây, đèn lồng),
// LANTERN_MATS (luôn rỗng).
'use strict';
var MAP = null, LANDMARKS = [], ROAD_SEGMENTS = [], WATER_SEGMENTS = [], BOUNDARY = [];
var BOXES = [], GRID = {}, ROAD_GRID = {};
var MAJOR_NAMES = {};
var minimapStatic = null;

// Alias dùng chung, để mọi công thức chỉ sống ở shared-core.
var roadWidthFromMeters = Quan5Shared.roadWidthFromMeters;
var housePriceShared = function (b) {
  var scale = (MAP && MAP.origin && MAP.origin.scale_units_per_meter) || Quan5Shared.SCALE_DEFAULT;
  return Quan5Shared.housePrice(b, scale);
};
var housePrice = housePriceShared;
var fmtMoney = Quan5Shared.fmtMoney;
var hashStr = Quan5Shared.hashStr;
var pointInPoly = Quan5Shared.pointInPoly;
var distToSeg = Quan5Shared.distToSeg;
var boxDistanceShared = Quan5Shared.boxDistance;

function addRoadToGrid(s) {
  var minCx = Math.floor((Math.min(s.x1, s.x2) - 3) / 10), maxCx = Math.floor((Math.max(s.x1, s.x2) + 3) / 10);
  var minCz = Math.floor((Math.min(s.z1, s.z2) - 3) / 10), maxCz = Math.floor((Math.max(s.z1, s.z2) + 3) / 10);
  for (var cx = minCx; cx <= maxCx; cx++) for (var cz = minCz; cz <= maxCz; cz++) {
    var k = cx + ',' + cz;
    if (!ROAD_GRID[k]) ROAD_GRID[k] = [];
    ROAD_GRID[k].push(s);
  }
}
function onRoad(x, z) {
  var cx = Math.floor(x / 10), cz = Math.floor(z / 10);
  for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
    var list = ROAD_GRID[(cx + dx) + ',' + (cz + dz)] || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (distToSeg(x, z, s.x1, s.z1, s.x2, s.z2).d < s.w / 2 + 0.2) return true;
    }
  }
  return false;
}
function addBoxToGrid(b) {
  var minCx = Math.floor((b.x - b.hw - 1) / 12), maxCx = Math.floor((b.x + b.hw + 1) / 12);
  var minCz = Math.floor((b.z - b.hd - 1) / 12), maxCz = Math.floor((b.z + b.hd + 1) / 12);
  for (var cx = minCx; cx <= maxCx; cx++) for (var cz = minCz; cz <= maxCz; cz++) {
    var k = cx + ',' + cz;
    if (!GRID[k]) GRID[k] = [];
    GRID[k].push(b);
  }
}
function boxCollides(x, z, b) {
  var dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  var lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < b.hw + 0.35 && Math.abs(lz) < b.hd + 0.35;
}
function collides(x, z) {
  if (onRoad(x, z)) return false;
  var cx = Math.floor(x / 12), cz = Math.floor(z / 12);
  for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
    var list = GRID[(cx + dx) + ',' + (cz + dz)] || [];
    for (var i = 0; i < list.length; i++) if (boxCollides(x, z, list[i])) return true;
  }
  for (var i = 0; i < WATER_SEGMENTS.length; i++) {
    var w = WATER_SEGMENTS[i];
    if (Math.abs(x - w.x1) > 8 || Math.abs(z - w.z1) > 8) continue;
    if (distToSeg(x, z, w.x1, w.z1, w.x2, w.z2).d < 2.5) return true;
  }
  return false;
}
function shapeFromGamePts(pts) {
  var sh = new THREE.Shape();
  pts.forEach(function (p, i) {
    var sx = p[0], sy = -p[1];
    if (i === 0) sh.moveTo(sx, sy); else sh.lineTo(sx, sy);
  });
  return sh;
}
function mergedQuads(segments, color, y) {
  var pos = [], idx = [], base = 0;
  segments.forEach(function (s) {
    var dx = s.x2 - s.x1, dz = s.z2 - s.z1, len = Math.hypot(dx, dz) || 1, w = s.w / 2;
    var px = -dz / len * w, pz = dx / len * w;
    pos.push(s.x1 + px, y, s.z1 + pz, s.x1 - px, y, s.z1 - pz, s.x2 + px, y, s.z2 + pz, s.x2 - px, y, s.z2 - pz);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    base += 4;
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color, roughness: 0.9, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
function buildingColor(b) {
  var t = b.type || '';
  if (t === 'temple') return 0xc9a68a;
  if (t === 'church') return 0xd8d2c4;
  if (t === 'hospital' || t === 'school' || t === 'university' || t === 'civic') return 0xf0ece0;
  if (t === 'commercial' || t === 'retail') return 0xe3cfa0;
  var pal = [0xf5efe0, 0xe8e0cc, 0xd9d2c4, 0xcbb894];
  return pal[hashStr(Math.round(b.x) + ':' + Math.round(b.z)) % pal.length];
}
function buildMap() {
  // Validate trước khi vẽ: bản đồ hỏng thì throw lỗi rõ ràng để app.js
  // hiện vào #loadStatus, thay vì crash giữa chừng với TypeError khó hiểu.
  var check = Quan5Shared.validateMap(MAP);
  if (!check.ok) {
    throw new Error('Bản đồ không hợp lệ: ' + check.errors.slice(0, 5).join(' | '));
  }
  BOUNDARY = MAP.boundary;
  LANDMARKS = MAP.landmarks;
  (MAP.roads || []).forEach(function (r) { if (r.major && r.name) MAJOR_NAMES[r.name] = true; });
  var groundGeo = new THREE.ShapeGeometry(shapeFromGamePts(BOUNDARY));
  var ground = new THREE.Mesh(groundGeo, mat(0xe8d49a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  (MAP.parks || []).forEach(function (p) {
    if (p.pts.length < 3) return;
    var g = new THREE.ShapeGeometry(shapeFromGamePts(p.pts));
    var m = new THREE.Mesh(g, mat(0x7ab648));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.receiveShadow = true;
    scene.add(m);
  });
  var waterSegs = [];
  (MAP.waters || []).forEach(function (w) {
    for (var i = 0; i + 1 < w.pts.length; i++) waterSegs.push({ x1: w.pts[i][0], z1: w.pts[i][1], x2: w.pts[i + 1][0], z2: w.pts[i + 1][1], w: 6 });
  });
  WATER_SEGMENTS = waterSegs;
  if (waterSegs.length) mergedQuads(waterSegs, 0x3f8fa8, 0.04);
  var roadSegs = [], dashSegs = [];
  (MAP.roads || []).forEach(function (r) {
    var w = roadWidthFromMeters(r.width_m);
    for (var i = 0; i + 1 < r.pts.length; i++) {
      var s = { x1: r.pts[i][0], z1: r.pts[i][1], x2: r.pts[i + 1][0], z2: r.pts[i + 1][1], w: w, name: r.name };
      roadSegs.push(s);
      ROAD_SEGMENTS.push(s);
      if (r.major) {
        var len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), n = Math.floor(len / 6);
        for (var k = 0; k < n; k++) {
          var t0 = k / n;
          var ax = s.x1 + (s.x2 - s.x1) * t0, az = s.z1 + (s.z2 - s.z1) * t0;
          var bx = s.x1 + (s.x2 - s.x1) * Math.min(1, t0 + 1.5 / len), bz = s.z1 + (s.z2 - s.z1) * Math.min(1, t0 + 1.5 / len);
          dashSegs.push({ x1: ax, z1: az, x2: bx, z2: bz, w: 0.35 });
        }
      }
    }
  });
  mergedQuads(roadSegs, 0x3a3f44, 0.06);
  if (dashSegs.length) mergedQuads(dashSegs, 0xf5f0dc, 0.09);
  roadSegs.forEach(addRoadToGrid);
  // Nhà trên nền vàng: chỉ những nhà đã qua lọc ở build_map — footprint
  // thật, đã đẩy khỏi hành lang đường, nhà trong công viên và nhà nhỏ vẫn
  // chồng đường đã bị bỏ hẳn. Bề rộng đường tỉ lệ với bề rộng thật:
  // width_m × 0,25, sàn 1,8, trần 5,0 (công thức ở shared-core, phải khớp
  // với build_map.py, nếu không bản lọc và đường vẽ sẽ lệch nhau).
  var list = MAP.buildings || [];
  var inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), list.length);
  var dummy = new THREE.Object3D(), col = new THREE.Color();
  list.forEach(function (b, i) {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.rotation.set(0, b.rot || 0, 0);
    dummy.scale.set(b.hw * 2, b.h, b.hd * 2);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    inst.setColorAt(i, col.setHex(buildingColor(b)));
    var bb = { x: b.x, z: b.z, hw: (b.hw_t !== undefined ? b.hw_t : b.hw), hd: (b.hd_t !== undefined ? b.hd_t : b.hd), rot: b.rot || 0 };
    BOXES.push(bb);
    addBoxToGrid(bb);
  });
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true;
  inst.receiveShadow = true;
  scene.add(inst);
  LANDMARKS.forEach(function (L) {
    var sp = textSprite(L.name, 12);
    sp.position.set(L.x, 8, L.z);
    scene.add(sp);
  });
  var byName = {};
  (MAP.roads || []).forEach(function (r) {
    if (!r.major || !r.name) return;
    var len = 0;
    for (var i = 0; i + 1 < r.pts.length; i++) len += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
    if (!byName[r.name] || len > byName[r.name].len) byName[r.name] = { len: len, pts: r.pts };
  });
  Object.keys(byName).forEach(function (n) {
    var pts = byName[n].pts, mid = pts[Math.floor(pts.length / 2)];
    var sp = textSprite(n, 9);
    sp.position.set(mid[0], 3, mid[1]);
    scene.add(sp);
  });
}
function buildMinimapStatic() {
  var cv = document.getElementById('minimap');
  if (!cv || !MAP) return;
  var off = document.createElement('canvas');
  off.width = cv.width;
  off.height = cv.height;
  var ctx = off.getContext('2d');
  var W = off.width, H = off.height;
  function mx(x) { return (x + 140) / 280 * W; }
  function mz(z) { return (z + 75) / 150 * H; }
  ctx.fillStyle = '#e8e0cc';
  ctx.fillRect(0, 0, W, H);
  if (BOUNDARY.length) {
    ctx.fillStyle = '#e8d49a';
    ctx.beginPath();
    BOUNDARY.forEach(function (p, i) { if (i === 0) ctx.moveTo(mx(p[0]), mz(p[1])); else ctx.lineTo(mx(p[0]), mz(p[1])); });
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a7a5a';
    ctx.stroke();
  }
  (MAP.parks || []).forEach(function (p) {
    if (p.pts.length < 3) return;
    ctx.fillStyle = '#7ab648';
    ctx.beginPath();
    p.pts.forEach(function (q, i) { if (i === 0) ctx.moveTo(mx(q[0]), mz(q[1])); else ctx.lineTo(mx(q[0]), mz(q[1])); });
    ctx.closePath();
    ctx.fill();
  });
  ctx.strokeStyle = '#3a3f44';
  ctx.lineWidth = 1;
  (MAP.roads || []).forEach(function (r) {
    ctx.beginPath();
    r.pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(mx(p[0]), mz(p[1])); else ctx.lineTo(mx(p[0]), mz(p[1])); });
    ctx.stroke();
  });
  (MAP.waters || []).forEach(function (w) {
    ctx.strokeStyle = '#3f8fa8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    w.pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(mx(p[0]), mz(p[1])); else ctx.lineTo(mx(p[0]), mz(p[1])); });
    ctx.stroke();
    ctx.strokeStyle = '#3a3f44';
    ctx.lineWidth = 1;
  });
  minimapStatic = off;
}
