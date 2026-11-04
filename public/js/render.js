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
  scene.fog = new THREE.Fog(0xd8edf7, 60, 170);
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
// Đổi buổi: chỉ đổi nền, sương, đèn. Đèn lồng đã bị xóa khỏi game nên
// không còn vòng lặp LANTERN_MATS rỗng như bản cũ.
var curBuoi = 'sang';
function applyBuoi(v) {
  curBuoi = v;
  var labelEl = document.getElementById('buoiLabel');
  if (labelEl) {
    labelEl.textContent = (Quan5Shared.BUOI_LABELS[v] || 'Sáng');
  }
  if (!RENDER_OK) return;
  if (v === 'sang') {
    scene.background.set(0xd8edf7);
    scene.fog.color.set(0xd8edf7);
    sun.intensity = 1.25;
    sun.color.set(0xffe2a8);
    hemi.intensity = 0.85;
  } else if (v === 'hoang-hon') {
    scene.background.set(0xffb98a);
    scene.fog.color.set(0xffc49a);
    sun.intensity = 0.9;
    sun.color.set(0xff8a3d);
    hemi.intensity = 0.6;
  } else {
    scene.background.set(0x141b3a);
    scene.fog.color.set(0x1a2347);
    sun.intensity = 0.3;
    sun.color.set(0x8fa3ff);
    hemi.intensity = 0.35;
  }
}
