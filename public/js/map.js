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
var bigMinimapStatic = null;
// Vật liệu dùng chung cho đạo cụ, để render.js lerp emissive theo buổi:
// lanternMat (lồng đèn đỏ), signMat (biển hiệu), lampMat (đèn đường),
// plazaLights (PointLight ấm chỉ đặt ở các chợ, không đặt mỗi đèn đường
// để không tốn hiệu năng). landmarkPins để animate bob/pulse ở app.js.
var lanternMat = null, signMat = null, lampMat = null, plazaLights = [];
var landmarkPins = [];

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
      if (distToSeg(x, z, s.x1, s.z1, s.x2, s.z2).d < s.w / 2 + Quan5Shared.RESIDENT_RADIUS) return true;
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
  return Math.abs(lx) < b.hw + Quan5Shared.RESIDENT_RADIUS && Math.abs(lz) < b.hd + Quan5Shared.RESIDENT_RADIUS;
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
function mergedQuads(segments, color, y, texture, joinBends) {
  var pos = [], uv = [], idx = [], joints = new Map();
  function vertex(x, z) {
    pos.push(x, y, z);
    uv.push(x / 1.2, -z / 1.2);
  }
  function joint(x, z, px, pz, edge) {
    var key = x + ':' + z;
    var ends = joints.get(key);
    if (!ends) joints.set(key, ends = []);
    ends.push({ angle: Math.atan2(pz, px), index: edge },
              { angle: Math.atan2(-pz, -px), index: edge + 1 });
  }
  segments.forEach(function (s) {
    var dx = s.x2 - s.x1, dz = s.z2 - s.z1, len = Math.hypot(dx, dz);
    if (!len) return;
    var w = s.w / 2, px = -dz / len * w, pz = dx / len * w, base = pos.length / 3;
    vertex(s.x1 + px, s.z1 + pz);
    vertex(s.x1 - px, s.z1 - pz);
    vertex(s.x2 + px, s.z2 + pz);
    vertex(s.x2 - px, s.z2 - pz);
    idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    if (joinBends) {
      joint(s.x1, s.z1, px, pz, base);
      joint(s.x2, s.z2, px, pz, base + 2);
    }
  });
  // Nối góc cua bằng các đỉnh sẵn có ở mép đường.
  joints.forEach(function (ends) {
    ends.sort(function (a, b) { return b.angle - a.angle; });
    for (var k = 1; k + 1 < ends.length; k++) {
      idx.push(ends[0].index, ends[k].index, ends[k + 1].index);
    }
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: color, roughness: 0.94, map: texture || null }));
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
function prismGeometry() {
  // Lăng trụ tam giác đơn vị: đáy y=0, đỉnh y=1 tại z=0, mái dốc hai
  // bên xuống z=±0,5, sống mái dọc theo trục x. Instance sẽ scale theo
  // (chiều dài nhà, chiều cao mái, chiều sâu nhà) nên một geometry dùng
  // cho mọi nhà, không cần tạo geometry riêng từng nhà.
  var pos = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0
  ];
  var idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13];
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
function buildShophouseDetails(list) {
  var roofs = [], signs = [], awnings = [];
  list.forEach(function (b) {
    var isLarge = b.hw > 4 || b.hd > 4 || (b.name && b.name.startsWith('Chợ'));
    if (!isLarge && b.h >= 1.5) {
      roofs.push(b);
    }
    for (var side = 0; side < 4; side++) {
      var width = 2 * (side % 2 ? b.hd : b.hw);
      if (width >= 0.7) awnings.push({ b: b, side: side, width: width });
    }
    var h = hashStr(b.id || (b.x + ':' + b.z));
    if (b.type === 'commercial' || b.type === 'retail' || h % 3 === 0) {
      signs.push(b);
    }
  });
  if (roofs.length) {
    var roofGeo = prismGeometry();
    var roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    var roofInst = new THREE.InstancedMesh(roofGeo, roofMat, roofs.length);
    var dummy = new THREE.Object3D(), col = new THREE.Color();
    var tilePal = [0x9c5a3c, 0x8a4a34, 0xb06a44];
    roofs.forEach(function (b, i) {
      var roofH = Math.max(0.13, Math.min(0.60, Math.min(b.hw, b.hd) * 0.32));
      dummy.position.set(b.x, b.h, b.z);
      dummy.rotation.set(0, b.rot || 0, 0);
      dummy.scale.set(b.hw * 2, roofH, b.hd * 2);
      dummy.updateMatrix();
      roofInst.setMatrixAt(i, dummy.matrix);
      roofInst.setColorAt(i, col.setHex(tilePal[hashStr(b.id || '') % tilePal.length]));
    });
    if (roofInst.instanceColor) roofInst.instanceColor.needsUpdate = true;
    scene.add(roofInst);
  }
  if (awnings.length) {
    var stripe = streetTexture(64, 32, function (ctx) {
      ctx.fillStyle = '#fff4d7';
      ctx.fillRect(0, 0, 64, 32);
      ctx.fillStyle = '#b0a59a';
      for (var x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 32);
    });
    var awningMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9 }), awnings.length);
    var canopy = new THREE.Object3D();
    awnings.forEach(function (item, i) {
      var b = item.b, angle = b.rot + item.side * Math.PI / 2;
      var offset = (item.side % 2 ? b.hw : b.hd) + 0.08;
      canopy.position.set(b.x + Math.sin(angle) * offset, 0.73, b.z + Math.cos(angle) * offset);
      canopy.rotation.set(0.23, angle, 0, 'YXZ');
      canopy.scale.set(item.width * 0.96, 0.028, 0.19);
      canopy.updateMatrix();
      awningMesh.setMatrixAt(i, canopy.matrix);
      awningMesh.setColorAt(i, new THREE.Color([0xe4a284, 0xb0cfc3, 0xf0d69d, 0xc98772][hashStr(b.id)%4]));
    });
    awningMesh.castShadow = true;
    scene.add(awningMesh);
  }
  if (signs.length) {
    signMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffaa33, emissiveIntensity: 0.05, roughness: 0.7 });
    var signInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), signMat, signs.length);
    var dummy3 = new THREE.Object3D(), col3 = new THREE.Color();
    var signPal = [0xc62828, 0xd4a017];
    signs.forEach(function (b, i) {
      var rot = b.rot || 0;
      var fx = Math.sin(rot), fz = Math.cos(rot), sx = Math.cos(rot), sz = -Math.sin(rot);
      dummy3.position.set(b.x + fx * (b.hd + 0.18) + sx * b.hw * 0.7, 1.2, b.z + fz * (b.hd + 0.18) + sz * b.hw * 0.7);
      dummy3.rotation.set(0, rot, 0);
      dummy3.scale.set(0.18, 0.65, 0.06);
      dummy3.updateMatrix();
      signInst.setMatrixAt(i, dummy3.matrix);
      signInst.setColorAt(i, col3.setHex(signPal[hashStr(b.id || '') % signPal.length]));
    });
    if (signInst.instanceColor) signInst.instanceColor.needsUpdate = true;
    scene.add(signInst);
  }
}
function buildStreetProps() {
  // Cây ven đường lớn và cột đèn đường, bản sửa 4 (đã mô phỏng trước
  // bằng dữ liệu thật): luật lệch cố định một mức chỉ tìm được 5 cây /
  // 4 đèn cả bản đồ vì nhà phố bám sát đường tới 99% điểm ven đường.
  // Luật mới: đi dọc tuyến với bước nhỏ (cây 10 đơn vị, đèn 30 đơn vị),
  // mỗi điểm thử nhiều mức lệch (cây 0,35/1,0/1,8/2,5; đèn 0,35/0,8/1,4)
  // ở cả hai bên, lấy điểm đầu tiên trống thật (trong ranh, không trên
  // lòng đường, không trong footprint nhà, không gần kênh). Mô phỏng:
  // 62 cây (9 cây trong vòng 40 quanh spawn) và 8 đèn đường. Đèn quảng
  // trường chợ thêm 16 đèn (vòng bán kính 10/13 quanh mỗi landmark tên
  // có 'Chợ', tối đa 4 đèn/chợ, tay đèn hướng vào chợ) vì quảng trường
  // là đất trống chắc chắn nhìn thấy — riêng An Đông có 4 đèn, gần nhất
  // cách spawn 4,8 đơn vị. Tổng đèn 24, dưới mức trần 100. Công viên chỉ
  // cho thêm 1 cây / 4 đèn trong mô phỏng nên không làm riêng cho gọn.
  lanternMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, emissive: 0xff2211, emissiveIntensity: 0.15, roughness: 0.5 });
  lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffcc66, emissiveIntensity: 0.05, roughness: 0.6 });
  function insideBuilding(x, z, margin) {
    var cx = Math.floor(x / 12), cz = Math.floor(z / 12);
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = GRID[(cx + dx) + ',' + (cz + dz)] || [];
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var ddx = x - b.x, ddz = z - b.z, c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
        var lx = ddx * c - ddz * s, lz = ddx * s + ddz * c;
        if (Math.abs(lx) < b.hw + margin && Math.abs(lz) < b.hd + margin) return true;
      }
    }
    return false;
  }
  function nearWater(x, z) {
    for (var i = 0; i < WATER_SEGMENTS.length; i++) {
      var wseg = WATER_SEGMENTS[i];
      if (distToSeg(x, z, wseg.x1, wseg.z1, wseg.x2, wseg.z2).d < 2.5) return true;
    }
    return false;
  }
  function openGround(x, z) {
    return pointInPoly(x, z, BOUNDARY) && !onRoad(x, z) && !insideBuilding(x, z, 0) && !nearWater(x, z);
  }
  function findRoadside(tx, tz, dx, dz, gw, offsets, side) {
    var sides = [side, -side];
    for (var si = 0; si < sides.length; si++) {
      for (var oi = 0; oi < offsets.length; oi++) {
        var s = sides[si] * (gw / 2 + offsets[oi]);
        var px = -dz * s, pz = dx * s;
        var cx = tx + px, cz = tz + pz;
        if (openGround(cx, cz)) return { x: cx, z: cz, armRot: Math.atan2(pz, -px) };
      }
    }
    return null;
  }
  function sampleEvenly(arr, cap) {
    if (arr.length <= cap) return arr;
    var out = [], step = arr.length / cap;
    for (var i = 0; i < cap; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
  var treeCandidates = [], lampCandidates = [];
  (MAP.roads || []).forEach(function (r) {
    var w = roadWidthFromMeters(r.width_m);
    if (w < 2.5) return;
    var accTree = 0, accLamp = 0, sideTree = 1, sideLamp = -1;
    for (var i = 0; i + 1 < r.pts.length; i++) {
      var x1 = r.pts[i][0], z1 = r.pts[i][1], x2 = r.pts[i + 1][0], z2 = r.pts[i + 1][1];
      var segLen = Math.hypot(x2 - x1, z2 - z1);
      if (segLen === 0) continue;
      var dx = (x2 - x1) / segLen, dz = (z2 - z1) / segLen;
      var travTree = 0;
      while (accTree + (segLen - travTree) >= 10) {
        var needTree = 10 - accTree;
        var tx = x1 + dx * (travTree + needTree), tz = z1 + dz * (travTree + needTree);
        var foundT = findRoadside(tx, tz, dx, dz, w, [0.35, 1.0, 1.8, 2.5], sideTree);
        if (foundT) treeCandidates.push({ x: foundT.x, z: foundT.z });
        sideTree = -sideTree; travTree += needTree; accTree = 0;
      }
      accTree += segLen - travTree;
      var travLamp = 0;
      while (accLamp + (segLen - travLamp) >= 30) {
        var needLamp = 30 - accLamp;
        var lx = x1 + dx * (travLamp + needLamp), lz = z1 + dz * (travLamp + needLamp);
        var foundL = findRoadside(lx, lz, dx, dz, w, [0.35, 0.8, 1.4], sideLamp);
        if (foundL) lampCandidates.push({ x: foundL.x, z: foundL.z, armRot: foundL.armRot });
        sideLamp = -sideLamp; travLamp += needLamp; accLamp = 0;
      }
      accLamp += segLen - travLamp;
    }
  });
  var treePts = sampleEvenly(treeCandidates, 120);
  var lampPts = sampleEvenly(lampCandidates, 100);
  (MAP.landmarks || []).forEach(function (L) {
    if (!L.name || L.name.indexOf('Chợ') === -1) return;
    var count = 0;
    [10, 13].forEach(function (rad) {
      for (var k = 0; k < 8 && count < 4; k++) {
        var ang = k * Math.PI / 4;
        var x = L.x + Math.cos(ang) * rad, z = L.z + Math.sin(ang) * rad;
        if (openGround(x, z)) {
          var dirX = (L.x - x) / rad, dirZ = (L.z - z) / rad;
          lampPts.push({ x: x, z: z, armRot: Math.atan2(-dirZ, dirX) });
          count++;
        }
      }
    });
  });
  if (treePts.length) {
    var trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 }), treePts.length);
    var canopyInst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), treePts.length * 3);
    var dummy = new THREE.Object3D(), col = new THREE.Color();
    var greenPal = [0x53845e, 0x739757, 0x59895d];
    treePts.forEach(function (p, i) {
      dummy.position.set(p.x, 0.7, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      var sc = 0.8 + (hashStr(Math.round(p.x) + ':' + Math.round(p.z)) % 3) * 0.2;
      for (var crown = 0; crown < 3; crown++) {
        var angle = i + crown * 2.1;
        dummy.position.set(p.x + Math.cos(angle)*0.35, 1.75 + crown*0.24, p.z + Math.sin(angle)*0.35);
        dummy.rotation.y = angle;
        dummy.scale.set(sc*(0.68+crown*0.06), sc*0.72, sc*0.79);
        dummy.updateMatrix();
        canopyInst.setMatrixAt(3*i+crown, dummy.matrix);
        canopyInst.setColorAt(3*i+crown, col.setHex(greenPal[(i+crown)%greenPal.length]));
      }
    });
    if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
    trunkInst.castShadow = true;
    canopyInst.castShadow = true;
    scene.add(trunkInst);
    scene.add(canopyInst);
  }
  if (lampPts.length) {
    // Đèn đường nhận ra được: cột + tay vươn ra phía đường + bóng ở
    // đầu tay (trên mép đường), chứ không phải chỉ cột với bóng nhỏ trên
    // đỉnh cột (ban ngày nhìn như cột điện, khó phân biệt với cột treo
    // lồng đèn). Tay dọc theo trục x local, xoay armRot để hướng về đường.
    var lampPoleInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }), lampPts.length);
    var lampArmInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }), lampPts.length);
    var lampGlobeInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat, lampPts.length);
    var dummyLamp = new THREE.Object3D();
    lampPts.forEach(function (p, i) {
      dummyLamp.position.set(p.x, 1.6, p.z);
      dummyLamp.rotation.set(0, 0, 0);
      dummyLamp.scale.set(1, 1, 1);
      dummyLamp.updateMatrix();
      lampPoleInst.setMatrixAt(i, dummyLamp.matrix);
      var dirX = Math.cos(p.armRot), dirZ = -Math.sin(p.armRot);
      dummyLamp.position.set(p.x + dirX * 0.4, 3.2, p.z + dirZ * 0.4);
      dummyLamp.rotation.set(0, p.armRot, 0);
      dummyLamp.scale.set(0.8, 0.08, 0.08);
      dummyLamp.updateMatrix();
      lampArmInst.setMatrixAt(i, dummyLamp.matrix);
      dummyLamp.position.set(p.x + dirX * 0.8, 3.1, p.z + dirZ * 0.8);
      dummyLamp.rotation.set(0, 0, 0);
      dummyLamp.scale.set(1, 1, 1);
      dummyLamp.updateMatrix();
      lampGlobeInst.setMatrixAt(i, dummyLamp.matrix);
    });
    scene.add(lampPoleInst);
    scene.add(lampArmInst);
    scene.add(lampGlobeInst);
  }
  // Lồng đèn, xe đẩy, quán cà phê vợt và pin landmark. Lưu ý thật:
  // đây là đạo cụ trang trí đặt cạnh landmark (chợ, phố lồng đèn),
  // không phải vị trí xe đẩy/quán thật ngoài đời đã kiểm chứng.
  var polePts = [], lanternPts = [], linePts = [];
  function lanternArch(x, z, dx, dz, halfSpan) {
    var left = { x: x - dz*halfSpan, z: z + dx*halfSpan };
    var right = { x: x + dz*halfSpan, z: z - dx*halfSpan };
    if (!pointInPoly(left.x, left.z, BOUNDARY) || !pointInPoly(right.x, right.z, BOUNDARY)) return;
    polePts.push(left, right);
    var last = null;
    for (var k = 0; k <= 8; k++) {
      var t = k / 8;
      var p = { x: left.x + (right.x-left.x)*t, y: 1.52 - 0.19*Math.sin(t*Math.PI), z: left.z + (right.z-left.z)*t };
      if (last) linePts.push(last.x, last.y, last.z, p.x, p.y, p.z);
      if (k % 2 === 1) lanternPts.push({ x: p.x, z: p.z, y: p.y-0.095 });
      last = p;
    }
  }
  LANDMARKS.forEach(function (L) {
    var isMarket = L.name && L.name.startsWith('Chợ');
    if (isMarket || L.name.includes('lồng đèn')) {
      var nearest = null, closest = null;
      ROAD_SEGMENTS.forEach(function (s) {
        if (!s.name || s.w < 1.25) return;
        var point = distToSeg(L.x, L.z, s.x1, s.z1, s.x2, s.z2);
        if (!closest || point.d < closest.d) { nearest = s; closest = point; }
      });
      if (nearest && closest.d < 8) {
        var dx = nearest.x2-nearest.x1, dz = nearest.z2-nearest.z1, len = Math.hypot(dx, dz);
        lanternArch(closest.x, closest.z, dx/len, dz/len, nearest.w/2+0.28);
      }
    }
    if (isMarket) {
      var pl = new THREE.PointLight(0xffcc66, 0, 20, 2);
      pl.position.set(L.x, 4, L.z);
      scene.add(pl);
      plazaLights.push(pl);
    }
  });
  MAP.buildings.forEach(function (b) {
    if (!b.name || !b.name.startsWith('Chợ ')) return;
    for (var side = 0; side < 4; side++) {
      var angle = b.rot + side*Math.PI/2;
      var halfWidth = side%2 ? b.hd : b.hw;
      var depth = (side%2 ? b.hw : b.hd) + 0.17;
      var lamps = Math.max(2, Math.floor(halfWidth*2 / 0.85));
      for (var i = 0; i < lamps; i++) {
        var t = (2*(i+0.5)/lamps - 1)*halfWidth;
        lanternPts.push({ x: b.x + Math.sin(angle)*depth + Math.cos(angle)*t,
          z: b.z + Math.cos(angle)*depth - Math.sin(angle)*t, y: 0.58 });
      }
    }
  });
  if (polePts.length) {
    // Khử trùng cột ở điểm nối hai dây (phố lồng đèn có 3 dây liền
    // nhau): hai trụ cùng vị trí sẽ z-fighting nhấp nháy.
    var seenPole = {}, uniqPoles = [];
    polePts.forEach(function (p) {
      var k = Math.round(p.x * 10) + ':' + Math.round(p.z * 10);
      if (!seenPole[k]) { seenPole[k] = true; uniqPoles.push(p); }
    });
    var poleInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.019, 0.025, 1.52, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 }), uniqPoles.length);
    var dummyP = new THREE.Object3D();
    uniqPoles.forEach(function (p, i) {
      dummyP.position.set(p.x, 0.76, p.z);
      dummyP.rotation.set(0, 0, 0);
      dummyP.scale.set(1, 1, 1);
      dummyP.updateMatrix();
      poleInst.setMatrixAt(i, dummyP.matrix);
    });
    scene.add(poleInst);
  }
  if (lanternPts.length) {
    var lantInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.089, 16, 10), lanternMat, lanternPts.length);
    var tassels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.009, 0.074, 6), mat(0xe4b05b), lanternPts.length);
    var dummyL = new THREE.Object3D();
    lanternPts.forEach(function (p, i) {
      dummyL.position.set(p.x, p.y, p.z);
      dummyL.rotation.set(0, 0, 0);
      dummyL.scale.set(1, 1.15, 1);
      dummyL.updateMatrix();
      lantInst.setMatrixAt(i, dummyL.matrix);
      dummyL.position.y -= 0.13;
      dummyL.updateMatrix();
      tassels.setMatrixAt(i, dummyL.matrix);
    });
    scene.add(lantInst, tassels);
  }
  if (linePts.length) {
    var lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a2c1e })));
  }
  // Xe đẩy hủ tiếu ở mỗi chợ và bàn cà phê vợt ở Văn Lang + An Đông.
  // Xe/quán chỉ là đạo cụ, không đưa vào va chạm để người chơi đi trên
  // đường gần chợ không bị kẹt vào xe.
  LANDMARKS.forEach(function (L) {
    if (L.name && L.name.indexOf('Chợ') !== -1) {
      var cartX = L.x + 7, cartZ = L.z + 5;
      if (!pointInPoly(cartX, cartZ, BOUNDARY)) { cartX = L.x - 7; cartZ = L.z - 5; }
      if (!pointInPoly(cartX, cartZ, BOUNDARY)) {
        // Chợ sát biên mà cả hai hướng đều ngoài ranh thì bỏ xe, không
        // để xe lơ lửng ngoài đất.
      } else {
      var cart = new THREE.Group();
      var wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.9 });
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.0), wood);
      body.position.y = 0.55;
      body.castShadow = true;
      cart.add(body);
      var canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.8 }));
      canopy.position.y = 1.7;
      cart.add(canopy);
      [-0.8, 0.8].forEach(function (px) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), wood);
        pole.position.set(px, 1.15, -0.5);
        cart.add(pole);
      });
      [-0.55, 0.55].forEach(function (pz) {
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0.25, pz);
        cart.add(wheel);
      });
      cart.position.set(cartX, 0, cartZ);
      cart.scale.setScalar(0.36);
      cart.rotation.y = (hashStr(L.name) % 4) * Math.PI / 2;
      scene.add(cart);
      }
    }
    if (L.name === 'Công viên Văn Lang' || L.name === 'Chợ An Đông') {
      var cafe = new THREE.Group();
      var top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.85 }));
      top.position.y = 0.75;
      cafe.add(top);
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 }));
      leg.position.y = 0.37;
      cafe.add(leg);
      [[1.1, 0], [-0.55, 0.95], [-0.55, -0.95]].forEach(function (o) {
        var stool = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.85 }));
        stool.position.set(o[0], 0.2, o[1]);
        cafe.add(stool);
      });
      cafe.scale.setScalar(0.30);
      cafe.position.set(L.x - 5, 0, L.z - 4);
      scene.add(cafe);
    }
  });
  // Pin landmark: chóp + bóng bay lơ lửng và vòng sáng dưới đất, để
  // nhìn thấy điểm check-in từ xa. Pin nhấp nhô và vòng pulse ở app.js.
  // Vòng sáng KHÔNG đặt đúng tâm landmark: tâm chợ thường nằm gọn trong
  // một nhà cao nên vòng dưới đất bị nhà che mất (đã kiểm chứng ở An
  // Đông: nhà gần nhất cao 5,4 phủ kín tâm). Vòng đặt ở điểm đường gần
  // nhất trong 12 đơn vị (trên đường trống, nhìn thấy được), nếu không
  // có đường gần thì mới đặt ở tâm với bán kính lớn hơn.
  LANDMARKS.forEach(function (L, idx) {
    var isMarket2 = L.name && L.name.indexOf('Chợ') !== -1;
    var pinColor = isMarket2 ? 0xe53935 : 0xf9a825;
    var pinMat = new THREE.MeshStandardMaterial({ color: pinColor, emissive: pinColor, emissiveIntensity: 0.35, roughness: 0.5 });
    var pin = new THREE.Group();
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 12), pinMat);
    cone.rotation.x = Math.PI;
    cone.position.y = 4.6;
    pin.add(cone);
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), pinMat);
    ball.position.y = 5.4;
    pin.add(ball);
    pin.position.set(L.x, 0, L.z);
    scene.add(pin);
    var bestD = 1e9, bestX = L.x, bestZ = L.z;
    ROAD_SEGMENTS.forEach(function (s) {
      var rr = distToSeg(L.x, L.z, s.x1, s.z1, s.x2, s.z2);
      if (rr.d < bestD) { bestD = rr.d; bestX = rr.x; bestZ = rr.z; }
    });
    var ringScale = 0.85, ringX = L.x, ringZ = L.z;
    if (bestD < 12) { ringScale = 0.70; ringX = bestX; ringZ = bestZ; }
    // Vòng landmark màu ĐỎ (khớp ghim đỏ), khác hẳn vòng nhà (cam =
    // chưa có chủ, xanh lá = nhà mình, xám = nhà người khác). Trước đây
    // vòng landmark cũng cam nên browser check 1.4/1.5 đã nhìn nhầm vòng
    // landmark thành vòng nhà và kết luận popup nhà không hiện, trong
    // khi người chơi đứng gần spawn còn cách nhà gần nhất 5,39 đơn vị
    // (ngoài tầm 4) nên popup landmark là đúng.
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.0, 48), new THREE.MeshBasicMaterial({ color: 0xe53935, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(ringX, 0.04, ringZ);
    ring.scale.set(ringScale, ringScale, ringScale);
    scene.add(ring);
    landmarkPins.push({ pin: pin, ring: ring, ringBase: ringScale, phase: idx * 0.7 });
  });
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
  var ground = new THREE.Mesh(groundGeo, mat(0xdeceb0));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  (MAP.parks || []).forEach(function (p) {
    if (p.pts.length < 3) return;
    var g = new THREE.ShapeGeometry(shapeFromGamePts(p.pts));
    var m = new THREE.Mesh(g, mat(0x92af7f));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    m.receiveShadow = true;
    scene.add(m);
  });
  var waterSegs = [];
  (MAP.waters || []).forEach(function (w) {
    for (var i = 0; i + 1 < w.pts.length; i++) waterSegs.push({ x1: w.pts[i][0], z1: w.pts[i][1], x2: w.pts[i + 1][0], z2: w.pts[i + 1][1], w: 6 });
  });
  WATER_SEGMENTS = waterSegs;
  if (waterSegs.length) mergedQuads(waterSegs, 0x559596, 0.009);
  var roadSegs = [], footways = [], dashSegs = [], sidewalkSegs = [];
  var asphalt = pavementTexture(false), paving = pavementTexture(true);
  (MAP.roads || []).forEach(function (r) {
    var w = roadWidthFromMeters(r.width_m), distance = 0;
    for (var i = 0; i + 1 < r.pts.length; i++) {
      var s = { x1: r.pts[i][0], z1: r.pts[i][1], x2: r.pts[i+1][0], z2: r.pts[i+1][1], w: w, name: r.name };
      var dx = s.x2 - s.x1, dz = s.z2 - s.z1, len = Math.hypot(dx, dz);
      if (len === 0) continue;
      if (r.type === 'footway' || r.type === 'pedestrian' || r.type === 'steps') footways.push(s);
      else roadSegs.push(s);
      ROAD_SEGMENTS.push(s);
      if (w >= 1.75) sidewalkSegs.push(Object.assign({}, s, { w: w + 0.50 }));
      if (r.width_m >= 8 || (r.major && r.width_m >= 7)) {
        // Đo dọc cả tuyến: vạch sơn vẫn liền nhịp khi OSM chia thành nhiều đoạn ngắn.
        var period = 1.5, dash = 0.56;
        for (var start = -(distance % period); start < len; start += period) {
          var from = Math.max(0, start), to = Math.min(len, start + dash);
          if (to <= from) continue;
          dashSegs.push({ x1: s.x1 + dx*from/len, z1: s.z1 + dz*from/len,
            x2: s.x1 + dx*to/len, z2: s.z1 + dz*to/len, w: 0.038 });
        }
      }
      distance += len;
    }
  });
  // Nền vỉa hè và sân chợ nằm dưới nhựa để không cắt ngang giao lộ.
  if (sidewalkSegs.length) mergedQuads(sidewalkSegs, 0xfbede0, 0.018, paving, true);
  if (footways.length) mergedQuads(footways, 0xe2d7c4, 0.016, paving, true);
  mergedQuads(roadSegs, 0xffffff, 0.024, asphalt, true);
  if (dashSegs.length) mergedQuads(dashSegs, 0xffe9ad, 0.030);
  // Quảng trường chợ: nền gạch nung dưới mỗi chợ, để chợ tách biệt
  // khỏi nền đất vàng chung. Dùng mergedQuads với một đoạn dài 18,
  // rộng 14 đặt tại tâm landmark chợ.
  var plazaSegs = [];
  (MAP.landmarks || []).forEach(function (L) {
    if (L.name && L.name.indexOf('Chợ') !== -1) {
      plazaSegs.push({ x1: L.x - 9, z1: L.z, x2: L.x + 9, z2: L.z, w: 14 });
    }
  });
  if (plazaSegs.length) mergedQuads(plazaSegs, 0xe4b795, 0.012, paving);
  ROAD_SEGMENTS.forEach(addRoadToGrid);
  // Dùng footprint đã được xếp trong hành lang xây dựng ở build_map.py.
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
  indexCameraObstacles([inst]);
  buildStreetFacades(list);
  addMarketSigns(list);
  var propsStart = scene.children.length;
  buildShophouseDetails(list);
  buildStreetProps();
  indexCameraObstacles(scene.children.slice(propsStart));
  LANDMARKS.forEach(function (L) {
    var sp = textSprite(L.name, 2.8);
    sp.position.set(L.x, 6, L.z);
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
    var sp = textSprite(n, 1.7);
    sp.position.set(mid[0], 1.35, mid[1]);
    scene.add(sp);
  });
}
function paintMinimap(ctx, W, H) {
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
}
function buildMinimapStatic() {
  var cv = document.getElementById('minimap');
  if (!cv || !MAP) return;
  var off = document.createElement('canvas');
  off.width = cv.width;
  off.height = cv.height;
  paintMinimap(off.getContext('2d'), off.width, off.height);
  minimapStatic = off;
  var big = document.createElement('canvas');
  big.width = 600;
  big.height = 320;
  paintMinimap(big.getContext('2d'), big.width, big.height);
  bigMinimapStatic = big;
}
