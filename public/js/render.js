// Render: khởi tạo Three.js, đèn, và các helper vẽ sprite.
// File này phải load sau script Three.js CDN và trước map.js / app.js.
// Nếu CDN Three.js fail, file này không crash: nó đặt cờ RENDER_OK=false
// và ghi lỗi rõ ràng vào #loadStatus, để app.js không gọi buildMap hay
// animate với scene chưa tồn tại.
'use strict';
var RENDER_OK = typeof THREE !== 'undefined';
var scene = null, renderer = null, camera = null, hemi = null, sun = null;
if (RENDER_OK) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8edf7);
  // FogExp2 thay cho Fog tuyến tính: chiều sâu tăng dần theo khoảng
  // cách, phố xa mờ nhẹ chứ không bị cắt đột ngột ở 170 đơn vị.
  scene.fog = new THREE.FogExp2(0xd8edf7, 0.0045);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('scene').appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 70 : 55, innerWidth / innerHeight, 0.1, 400);
  hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xfff2e0, 0.35));
  sun = new THREE.DirectionalLight(0xffe2a8, 1.25);
  sun.position.set(40, 50, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.far = 300;
  scene.add(sun);
} else {
  var loadEl = document.getElementById('loadStatus');
  if (loadEl) {
    loadEl.textContent = 'Không tải được thư viện 3D (Three.js từ CDN). Vui lòng kiểm tra mạng rồi bấm Thử lại để tải lại trang.';
  }
  var retryEl = document.getElementById('retryMapBtn');
  if (retryEl) {
    retryEl.style.display = '';
    retryEl.textContent = 'Thử tải lại trang';
    retryEl.onclick = function () { location.reload(); };
  }
}
function mat(c, o) {
  o = o || {};
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.85,
    emissive: o.emissive || 0x000000,
    emissiveIntensity: o.ei || 0,
    side: o.side || 0
  });
}
function textSprite(text, scale, bg) {
  var cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = bg || 'rgba(30,25,18,0.72)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(6, 10, 500, 76, 22); else ctx.rect(6, 10, 500, 76);
  ctx.fill();
  ctx.fillStyle = '#fff3d6';
  ctx.font = '700 38px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  var tex = new THREE.CanvasTexture(cv);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(scale || 8, scale * 96 / 512 || 1.5, 1);
  return sp;
}
function nameSprite(name) {
  var cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(46,32,20,0.58)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(56, 22, 400, 84, 30); else ctx.rect(56, 22, 400, 84);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,200,110,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(58, 24, 396, 80, 28); else ctx.rect(58, 24, 396, 80);
  ctx.stroke();
  ctx.fillStyle = '#fff8e8';
  ctx.font = '700 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 66);
  var tex = new THREE.CanvasTexture(cv);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.9, 0.72, 1);
  sp.position.y = 3.0;
  return sp;
}
// Giải phóng tài nguyên GPU khi xóa một object khỏi scene. Bản cũ chỉ
// scene.remove mà không dispose, nên người ra vào nhiều lần làm RAM/GPU
// tăng dần. Hàm này dispose geometry, material và texture (kể cả map của
// sprite), nhưng không dispose material dùng chung của scene (đèn, v.v.)
// vì nó chỉ được gọi cho nhân vật và nhãn nhà, vốn tạo material riêng.
function disposeObject(obj) {
  if (!obj) return;
  obj.traverse(function (child) {
    if (child.geometry) {
      try { child.geometry.dispose(); } catch (e) {}
    }
    var mats = child.material;
    if (mats) {
      if (!Array.isArray(mats)) mats = [mats];
      mats.forEach(function (m) {
        if (m.map) {
          try { m.map.dispose(); } catch (e) {}
        }
        try { m.dispose(); } catch (e) {}
      });
    }
  });
}
// Đổi buổi: chuyển màu mượt thay vì đổi tức thì. applyBuoi chỉ đặt
// đích (target), stepBuoiTransition được animate gọi mỗi khung hình
// và lerp mọi giá trị về đích với hệ số mượt 1-exp(-dt*2.5). Đèn lồng,
// biển hiệu và đèn quảng trường cũng lerp theo cùng một hệ số đêm
// (nightFactor 0 = sáng, 1 = đêm) để đêm xuống là đèn tự sáng dần.
// lanternMat / signMat / lampMat / plazaLights do map.js tạo khi vẽ
// thế giới; trước khi buildMap chúng chưa tồn tại nên phải kiểm tra
// typeof trước khi dùng, không được crash.
var curBuoi = 'sang';
var BUOI_TARGETS = {
  'sang': { sky: 0xd8edf7, fog: 0xd8edf7, sun: 0xffe2a8, sunI: 1.25, sunPos: [40, 50, 30], hemiSky: 0xcfe8ff, hemiI: 0.85, night: 0 },
  'hoang-hon': { sky: 0xffb98a, fog: 0xffc49a, sun: 0xff8a3d, sunI: 0.9, sunPos: [60, 20, 10], hemiSky: 0xffc49a, hemiI: 0.6, night: 0.45 },
  'dem': { sky: 0x141b3a, fog: 0x1a2347, sun: 0x8fa3ff, sunI: 0.3, sunPos: [-30, 40, -20], hemiSky: 0x3a4a7a, hemiI: 0.35, night: 1 }
};
var buoiTarget = BUOI_TARGETS['sang'];
var buoiCurrent = null;
if (RENDER_OK) {
  buoiCurrent = {
    sky: new THREE.Color(0xd8edf7), fog: new THREE.Color(0xd8edf7),
    sun: new THREE.Color(0xffe2a8), sunI: 1.25,
    sunPos: new THREE.Vector3(40, 50, 30),
    hemiSky: new THREE.Color(0xcfe8ff), hemiI: 0.85, night: 0
  };
}
function applyBuoi(v) {
  curBuoi = v;
  var labelEl = document.getElementById('buoiLabel');
  if (labelEl) {
    labelEl.textContent = (Quan5Shared.BUOI_LABELS[v] || 'Sáng');
  }
  if (!RENDER_OK) return;
  buoiTarget = BUOI_TARGETS[v] || BUOI_TARGETS['sang'];
}
function stepBuoiTransition(dt) {
  if (!RENDER_OK || !buoiCurrent || !buoiTarget) return;
  var k = 1 - Math.exp(-dt * 2.5);
  buoiCurrent.sky.lerp(new THREE.Color(buoiTarget.sky), k);
  buoiCurrent.fog.lerp(new THREE.Color(buoiTarget.fog), k);
  buoiCurrent.sun.lerp(new THREE.Color(buoiTarget.sun), k);
  buoiCurrent.hemiSky.lerp(new THREE.Color(buoiTarget.hemiSky), k);
  buoiCurrent.sunI += (buoiTarget.sunI - buoiCurrent.sunI) * k;
  buoiCurrent.hemiI += (buoiTarget.hemiI - buoiCurrent.hemiI) * k;
  buoiCurrent.night += (buoiTarget.night - buoiCurrent.night) * k;
  buoiCurrent.sunPos.lerp(new THREE.Vector3(buoiTarget.sunPos[0], buoiTarget.sunPos[1], buoiTarget.sunPos[2]), k);
  scene.background.copy(buoiCurrent.sky);
  scene.fog.color.copy(buoiCurrent.fog);
  sun.color.copy(buoiCurrent.sun);
  sun.intensity = buoiCurrent.sunI;
  sun.position.copy(buoiCurrent.sunPos);
  hemi.color.copy(buoiCurrent.hemiSky);
  hemi.intensity = buoiCurrent.hemiI;
  // Đêm: lồng đèn + biển hiệu + đèn đường phát sáng dần, đèn quảng
  // trường (PointLight, chỉ đặt ở các chợ để không tốn hiệu năng) sáng
  // dần theo nightFactor. Ngày: emissive gần như tắt.
  if (typeof lanternMat !== 'undefined' && lanternMat) lanternMat.emissiveIntensity = 0.15 + buoiCurrent.night * 1.45;
  if (typeof signMat !== 'undefined' && signMat) signMat.emissiveIntensity = 0.05 + buoiCurrent.night * 0.85;
  if (typeof lampMat !== 'undefined' && lampMat) lampMat.emissiveIntensity = 0.05 + buoiCurrent.night * 1.2;
  if (typeof plazaLights !== 'undefined' && plazaLights) {
    plazaLights.forEach(function (L) { L.intensity = buoiCurrent.night * 2.2; });
  }
}
