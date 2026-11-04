// App: điều khiển phiên chơi (session controller). File này là khối IIFE
// duy nhất còn lại, vì trạng thái phiên (room, playerId, myPos, v.v.) phải
// chia sẻ giữa join, polling, UI và vòng lặp game. Render ở render.js,
// thế giới ở map.js, API ở net.js, công thức/validate ở shared-core.js.
// Thay đổi so với bản cũ (đều là sửa lỗi, không đổi luật chơi):
//  - Feed và nearBox escape HTML để tên người chơi không thể XSS.
//  - Xóa người chơi / nhãn nhà thì dispose geometry/material/texture.
//  - API có timeout, lỗi hiện toast một lần rồi thử lại ở tick sau, thay
//    vì .catch rỗng làm game đóng băng âm thầm.
//  - Session hết hạn (server prune sau 25s không heartbeat) thì hiện lại
//    màn hình vào với lý do rõ ràng, thay vì đứng yên ngoài đồng bộ.
//  - Join validate trước khi gửi, khóa nút trong lúc request để không tạo
//    hai session khi bấm đúp. Lỗi join chỉ hiện inline, không alert.
//  - Nút Đổi buổi chỉ đổi sau khi server xác nhận, không đổi trước rồi
//    để state poll sửa lại sau 400ms.
//  - Tải bản đồ fail thì hiện nút Thử lại (tải lại bản đồ, không cần tải
//    lại trang), trừ khi lỗi là Three.js CDN thì nút sẽ tải lại trang.
//  - Khoảng cách check-in ghi "22 đơn vị" thay vì "22m" vì đơn vị game
//    không phải mét (22 đơn vị ≈ 315m thật).
(function () {
'use strict';
var params = new URLSearchParams(location.search);
var roomInput = document.getElementById('roomInput');
var nameInput = document.getElementById('nameInput');
if (params.get('room')) roomInput.value = params.get('room').toUpperCase();
document.getElementById('randomNameBtn').onclick = function () {
  var names = Quan5Shared.NAMES;
  nameInput.value = names[Math.floor(Math.random() * names.length)];
};
var selectedRobe = '#e0651f';
document.querySelectorAll('#robeSwatches .sw').forEach(function (b) {
  b.addEventListener('click', function () {
    selectedRobe = b.getAttribute('data-robe');
    document.querySelectorAll('#robeSwatches .sw').forEach(function (x) { x.classList.remove('sel'); });
    b.classList.add('sel');
  });
});
function makePerson(name, robe, skin) {
  var outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner);
  var robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.75 });
  var skinMat = new THREE.MeshStandardMaterial({ color: skin || '#ffe0bd', roughness: 0.6 });
  var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.55, 6, 18), robeMat);
  body.position.y = 0.62;
  body.scale.set(1, 1, 0.82);
  body.castShadow = true;
  inner.add(body);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 28, 20), skinMat);
  head.position.y = 1.5;
  head.scale.set(1, 0.95, 0.92);
  head.castShadow = true;
  inner.add(head);
  var earL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skinMat);
  earL.position.set(-0.56, 1.48, 0);
  inner.add(earL);
  var earR = earL.clone();
  earR.position.x = 0.56;
  inner.add(earR);
  [-0.23, 0.23].forEach(function (ex) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.15 }));
    eye.position.set(ex, 1.56, 0.5);
    inner.add(eye);
    var cheek = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff8fa0, roughness: 0.7, transparent: true, opacity: 0.85 }));
    cheek.position.set(ex * 1.85, 1.36, 0.44);
    cheek.scale.set(1, 0.7, 0.5);
    inner.add(cheek);
  });
  var smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 16, Math.PI), mat(0x5b4632));
  smile.position.set(0, 1.34, 0.54);
  smile.rotation.z = Math.PI;
  inner.add(smile);
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.8 }));
  hair.position.y = 1.58;
  hair.scale.set(1, 0.95, 0.92);
  inner.add(hair);
  [-0.54, 0.54].forEach(function (ax) {
    var arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 12), robeMat);
    arm.position.set(ax, 0.95, 0.05);
    arm.rotation.z = ax > 0 ? -0.25 : 0.25;
    inner.add(arm);
  });
  outer.add(nameSprite(name));
  outer.userData = { inner: inner, tilt: 0, pose: 'dung' };
  return outer;
}
var room = '', playerId = '', myName = '';
var deviceId = (function () {
  try {
    var k = 'quan5-device-id';
    var v = localStorage.getItem(k);
    if (!v) {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        v = 'dev-' + hex + Date.now().toString(36);
      } else {
        v = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      }
      localStorage.setItem(k, v);
    }
    return v;
  } catch (e) {
    // localStorage không dùng được (chế độ riêng tư, v.v.): dùng id trong
    // bộ nhớ cho phiên này, mỗi lần tải lại trang sẽ là ví mới. Lỗi được
    // log rõ ràng thay vì im lặng như bản cũ.
    console.error('Không dùng được localStorage cho deviceId, dùng id tạm trong bộ nhớ: ' + e.message);
    return 'dev-' + Math.random().toString(36).slice(2, 10);
  }
})();
var myTien = 0, myHome = null, lastHouses = {}, lastHousesJson = '';
var myPos = { x: 25, z: -10, rot: 0 }, pose = 'dung', poseUntil = 0;
var camYaw = 0, keys = {}, joy = { x: 0, y: 0 };
var people = {};
var myGroup = null;
var buoiOrder = ['sang', 'hoang-hon', 'dem'];
var lastFeedJson = '';
var lastPlayers = [];
var clock = (typeof THREE !== 'undefined' && THREE.Clock) ? new THREE.Clock() : null;
var pollErrorShown = false;
var errorToastTimer = null;
function showErrorToast(msg) {
  var el = document.getElementById('errorToast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (errorToastTimer) clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(function () { el.style.display = 'none'; }, 5000);
}
function handleSessionExpired(msg) {
  playerId = '';
  pollErrorShown = false;
  var overlay = document.getElementById('joinOverlay');
  if (overlay) overlay.style.display = 'flex';
  var hud = document.getElementById('hud');
  if (hud) hud.classList.remove('on');
  var el = document.getElementById('joinError');
  if (el) el.textContent = msg || 'Phiên chơi đã hết hạn, vui lòng bấm Vào lại.';
  var joinBtn = document.getElementById('joinBtn');
  if (joinBtn) joinBtn.disabled = false;
}
function ensurePerson(p) {
  if (people[p.id]) return people[p.id];
  var g = makePerson(p.name, p.robe || '#e0651f', p.skin || '#ffe0bd');
  g.position.set(p.x || 25, 0, p.z || -10);
  g.rotation.y = p.rot || 0;
  scene.add(g);
  people[p.id] = g;
  return g;
}
function setPose(p, until) {
  pose = p;
  poseUntil = until || 0;
  if (myGroup) myGroup.userData.pose = p;
}
function nearestLandmark() {
  var best = null, bd = 1e9;
  LANDMARKS.forEach(function (L) {
    var d = Math.hypot(myPos.x - L.x, myPos.z - L.z);
    if (d < bd) { bd = d; best = L; }
  });
  return { L: best, d: bd };
}
function nearestHouse() {
  if (!MAP || !MAP.buildings) return null;
  var best = null, bd = 1e9;
  MAP.buildings.forEach(function (b) {
    var d = boxDistanceShared(myPos.x, myPos.z, b);
    if (d < bd) { bd = d; best = b; }
  });
  return bd < Quan5Shared.HOUSE_CLIENT_MAX_DISTANCE ? { b: best, d: bd } : null;
}
function houseDisplayName(b) { return b.name || 'Ngôi nhà'; }
var houseLabels = {};
function rebuildHouseLabels() {
  Object.keys(houseLabels).forEach(function (id) {
    scene.remove(houseLabels[id]);
    disposeObject(houseLabels[id]);
  });
  houseLabels = {};
  if (!MAP || !MAP.buildings) return;
  var byId = {};
  MAP.buildings.forEach(function (b) { byId[b.id] = b; });
  Object.keys(lastHouses).forEach(function (id) {
    var b = byId[id], rec = lastHouses[id];
    if (!b || !rec) return;
    var sp = textSprite('Nhà của ' + (rec.ownerName || ''), 6);
    sp.position.set(b.x, b.h + 1.5, b.z);
    scene.add(sp);
    houseLabels[id] = sp;
  });
}
function updateHouseUI() {
  var nh = nearestHouse();
  var buyBtn = document.getElementById('buyHouseBtn'), sellBtn = document.getElementById('sellHouseBtn'), homeBtn = document.getElementById('homeHouseBtn');
  buyBtn.style.display = 'none';
  sellBtn.style.display = 'none';
  homeBtn.style.display = 'none';
  if (!nh || !playerId) return;
  var b = nh.b, rec = lastHouses[b.id];
  if (!rec) {
    var price = housePrice(b);
    buyBtn.style.display = '';
    buyBtn.textContent = '🏠 Mua: ' + houseDisplayName(b) + ' — ' + fmtMoney(price) + ' (bạn có ' + fmtMoney(myTien) + ')';
    buyBtn.onclick = function () {
      postJson('api/house', { room: room, playerId: playerId, action: 'buy', houseId: b.id }).then(function (j) {
        myTien = j.tien;
        myHome = j.home;
        document.getElementById('tien').textContent = fmtMoney(myTien);
        updateHomeLabel();
        lastHousesJson = '';
      }).catch(function (e) { showErrorToast(e.message || 'Không mua được.'); });
    };
  } else if (rec.owner === deviceId) {
    sellBtn.style.display = '';
    sellBtn.textContent = '🏠 Bán nhà (nhận lại ' + fmtMoney(Quan5Shared.sellRefund(rec.price)) + ')';
    sellBtn.onclick = function () {
      if (!confirm('Bán ' + houseDisplayName(b) + ' và nhận lại 80% giá mua?')) return;
      postJson('api/house', { room: room, playerId: playerId, action: 'sell', houseId: b.id }).then(function (j) {
        myTien = j.tien;
        myHome = j.home;
        document.getElementById('tien').textContent = fmtMoney(myTien);
        updateHomeLabel();
        lastHousesJson = '';
      }).catch(function (e) { showErrorToast(e.message || 'Không bán được.'); });
    };
    if (myHome !== b.id) {
      homeBtn.style.display = '';
      homeBtn.textContent = '🏠 Đặt làm nhà chính';
      homeBtn.onclick = function () {
        postJson('api/house', { room: room, playerId: playerId, action: 'sethome', houseId: b.id }).then(function (j) {
          myHome = j.home;
          updateHomeLabel();
          lastHousesJson = '';
        }).catch(function (e) { showErrorToast(e.message || 'Không đặt được.'); });
      };
    }
  }
}
function updateHomeLabel() {
  var el = document.getElementById('homeLabel');
  if (!el) return;
  if (!myHome) { el.textContent = 'Chưa có'; return; }
  var b = null;
  if (MAP && MAP.buildings) MAP.buildings.forEach(function (x) { if (x.id === myHome) b = x; });
  el.textContent = b ? houseDisplayName(b) : 'Đã có nhà';
}
var dynStreetSprite = null, dynStreetName = '';
function nearestStreet() {
  var best = null, bd = 1e9, bx = 0, bz = 0;
  ROAD_SEGMENTS.forEach(function (s) {
    if (!s.name) return;
    var r = distToSeg(myPos.x, myPos.z, s.x1, s.z1, s.x2, s.z2);
    if (r.d < bd) { bd = r.d; best = s.name; bx = r.x; bz = r.z; }
  });
  return bd < 12 ? { name: best, d: bd, x: bx, z: bz } : null;
}
function updateStreetLabel(ns) {
  if (!ns || MAJOR_NAMES[ns.name]) {
    if (dynStreetSprite) { dynStreetSprite.visible = false; }
    return;
  }
  if (ns.name !== dynStreetName) {
    if (dynStreetSprite) {
      scene.remove(dynStreetSprite);
      disposeObject(dynStreetSprite);
    }
    dynStreetSprite = textSprite(ns.name, 7);
    scene.add(dynStreetSprite);
    dynStreetName = ns.name;
  }
  dynStreetSprite.visible = true;
  dynStreetSprite.position.set(ns.x, 2.8, ns.z);
}
function updateNear() {
  var nl = nearestLandmark();
  var boxEl = document.getElementById('nearBox');
  if (nl.L && nl.d <= Quan5Shared.CHECKIN_CLIENT_MAX_DISTANCE) {
    boxEl.style.display = 'block';
    boxEl.innerHTML = '<b>📍 ' + Quan5Shared.escapeHtml(nl.L.name) + '</b><br>' + Quan5Shared.escapeHtml(nl.L.desc || '') + '<br><i>Bấm 📸 Check-in để +10 điểm và +5.000đ.</i>';
  } else {
    boxEl.style.display = 'none';
  }
  var ns = nearestStreet();
  document.getElementById('streetLabel').textContent = ns ? ns.name : 'Quận 5';
  updateStreetLabel(ns);
  document.getElementById('checkinBtn').textContent = (nl.L && nl.d <= Quan5Shared.CHECKIN_CLIENT_MAX_DISTANCE) ? ('📸 Check-in: ' + nl.L.name) : '📸 Check-in';
  updateHouseUI();
}
document.querySelectorAll('#actions button[data-action]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    if (!playerId) return;
    var type = btn.getAttribute('data-action');
    var value = undefined;
    if (type === 'checkin') {
      var nl = nearestLandmark();
      if (!nl.L || nl.d > Quan5Shared.CHECKIN_CLIENT_MAX_DISTANCE) {
        showErrorToast('Đi lại gần một địa điểm (trong 22 đơn vị) rồi mới check-in được. Gần nhất: ' + (nl.L ? nl.L.name : ''));
        return;
      }
      value = nl.L.name;
      setPose('chup', Date.now() + 1200);
    } else if (type === 'chao') {
      setPose('chao', Date.now() + 1200);
    } else if (type === 'chup') {
      setPose('chup', Date.now() + 1200);
    }
    postJson('api/action', { room: room, playerId: playerId, type: type, value: value }).catch(function (e) {
      showErrorToast(e.message || 'Không thực hiện được hành động.');
    });
  });
});
document.getElementById('buoiBtn').addEventListener('click', function () {
  if (!playerId) return;
  var next = buoiOrder[(buoiOrder.indexOf(curBuoi) + 1) % buoiOrder.length];
  // Không đổi buổi ở client trước rồi để server sửa lại: chỉ đổi khi
  // server xác nhận, để buổi ở client và server không bao giờ lệch nhau.
  postJson('api/action', { room: room, playerId: playerId, type: 'buoi', value: next }).then(function (j) {
    if (j.buoi) applyBuoi(j.buoi);
  }).catch(function (e) {
    showErrorToast(e.message || 'Không đổi buổi được.');
  });
});
document.getElementById('copyBtn').addEventListener('click', function () {
  var el = document.getElementById('shareLink');
  if (navigator.clipboard) navigator.clipboard.writeText(el.value).catch(function () { el.select(); document.execCommand('copy'); });
  else { el.select(); document.execCommand('copy'); }
});
document.getElementById('joinBtn').addEventListener('click', function () {
  if (!MAP) return;
  var joinBtn = document.getElementById('joinBtn');
  var errorEl = document.getElementById('joinError');
  var codeCheck = Quan5Shared.validateRoomCode(roomInput.value.trim() || 'QUAN5');
  if (!codeCheck.ok) {
    if (errorEl) errorEl.textContent = codeCheck.error;
    return;
  }
  var code = codeCheck.value;
  var nameRaw = nameInput.value.trim();
  if (nameRaw) {
    var nameCheck = Quan5Shared.validatePlayerName(nameRaw);
    if (!nameCheck.ok) {
      if (errorEl) errorEl.textContent = nameCheck.error;
      return;
    }
  }
  var colorCheck = Quan5Shared.validateColor(selectedRobe);
  if (!colorCheck.ok) {
    if (errorEl) errorEl.textContent = colorCheck.error;
    return;
  }
  if (errorEl) errorEl.textContent = '';
  joinBtn.disabled = true;
  postJson('api/join', { room: code, name: nameRaw, robe: selectedRobe, skin: '#ffe0bd', deviceId: deviceId }).then(function (j) {
    room = j.room;
    playerId = j.playerId;
    myName = j.name;
    if (j.deviceId) deviceId = j.deviceId;
    myTien = j.tien || 0;
    myHome = j.home || null;
    if (typeof j.x === 'number' && typeof j.z === 'number') { myPos.x = j.x; myPos.z = j.z; }
    document.getElementById('joinOverlay').style.display = 'none';
    document.getElementById('hud').classList.add('on');
    document.getElementById('shareLink').value = location.origin + location.pathname + '?room=' + room;
    document.getElementById('tien').textContent = fmtMoney(myTien);
    updateHomeLabel();
    myGroup = ensurePerson({ id: playerId, name: myName, robe: selectedRobe, skin: '#ffe0bd', x: myPos.x, z: myPos.z, rot: 0 });
    applyBuoi('sang');
  }).catch(function (e) {
    if (errorEl) errorEl.textContent = 'Không vào được: ' + (e.message || 'lỗi không rõ');
    joinBtn.disabled = false;
  });
});
addEventListener('keydown', function (e) { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
var camPointerId = null, camLastX = 0;
if (RENDER_OK) {
  renderer.domElement.addEventListener('pointerdown', function (e) {
    camPointerId = e.pointerId;
    camLastX = e.clientX;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
  });
  renderer.domElement.addEventListener('pointermove', function (e) {
    if (e.pointerId !== camPointerId) return;
    camYaw -= (e.clientX - camLastX) * 0.006;
    camLastX = e.clientX;
    if (e.cancelable) e.preventDefault();
  });
  var camEnd = function (e) {
    if (e.pointerId !== camPointerId) return;
    camPointerId = null;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  renderer.domElement.addEventListener('pointerup', camEnd);
  renderer.domElement.addEventListener('pointercancel', camEnd);
}
var joyEl = document.getElementById('joy'), knob = document.getElementById('knob'), joyId = null;
function joySet(e) {
  var r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var dx = (e.clientX - cx) / 45, dy = (e.clientY - cy) / 45, len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  joy = { x: dx, y: dy };
  knob.style.left = (35 + dx * 28) + 'px';
  knob.style.top = (35 + dy * 28) + 'px';
}
joyEl.addEventListener('pointerdown', function (e) { joyId = e.pointerId; joyEl.setPointerCapture(joyId); joySet(e); });
joyEl.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) joySet(e); });
function joyEnd(e) {
  if (e.pointerId === joyId) { joyId = null; joy = { x: 0, y: 0 }; knob.style.left = '35px'; knob.style.top = '35px'; }
}
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);
function blockedAt(x, z) {
  if (BOUNDARY.length && !pointInPoly(x, z, BOUNDARY)) return true;
  return collides(x, z);
}
function drawMinimap() {
  var cv = document.getElementById('minimap');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  function mx(x) { return (x + 140) / 280 * W; }
  function mz(z) { return (z + 75) / 150 * H; }
  if (minimapStatic) ctx.drawImage(minimapStatic, 0, 0);
  else { ctx.fillStyle = '#e8e0cc'; ctx.fillRect(0, 0, W, H); }
  LANDMARKS.forEach(function (L) {
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(mx(L.x), mz(L.z), 3, 0, Math.PI * 2);
    ctx.fill();
  });
  lastPlayers.forEach(function (p) {
    ctx.fillStyle = (p.id === playerId) ? '#f9a825' : '#1565c0';
    ctx.beginPath();
    ctx.arc(mx(p.x), mz(p.z), p.id === playerId ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}
function animate() {
  requestAnimationFrame(animate);
  if (!RENDER_OK || !clock) return;
  var dt = Math.min(clock.getDelta(), 0.05);
  var t = clock.elapsedTime;
  if (playerId && myGroup) {
    if (poseUntil && Date.now() > poseUntil) { setPose('dung', 0); }
    var fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0) - joy.y;
    var str = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joy.x;
    if (fwd || str) {
      var fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = -fz, rz = fx;
      var mx2 = rx * str + fx * fwd, mz2 = rz * str + fz * fwd, len = Math.hypot(mx2, mz2);
      mx2 /= len;
      mz2 /= len;
      var nx = Math.max(-140, Math.min(140, myPos.x + mx2 * 9 * dt));
      var nz = Math.max(-75, Math.min(75, myPos.z + mz2 * 9 * dt));
      var stuck = blockedAt(myPos.x, myPos.z);
      if (!blockedAt(nx, myPos.z) || stuck) myPos.x = nx;
      if (!blockedAt(myPos.x, nz) || stuck) myPos.z = nz;
      myPos.rot = Math.atan2(mx2, mz2);
      myGroup.position.set(myPos.x, 0, myPos.z);
      myGroup.rotation.y = myPos.rot;
    }
    var camDist = innerWidth < innerHeight ? 13 : 10;
    camera.position.set(myPos.x + Math.sin(camYaw) * camDist, 6.5, myPos.z + Math.cos(camYaw) * camDist);
    camera.lookAt(myPos.x, 1.6, myPos.z);
  }
  Object.keys(people).forEach(function (id) {
    var g = people[id], u = g.userData;
    if (u.pose === 'chao') u.inner.position.y = Math.sin(t * 10) * 0.06; else u.inner.position.y = 0;
    if (u.pose === 'chup') u.inner.rotation.z = Math.sin(t * 6) * 0.05; else u.inner.rotation.z = 0;
    if (id !== playerId && g.userData.target) {
      g.position.x += (g.userData.target.x - g.position.x) * 0.3;
      g.position.z += (g.userData.target.z - g.position.z) * 0.3;
      g.rotation.y = g.userData.target.rot;
    }
  });
  renderer.render(scene, camera);
}
if (RENDER_OK) animate();
addEventListener('resize', function () {
  if (!RENDER_OK) return;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 70 : 55;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
setInterval(function () {
  if (!playerId) return;
  postJson('api/heartbeat', { room: room, playerId: playerId, x: myPos.x, z: myPos.z, rot: myPos.rot, pose: pose }).then(function () {
    return getState(room);
  }).then(function (st) {
    pollErrorShown = false;
    if (st.buoi && st.buoi !== curBuoi) applyBuoi(st.buoi);
    lastPlayers = st.players || [];
    document.getElementById('count').textContent = lastPlayers.length;
    lastHouses = st.houses || {};
    var hj = JSON.stringify(lastHouses);
    if (hj !== lastHousesJson) { lastHousesJson = hj; rebuildHouseLabels(); }
    var seen = {};
    lastPlayers.forEach(function (p) {
      seen[p.id] = true;
      var g = ensurePerson(p);
      if (p.id === playerId) {
        document.getElementById('diem').textContent = p.diem;
        document.getElementById('checkin').textContent = p.checkin;
        document.getElementById('tien').textContent = fmtMoney(p.tien);
        myTien = p.tien || 0;
        if (p.home !== myHome) { myHome = p.home || null; updateHomeLabel(); }
      } else {
        g.userData.target = { x: p.x, z: p.z, rot: p.rot };
        g.userData.pose = p.pose || 'dung';
      }
    });
    Object.keys(people).forEach(function (id) {
      if (!seen[id]) {
        scene.remove(people[id]);
        disposeObject(people[id]);
        delete people[id];
      }
    });
    var feedJson = JSON.stringify(st.events || []);
    if (feedJson !== lastFeedJson) {
      lastFeedJson = feedJson;
      document.getElementById('feed').innerHTML = (st.events || []).slice().reverse().slice(0, 10).map(function (e) {
        return '<div>• ' + Quan5Shared.escapeHtml(e.message) + '</div>';
      }).join('') || '<div>Chưa có ai làm gì cả.</div>';
    }
    updateNear();
    drawMinimap();
  }).catch(function (e) {
    // Session hết hạn thì hiện lại màn hình vào ngay, không để người chơi
    // tưởng mình vẫn đang chơi trong khi server đã prune phiên.
    if (e && (e.code === 'SESSION_NOT_FOUND' || e.code === 'ROOM_NOT_FOUND')) {
      handleSessionExpired(e.message);
      return;
    }
    // Lỗi mạng/timeout: toast một lần, các tick sau tự thử lại, không spam.
    if (!pollErrorShown) {
      pollErrorShown = true;
      showErrorToast(e.message || 'Mất kết nối tới máy chủ, đang thử lại...');
    }
  });
}, 400);
function loadMap() {
  var loadEl = document.getElementById('loadStatus');
  var retryBtn = document.getElementById('retryMapBtn');
  if (loadEl) loadEl.textContent = 'Đang tải bản đồ thật từ OpenStreetMap…';
  if (retryBtn) retryBtn.style.display = 'none';
  getMapJson().then(function (j) {
    MAP = j;
    if (!RENDER_OK) {
      throw new Error('Không tải được thư viện 3D (Three.js).');
    }
    buildMap();
    buildMinimapStatic();
    if (loadEl) loadEl.textContent = 'Đã tải xong bản đồ thật: ' + j.roads.length + ' đoạn đường, ' + j.buildings.length + ' nhà trên nền vàng có thể mua bán (không nhà trên đường), ' + j.landmarks.length + ' landmark trong ranh Quận 5.';
    document.getElementById('joinBtn').disabled = false;
    camera.position.set(myPos.x, 6.5, myPos.z + 10);
    camera.lookAt(myPos.x, 1.6, myPos.z);
  }).catch(function (e) {
    if (loadEl) loadEl.textContent = 'Không tải được bản đồ thật (' + (e.message || 'lỗi không rõ') + ').';
    if (retryBtn) {
      retryBtn.style.display = '';
      retryBtn.textContent = RENDER_OK ? 'Thử tải lại bản đồ' : 'Thử tải lại trang';
      retryBtn.onclick = function () {
        if (RENDER_OK) loadMap(); else location.reload();
      };
    }
  });
}
loadMap();
})();
