// App: điều khiển phiên chơi (session controller). File này là khối IIFE
// duy nhất còn lại, vì trạng thái phiên (room, playerId, myPos, v.v.) phải
// chia sẻ giữa join, polling, UI và vòng lặp game. Render ở render.js,
// thế giới ở map.js, API ở net.js, công thức/validate ở shared-core.js.
// Thay đổi so với bản cũ (đều là sửa lỗi, không đổi luật chơi):
//  - Feed và popup ngữ cảnh escape HTML để tên người chơi không thể XSS.
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
  // Nhân vật Chibi hoàn chỉnh: chân/tay tách biệt để animation được,
  // nón lá Chợ Lớn trên đầu, đạo cụ cầm tay (tô, ly, lồng đèn, máy ảnh)
  // ẩn sẵn và chỉ hiện theo tư thế. Tỉ lệ mới cao ~2,8 đơn vị: chân
  // 0-0,64, thân 0,37-1,73, đầu tâm 2,05, nón tới 2,78, bảng tên 3,2.
  var outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner);
  var robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.75 });
  var skinMat = new THREE.MeshStandardMaterial({ color: skin || '#ffe0bd', roughness: 0.6 });
  var pantsMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.9 });
  var legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.35, 4, 12), pantsMat);
  legL.position.set(-0.18, 0.32, 0);
  inner.add(legL);
  var legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.35, 4, 12), pantsMat);
  legR.position.set(0.18, 0.32, 0);
  inner.add(legR);
  var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.4, 6, 18), robeMat);
  body.position.y = 1.05;
  body.scale.set(1, 1, 0.82);
  body.castShadow = true;
  inner.add(body);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 20), skinMat);
  head.position.y = 2.05;
  head.scale.set(1, 0.95, 0.92);
  head.castShadow = true;
  inner.add(head);
  var earL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skinMat);
  earL.position.set(-0.53, 2.03, 0);
  inner.add(earL);
  var earR = earL.clone();
  earR.position.x = 0.53;
  inner.add(earR);
  [-0.22, 0.22].forEach(function (ex) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.15 }));
    eye.position.set(ex, 2.11, 0.48);
    inner.add(eye);
    var cheek = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff8fa0, roughness: 0.7, transparent: true, opacity: 0.85 }));
    cheek.position.set(ex * 1.85, 1.91, 0.42);
    cheek.scale.set(1, 0.7, 0.5);
    inner.add(cheek);
  });
  var smile = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 16, Math.PI), mat(0x5b4632));
  smile.position.set(0, 1.89, 0.51);
  smile.rotation.z = Math.PI;
  inner.add(smile);
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.8 }));
  hair.position.y = 2.13;
  hair.scale.set(1, 0.95, 0.92);
  inner.add(hair);
  var hat = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.32, 20), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.9 }));
  hat.position.y = 2.62;
  hat.castShadow = true;
  inner.add(hat);
  var armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 12), robeMat);
  armL.position.set(-0.52, 1.35, 0.05);
  armL.rotation.z = 0.25;
  inner.add(armL);
  var armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 12), robeMat);
  armR.position.set(0.52, 1.35, 0.05);
  armR.rotation.z = -0.25;
  inner.add(armR);
  // Đạo cụ cầm tay, ẩn mặc định, chỉ hiện khi tư thế tương ứng.
  var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.6 }));
  bowl.position.set(0, 1.15, 0.65);
  bowl.visible = false;
  inner.add(bowl);
  var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7 }));
  cup.position.set(0.35, 1.25, 0.6);
  cup.visible = false;
  inner.add(cup);
  var lanternProp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd32f2f, emissive: 0xff2211, emissiveIntensity: 0.6, roughness: 0.5 }));
  lanternProp.position.set(0.55, 1.9, 0.3);
  lanternProp.visible = false;
  inner.add(lanternProp);
  var cameraProp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
  cameraProp.position.set(0, 1.65, 0.65);
  cameraProp.visible = false;
  inner.add(cameraProp);
  var ns = nameSprite(name);
  ns.position.y = 3.2;
  outer.add(ns);
  outer.userData = { inner: inner, tilt: 0, pose: 'dung', armL: armL, armR: armR, legL: legL, legR: legR, bowl: bowl, cup: cup, lanternProp: lanternProp, cameraProp: cameraProp, nameSprite: ns, nameBase: { x: 2.9, y: 0.72 }, swing: 0 };
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
var myBuffUntil = 0, buffShown = false, lastLeaderboardJson = '';
var myPos = { x: 25, z: -10, rot: 0 }, pose = 'dung', poseUntil = 0;
var camYaw = 0, keys = {}, joy = { x: 0, y: 0 };
var people = {};
var myGroup = null;
var buoiOrder = ['sang', 'hoang-hon', 'dem'];
var lastFeedJson = '';
var lastPlayers = [];
var clock = (typeof THREE !== 'undefined' && THREE.Clock) ? new THREE.Clock() : null;
var firstStateDone = false;
var houseError = null;
var lastHouseRowKey = '';
var shareUrl = '';
var floatingTexts = [];
var particles = [];
var houseRing = null, houseSaleSprite = null, houseRingBase = 0;
var streetShowUntil = 0;
var swingPhase = 0;
var lastEventSeenAt = 0, firstPollEventsDone = false;
var ACTION_BURST_COLORS = { chao: 0xff8fa0, an: 0xffa726, cafe: 0x8d6e63, mua: 0xe53935, muasam: 0xab47bc, chup: 0xffffff, checkin: 0xf9a825 };
function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  btn.classList.toggle('is-busy', !!busy);
}
function setJoinError(msg) {
  var el = document.getElementById('joinError');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}
function setJoinFormDisabled(disabled) {
  [roomInput, nameInput, document.getElementById('randomNameBtn')].forEach(function (el) { if (el) el.disabled = !!disabled; });
  document.querySelectorAll('#robeSwatches .sw').forEach(function (b) { b.disabled = !!disabled; });
}
function setMapState(state, msg) {
  var loadEl = document.getElementById('loadStatus');
  var skeleton = document.getElementById('mapSkeleton');
  var retryBtn = document.getElementById('retryMapBtn');
  if (skeleton) skeleton.style.display = state === 'loading' ? '' : 'none';
  if (loadEl) {
    loadEl.textContent = msg || '';
    loadEl.classList.remove('state-success', 'state-error');
    if (state === 'success') loadEl.classList.add('state-success');
    if (state === 'error') loadEl.classList.add('state-error');
  }
  if (retryBtn) retryBtn.style.display = state === 'error' ? 'block' : 'none';
  // Trong lúc tải bản đồ, khóa cả form để người chơi không bấm Vào khi
  // bản đồ chưa sẵn (trước đây chỉ khóa nút Vào, còn ô nhập vẫn gõ được).
  // Lỗi thì mở lại ô nhập để sửa mã phòng/tên, nhưng nút Vào vẫn khóa
  // vì chưa có bản đồ thì vào cũng không chơi được.
  if (state === 'loading') { setJoinFormDisabled(true); document.getElementById('joinBtn').disabled = true; }
  else if (state === 'success') { setJoinFormDisabled(false); document.getElementById('joinBtn').disabled = false; }
  else if (state === 'error') { setJoinFormDisabled(false); document.getElementById('joinBtn').disabled = true; }
}
function showPollError(show) {
  var el = document.getElementById('pollError');
  if (el) el.classList.toggle('show', !!show);
}
function renderFeed(events, status) {
  var body = document.getElementById('feedBody');
  if (!body) return;
  if (status === 'loading') {
    body.innerHTML = '<div class="skeleton-line" style="width:95%"></div><div class="skeleton-line" style="width:80%"></div><div class="skeleton-line" style="width:88%"></div>';
    return;
  }
  if (status === 'error') {
    body.innerHTML = '<div class="state-error">Không tải được hoạt động mới.<button type="button" data-feed-retry>Thử lại</button></div>';
    return;
  }
  if (!events || !events.length) {
    body.innerHTML = '<div class="state-empty">Chưa có hoạt động nào.<br>Chào mọi người một tiếng nhé!<button type="button" data-feed-cta>👋 Chào mọi người</button></div>';
    return;
  }
  body.innerHTML = events.slice().reverse().slice(0, 10).map(function (e) {
    var t = '';
    if (e.at) { var d = new Date(e.at); t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
    return '<div class="feed-item">' + (t ? '<span class="feed-time">' + t + '</span>' : '') + '<span class="feed-msg">• ' + Quan5Shared.escapeHtml(e.message) + '</span></div>';
  }).join('');
}
document.getElementById('feedBody').addEventListener('click', function (e) {
  var retry = e.target.closest('[data-feed-retry]');
  if (retry) { pollOnce(); return; }
  var cta = e.target.closest('[data-feed-cta]');
  if (cta) { var chao = document.querySelector('#quickPanel button[data-action="chao"]'); if (chao) chao.click(); }
});
function renderLeaderboard(rows) {
  var body = document.getElementById('leaderBody');
  if (!body) return;
  if (!rows || !rows.length) {
    body.innerHTML = '<div class="leader-empty">Chưa có ai trong phòng.</div>';
    return;
  }
  body.innerHTML = rows.map(function (r, i) {
    var medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : (i + 1) + '.'));
    return '<div class="leader-row"><span class="leader-rank">' + medal + '</span><span class="leader-name">' + Quan5Shared.escapeHtml(r.name || '') + '</span><span class="leader-wealth">' + fmtMoney(r.wealth) + (r.houseCount ? ' (' + r.houseCount + ' nhà)' : '') + '</span></div>';
  }).join('');
}
document.getElementById('leaderToggle').addEventListener('click', function () {
  var panel = document.getElementById('leaderboard');
  var collapsed = panel.classList.toggle('collapsed');
  var btn = document.getElementById('leaderToggle');
  btn.textContent = collapsed ? '▴' : '▾';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
});
// Điện thoại hẹp: bảng xếp hạng mặc định thu gọn để không đè feed bên
// phải (màn 360px thì hai panel trái/phải vừa khít, màn nhỏ hơn sẽ đè
// nhau); người chơi bấm 🏆 để mở khi cần. Desktop mặc định mở.
if (window.innerWidth < 640) {
  var lbPanel = document.getElementById('leaderboard');
  var lbBtn = document.getElementById('leaderToggle');
  if (lbPanel && lbBtn) {
    lbPanel.classList.add('collapsed');
    lbBtn.textContent = '▴';
    lbBtn.setAttribute('aria-expanded', 'false');
  }
}
document.getElementById('feedToggle').addEventListener('click', function () {
  var feed = document.getElementById('feed');
  var collapsed = feed.classList.toggle('collapsed');
  var btn = document.getElementById('feedToggle');
  btn.textContent = collapsed ? '▴' : '▾';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
});
document.getElementById('pollRetryBtn').addEventListener('click', function () { pollOnce(); });
document.getElementById('inviteBtn').addEventListener('click', function () {
  if (!shareUrl) return;
  var done = function () { showToast('Đã copy link phòng!'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(done).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done();
    });
  } else {
    var ta2 = document.createElement('textarea');
    ta2.value = shareUrl;
    document.body.appendChild(ta2);
    ta2.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta2);
    done();
  }
});
document.getElementById('minimapWrap').addEventListener('click', openMapModal);
document.getElementById('minimapWrap').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMapModal(); }
});
document.getElementById('mapModalClose').addEventListener('click', closeMapModal);
document.getElementById('mapModal').addEventListener('click', function (e) {
  if (e.target && e.target.id === 'mapModal') closeMapModal();
});
document.getElementById('quickToggle').addEventListener('click', function () {
  var panel = document.getElementById('quickPanel');
  var btn = document.getElementById('quickToggle');
  var open = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  var popup = document.getElementById('ctxPopup');
  if (popup) popup.classList.toggle('ctx-lifted', open);
});
var errorToastTimer = null;
function showErrorToast(msg) {
  var el = document.getElementById('errorToast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (errorToastTimer) clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(function () { el.style.display = 'none'; }, 5000);
}
var toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2500);
}
// Chữ bay + hạt: hiệu ứng phản hồi cho hành động của mình và của người
// khác (qua event poll). Chữ bay dùng textSprite có sẵn, hạt dùng một
// Points duy nhất mỗi lần nổ để không tạo hàng chục mesh riêng.
function spawnFloatingText(pos, text) {
  if (!RENDER_OK || !scene) return;
  var sp = textSprite(text, 3);
  sp.position.set(pos.x, pos.y + 3.6, pos.z);
  scene.add(sp);
  floatingTexts.push({ sp: sp, life: 1.6, max: 1.6 });
}
function spawnBurst(pos, colorHex, count) {
  if (!RENDER_OK || !scene) return;
  count = count || 14;
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(count * 3);
  var vel = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y + 1.5;
    positions[i * 3 + 2] = pos.z;
    var a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2;
    vel[i * 3] = Math.cos(a) * r;
    vel[i * 3 + 1] = 2 + Math.random() * 2.5;
    vel[i * 3 + 2] = Math.sin(a) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  var mat = new THREE.PointsMaterial({ color: colorHex, size: 0.18, transparent: true, opacity: 1, depthWrite: false });
  var points = new THREE.Points(geo, mat);
  scene.add(points);
  particles.push({ points: points, vel: vel, life: 0.9, max: 0.9 });
}
function initHouseMarker() {
  if (!RENDER_OK || houseRing) return;
  houseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0xf9a825, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  houseRing.rotation.x = -Math.PI / 2;
  houseRing.visible = false;
  scene.add(houseRing);
  houseSaleSprite = textSprite('BÁN', 3);
  houseSaleSprite.visible = false;
  scene.add(houseSaleSprite);
}
// Animation nhân vật: một hàm duy nhất cho mình và người khác, để tư
// thế đồng bộ qua heartbeat nhìn giống nhau ở mọi máy. Dung = đi thì
// vung tay chân + nhún, đứng yên thì thở nhẹ; các tư thế khác ghi đè.
function applyPoseToGroup(g, t, moving, phase) {
  var u = g.userData;
  if (!u || !u.inner) return;
  u.inner.rotation.z = 0;
  u.armL.rotation.set(0, 0, 0.25);
  u.armR.rotation.set(0, 0, -0.25);
  u.legL.rotation.set(0, 0, 0);
  u.legR.rotation.set(0, 0, 0);
  u.bowl.visible = false;
  u.cup.visible = false;
  u.lanternProp.visible = false;
  u.cameraProp.visible = false;
  if (u.pose === 'chao') {
    u.inner.position.y = Math.sin(t * 10) * 0.06;
    u.armR.rotation.set(0, 0, -2.4 + Math.sin(t * 12) * 0.3);
  } else if (u.pose === 'chup') {
    u.inner.position.y = 0;
    u.armL.rotation.set(-1.1, 0, 0.25);
    u.armR.rotation.set(-1.1, 0, -0.25);
    u.cameraProp.visible = true;
  } else if (u.pose === 'an') {
    u.inner.position.y = 0;
    u.armL.rotation.set(-0.9, 0, 0.25);
    u.armR.rotation.set(-0.9, 0, -0.25);
    u.bowl.visible = true;
  } else if (u.pose === 'cafe') {
    u.inner.position.y = 0;
    u.armR.rotation.set(-0.9, 0, -0.25);
    u.cup.visible = true;
  } else if (u.pose === 'mua') {
    u.inner.position.y = 0;
    u.armR.rotation.set(0, 0, -2.6);
    u.lanternProp.visible = true;
  } else if (moving) {
    var s = Math.sin(phase);
    u.legL.rotation.x = s * 0.7;
    u.legR.rotation.x = -s * 0.7;
    u.armL.rotation.x = -s * 0.5;
    u.armR.rotation.x = s * 0.5;
    u.inner.position.y = Math.abs(Math.cos(phase)) * 0.06;
  } else {
    u.inner.position.y = Math.sin(t * 2) * 0.03;
  }
}
function drawBigMap() {
  var cv = document.getElementById('bigMap');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  function mx(x) { return (x + 140) / 280 * W; }
  function mz(z) { return (z + 75) / 150 * H; }
  if (typeof bigMinimapStatic !== 'undefined' && bigMinimapStatic) ctx.drawImage(bigMinimapStatic, 0, 0);
  else { ctx.fillStyle = '#e8e0cc'; ctx.fillRect(0, 0, W, H); }
  LANDMARKS.forEach(function (L) {
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(mx(L.x), mz(L.z), 5, 0, Math.PI * 2);
    ctx.fill();
  });
  lastPlayers.forEach(function (p) {
    ctx.fillStyle = (p.id === playerId) ? '#f9a825' : '#1565c0';
    ctx.beginPath();
    ctx.arc(mx(p.x), mz(p.z), p.id === playerId ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}
function openMapModal() {
  var m = document.getElementById('mapModal');
  if (!m) return;
  drawBigMap();
  m.classList.add('open');
  m.style.display = 'flex';
}
function closeMapModal() {
  var m = document.getElementById('mapModal');
  if (!m) return;
  m.classList.remove('open');
  m.style.display = 'none';
}
function handleSessionExpired(msg) {
  playerId = '';
  firstStateDone = false;
  houseError = null;
  lastHouseRowKey = '';
  showPollError(false);
  renderFeed([], 'loading');
  if (houseRing) houseRing.visible = false;
  if (houseSaleSprite) houseSaleSprite.visible = false;
  closeMapModal();
  var popup = document.getElementById('ctxPopup');
  if (popup) popup.style.display = 'none';
  var overlay = document.getElementById('joinOverlay');
  if (overlay) overlay.style.display = 'flex';
  var hud = document.getElementById('hud');
  if (hud) hud.classList.remove('on');
  setJoinError(msg || 'Phiên chơi đã hết hạn, vui lòng bấm Vào lại.');
  var joinBtn = document.getElementById('joinBtn');
  if (joinBtn) { joinBtn.disabled = false; setBusy(joinBtn, false); }
  setJoinFormDisabled(false);
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
    var sign = rec.shopType ? Quan5Shared.SHOP_TYPES[rec.shopType] : null;
    var sp = sign ? houseLabelSprite(sign, rec.ownerName || '') : textSprite('Nhà của ' + (rec.ownerName || ''), 6);
    sp.position.set(b.x, b.h + 1.5, b.z);
    scene.add(sp);
    houseLabels[id] = sp;
  });
}
function houseAction(btn, action, houseId, shopType) {
  if (!playerId || !btn || btn.disabled) return;
  setBusy(btn, true);
  var body = { room: room, playerId: playerId, action: action, houseId: houseId };
  if (shopType) body.shopType = shopType;
  postJson('api/house', body).then(function (j) {
    houseError = null;
    if (typeof j.tien === 'number') { myTien = j.tien; document.getElementById('tien').textContent = fmtMoney(myTien); }
    if ('home' in j) { myHome = j.home; updateHomeLabel(); }
    lastHousesJson = '';
    lastHouseRowKey = '';
    if (myGroup) {
      if (action === 'buy' && typeof j.price === 'number') {
        spawnFloatingText(myGroup.position, '-' + fmtMoney(j.price) + ' 🏠');
        spawnBurst(myGroup.position, 0xf9a825);
      } else if (action === 'takeover' && typeof j.price === 'number') {
        spawnFloatingText(myGroup.position, '-' + fmtMoney(j.price) + ' 🏠 Mua lại!');
        spawnBurst(myGroup.position, 0xf9a825);
      } else if (action === 'sell' && typeof j.refund === 'number') {
        spawnFloatingText(myGroup.position, '+' + fmtMoney(j.refund) + ' 🏠');
        spawnBurst(myGroup.position, 0x66bb6a);
      } else if (action === 'shop' && j.shopType && Quan5Shared.SHOP_TYPES[j.shopType]) {
        spawnFloatingText(myGroup.position, '✨ ' + Quan5Shared.SHOP_TYPES[j.shopType]);
        spawnBurst(myGroup.position, 0xffd54f);
      }
    }
  }).catch(function (e) {
    houseError = { msg: e.message || 'Không thực hiện được.', action: action, houseId: houseId, shopType: shopType || null };
    lastHouseRowKey = '';
    showErrorToast(houseError.msg);
  }).finally(function () { setBusy(btn, false); });
}
function updateHouseUI() {
  var nh = nearestHouse();
  var buyBtn = document.getElementById('buyHouseBtn'), sellBtn = document.getElementById('sellHouseBtn'), homeBtn = document.getElementById('homeHouseBtn');
  var row = document.getElementById('houseRow');
  var ctxHouse = document.getElementById('ctxHouse');
  var shopRow = document.getElementById('shopRow');
  buyBtn.style.display = 'none';
  sellBtn.style.display = 'none';
  homeBtn.style.display = 'none';
  if (shopRow) shopRow.style.display = 'none';
  // Không còn hàng hướng dẫn "đi lại gần nhà" cố định: popup nhà chỉ
  // hiện khi thực sự gần một ngôi nhà, còn không thì ẩn hẳn để không
  // chiếm chỗ. Vòng sáng + biển BÁN dưới đất cũng tắt theo.
  if (!nh || !playerId) {
    if (ctxHouse) ctxHouse.style.display = 'none';
    if (houseRing) houseRing.visible = false;
    if (houseSaleSprite) houseSaleSprite.visible = false;
    return;
  }
  if (ctxHouse) ctxHouse.style.display = '';
  var b = nh.b, rec = lastHouses[b.id];
  // Vòng sáng dưới đất quanh nhà đang gần: vàng = rao bán, xanh lá =
  // nhà của mình, xám = nhà người khác. Biển BÁN chỉ hiện khi chưa có chủ.
  if (houseRing) {
    houseRingBase = Math.max(b.hw, b.hd) + 1.2;
    houseRing.position.set(b.x, 0.20, b.z);
    houseRing.scale.set(houseRingBase, houseRingBase, houseRingBase);
    houseRing.material.color.set(!rec ? 0xf9a825 : (rec.owner === deviceId ? 0x2e7d32 : 0x8a7a66));
    houseRing.visible = true;
  }
  if (houseSaleSprite) {
    houseSaleSprite.position.set(b.x, b.h + 2.8, b.z);
    houseSaleSprite.visible = !rec;
  }
  // Lỗi giao dịch nhà gần nhất được giữ nguyên cho tới khi người chơi
  // đổi nhà, rời khỏi nhà, hoặc bấm Thử lại thành công — không để tick
  // poll 400ms tiếp theo xóa mất thông báo lỗi.
  if (houseError && houseError.houseId === b.id) {
    if (row && lastHouseRowKey !== 'error:' + b.id + ':' + houseError.msg) {
      lastHouseRowKey = 'error:' + b.id + ':' + houseError.msg;
      row.className = 'house-error';
      row.textContent = '⚠️ ' + houseError.msg + ' ';
      var rb = document.createElement('button');
      rb.type = 'button';
      rb.textContent = 'Thử lại';
      rb.addEventListener('click', function () {
        if (houseError.action === 'shop') {
          var pb = houseError.shopType ? document.querySelector('#shopRow button[data-shop="' + houseError.shopType + '"]') : null;
          if (pb) houseAction(pb, 'shop', b.id, houseError.shopType);
          else showErrorToast('Chọn lại biển hiệu trong bảng chọn.');
          return;
        }
        var btnByAction = { buy: buyBtn, takeover: buyBtn, sell: sellBtn, sethome: homeBtn }[houseError.action];
        if (btnByAction) houseAction(btnByAction, houseError.action, houseError.houseId);
      });
      row.appendChild(rb);
    }
    // Vẫn hiện nút của giao dịch lỗi để Thử lại bấm đúng nút đó.
    // Mua lại dùng chung nút Mua (buyBtn) vì cùng là nút mua, chỉ khác
    // hành động; chọn biển dùng nút chọn biển tương ứng trong shopRow.
    if (houseError.action === 'buy') { buyBtn.style.display = ''; buyBtn.textContent = '🏠 Mua: ' + houseDisplayName(b) + ' — ' + fmtMoney(housePrice(b)) + ' (bạn có ' + fmtMoney(myTien) + ')'; buyBtn.onclick = function () { houseAction(buyBtn, 'buy', b.id); }; }
    else if (houseError.action === 'takeover') { buyBtn.style.display = ''; buyBtn.textContent = '🏠 Mua lại (+25%): ' + fmtMoney(Quan5Shared.takeoverPrice(rec ? rec.price : 0)) + ' (bạn có ' + fmtMoney(myTien) + ')'; buyBtn.onclick = function () { if (!confirm('Mua lại ' + houseDisplayName(b) + ' với ' + fmtMoney(Quan5Shared.takeoverPrice(rec ? rec.price : 0)) + '?')) return; houseAction(buyBtn, 'takeover', b.id); }; }
    else if (houseError.action === 'sell') { sellBtn.style.display = ''; sellBtn.textContent = '🏠 Bán nhà (nhận lại ' + fmtMoney(Quan5Shared.sellRefund(rec ? rec.price : 0)) + ')'; sellBtn.onclick = function () { if (!confirm('Bán ' + houseDisplayName(b) + ' và nhận lại 80% giá mua?')) return; houseAction(sellBtn, 'sell', b.id); }; }
    else if (houseError.action === 'sethome') { homeBtn.style.display = ''; homeBtn.textContent = '🏠 Đặt làm nhà chính'; homeBtn.onclick = function () { houseAction(homeBtn, 'sethome', b.id); }; }
    else if (houseError.action === 'shop') {
      if (shopRow) shopRow.style.display = '';
    }
    return;
  }
  if (!rec) {
    var price = housePrice(b);
    var key = 'buy:' + b.id + ':' + price + ':' + myTien;
    if (row && lastHouseRowKey !== key) {
      lastHouseRowKey = key;
      row.className = 'house-data';
      row.innerHTML = '<span class="house-name">🏠 ' + Quan5Shared.escapeHtml(houseDisplayName(b)) + '</span> — <span class="house-price">' + fmtMoney(price) + '</span> <span>(bạn có ' + fmtMoney(myTien) + ')</span>';
    }
    buyBtn.style.display = '';
    buyBtn.textContent = '🏠 Mua: ' + houseDisplayName(b) + ' — ' + fmtMoney(price) + ' (bạn có ' + fmtMoney(myTien) + ')';
    buyBtn.onclick = function () { houseAction(buyBtn, 'buy', b.id); };
  } else if (rec.owner === deviceId) {
    var key2 = 'own:' + b.id + ':' + rec.price + ':' + myHome + ':' + (rec.shopType || '');
    if (row && lastHouseRowKey !== key2) {
      lastHouseRowKey = key2;
      row.className = 'house-data';
      var signText = rec.shopType ? Quan5Shared.SHOP_TYPES[rec.shopType] : 'chưa chọn biển hiệu';
      row.innerHTML = '<span class="house-name">🏠 Nhà của bạn: ' + Quan5Shared.escapeHtml(houseDisplayName(b)) + '</span> — biển hiệu: <span class="house-price">' + Quan5Shared.escapeHtml(signText) + '</span> — bán lại <span class="house-price">' + fmtMoney(Quan5Shared.sellRefund(rec.price)) + '</span>';
    }
    sellBtn.style.display = '';
    sellBtn.textContent = '🏠 Bán nhà (nhận lại ' + fmtMoney(Quan5Shared.sellRefund(rec.price)) + ')';
    sellBtn.onclick = function () {
      if (!confirm('Bán ' + houseDisplayName(b) + ' và nhận lại 80% giá mua?')) return;
      houseAction(sellBtn, 'sell', b.id);
    };
    if (myHome !== b.id) {
      homeBtn.style.display = '';
      homeBtn.textContent = '🏠 Đặt làm nhà chính';
      homeBtn.onclick = function () { houseAction(homeBtn, 'sethome', b.id); };
    }
    // Bảng chọn biển hiệu: 4 nút tĩnh trong HTML, chỉ đổi trạng thái
    // chọn và gán onclick mỗi tick (không tạo lại nút, nên tick 400ms
    // không phá nút đang bấm). Đổi biển miễn phí, đổi xong nhãn 3D và
    // feed lần ghé sau dùng biển mới ngay.
    if (shopRow) {
      shopRow.style.display = '';
      var shopBtns = shopRow.querySelectorAll('button[data-shop]');
      for (var i = 0; i < shopBtns.length; i++) {
        (function (sb) {
          var st = sb.getAttribute('data-shop');
          sb.classList.toggle('sel', rec.shopType === st);
          sb.onclick = function () { houseAction(sb, 'shop', b.id, st); };
        })(shopBtns[i]);
      }
    }
  } else {
    var newPrice = Quan5Shared.takeoverPrice(rec.price);
    var payout = Quan5Shared.takeoverPayout(rec.paid || rec.price);
    var key3 = 'other:' + b.id + ':' + (rec.ownerName || '') + ':' + rec.price + ':' + (rec.shopType || '');
    if (row && lastHouseRowKey !== key3) {
      lastHouseRowKey = key3;
      row.className = 'house-data';
      var otherSign = rec.shopType ? ' — ' + Quan5Shared.escapeHtml(Quan5Shared.SHOP_TYPES[rec.shopType]) : '';
      row.innerHTML = '<span class="house-name">🏠 Nhà của ' + Quan5Shared.escapeHtml(rec.ownerName || '') + ': ' + Quan5Shared.escapeHtml(houseDisplayName(b)) + '</span>' + otherSign + ' — mua lại <span class="house-price">' + fmtMoney(newPrice) + '</span> (+25% so với ' + fmtMoney(rec.price) + ')';
    }
    buyBtn.style.display = '';
    buyBtn.textContent = '🏠 Mua lại (+25%): ' + fmtMoney(newPrice) + ' (bạn có ' + fmtMoney(myTien) + ')';
    buyBtn.onclick = function () {
      if (!confirm('Mua lại ' + houseDisplayName(b) + ' của ' + (rec.ownerName || '') + ' với ' + fmtMoney(newPrice) + '? Chủ cũ nhận lại ' + fmtMoney(payout) + ' (gốc + 15% lời).')) return;
      houseAction(buyBtn, 'takeover', b.id);
    };
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
    // Banner đường nhỏ lại (từ 7 xuống 4,2) và chỉ hiện 2 giây rồi mờ
    // dần, để không chắn tầm nhìn giữa màn hình như bản cũ. Đường lớn
    // đã có nhãn cố định trên bản đồ nên không cần banner động.
    dynStreetSprite = textSprite(ns.name, 4.2);
    scene.add(dynStreetSprite);
    dynStreetName = ns.name;
    streetShowUntil = Date.now() + 2000;
    dynStreetSprite.visible = true;
    dynStreetSprite.material.opacity = 1;
  } else if (!dynStreetSprite.visible) {
    // Quay lại đường nhỏ cũ sau khi đi qua đường lớn: hiện lại 2 giây
    // rồi mờ, thay vì để ẩn hẳn. Còn đang hiện thì animate tự mờ dần,
    // updateNear không được reset opacity mỗi tick poll.
    dynStreetSprite.visible = true;
    dynStreetSprite.material.opacity = 1;
    streetShowUntil = Date.now() + 2000;
  }
  dynStreetSprite.position.set(ns.x, 2.8, ns.z);
}
function updateNear() {
  var nl = nearestLandmark();
  var ctxLandmark = document.getElementById('ctxLandmark');
  var landmarkNear = !!(nl.L && nl.d <= Quan5Shared.CHECKIN_CLIENT_MAX_DISTANCE);
  if (landmarkNear) {
    ctxLandmark.style.display = '';
    document.getElementById('ctxLandmarkName').textContent = '📍 ' + nl.L.name;
    document.getElementById('ctxLandmarkDesc').textContent = nl.L.desc || '';
    document.getElementById('ctxCheckinBtn').textContent = '📸 Check-in ' + nl.L.name;
  } else {
    ctxLandmark.style.display = 'none';
  }
  var ns = nearestStreet();
  document.getElementById('streetLabel').textContent = ns ? ns.name : 'Quận 5';
  updateStreetLabel(ns);
  updateHouseUI();
  var ctxHouse = document.getElementById('ctxHouse');
  var houseNear = !!(ctxHouse && ctxHouse.style.display !== 'none');
  var popup = document.getElementById('ctxPopup');
  // Lỗi đã sửa 2026-11-04: trước đây đặt style.display = '' để hiện
  // popup, nhưng CSS #ctxPopup có display:none nên '' chỉ quay về none
  // và popup không bao giờ hiện. Phải đặt 'block' tường minh.
  if (popup) popup.style.display = (landmarkNear || houseNear) ? 'block' : 'none';
}
// Một hàm duy nhất cho mọi nút hành động (Quick Dock + popup check-in),
// để logic khoảng cách, tư thế và hiệu ứng không bị nhân đôi. Tư thế
// an/cafe/mua được gửi qua heartbeat nên người khác cũng thấy nhân vật
// đang cầm tô, cầm ly hay cầm lồng đèn.
function doAction(btn, type) {
  if (!playerId || btn.disabled) return;
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
  } else if (type === 'an') {
    setPose('an', Date.now() + 1200);
  } else if (type === 'cafe') {
    setPose('cafe', Date.now() + 1200);
  } else if (type === 'mua') {
    setPose('mua', Date.now() + 1200);
  }
  // Chống bấm đúp: khóa nút cho tới khi server trả lời, server còn
  // chặn thêm bằng cooldown 1 giây, nên bấm nhanh cũng không gửi trùng.
  setBusy(btn, true);
  postJson('api/action', { room: room, playerId: playerId, type: type, value: value }).then(function (j) {
    j = j || {};
    // Buff tốc độ: server trả buffUntil tuyệt đối. Chỉ hiện chữ bay khi
    // buff vừa được cấp mới trên hành động này (trước đó chưa có buff),
    // còn buff đang chạy mà bấm tiếp thì chỉ gia hạn âm thầm, không spam.
    if (typeof j.buffUntil === 'number' && j.buffUntil > Date.now() && !(myBuffUntil > Date.now())) {
      if (myGroup) spawnFloatingText(myGroup.position, '⚡ Tốc độ +15% (30s)');
    }
    if (typeof j.buffUntil === 'number') myBuffUntil = j.buffUntil;
    if (j.shopIncome && myGroup) {
      spawnFloatingText(myGroup.position, '💰 Ủng hộ ' + j.shopIncome.ownerName + ' ' + fmtMoney(j.shopIncome.amount));
    }
    if (!myGroup) return;
    if (type === 'checkin') {
      spawnFloatingText(myGroup.position, '+' + Quan5Shared.ACTIONS.checkin.diem + '⭐ +' + fmtMoney(Quan5Shared.CHECKIN_TIEN));
      spawnBurst(myGroup.position, ACTION_BURST_COLORS.checkin);
    } else if (Quan5Shared.ACTIONS[type] && Quan5Shared.ACTIONS[type].diem > 0) {
      spawnFloatingText(myGroup.position, '+' + Quan5Shared.ACTIONS[type].diem + '⭐');
      spawnBurst(myGroup.position, ACTION_BURST_COLORS[type] || 0xffffff);
    }
  }).catch(function (e) {
    showErrorToast(e.message || 'Không thực hiện được hành động.');
  }).finally(function () { setBusy(btn, false); });
}
document.querySelectorAll('#quickPanel button[data-action]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    doAction(btn, btn.getAttribute('data-action'));
  });
});
document.getElementById('ctxCheckinBtn').addEventListener('click', function () {
  doAction(document.getElementById('ctxCheckinBtn'), 'checkin');
});
document.getElementById('buoiBtn').addEventListener('click', function () {
  var btn = document.getElementById('buoiBtn');
  if (!playerId || btn.disabled) return;
  var next = buoiOrder[(buoiOrder.indexOf(curBuoi) + 1) % buoiOrder.length];
  // Không đổi buổi ở client trước rồi để server sửa lại: chỉ đổi khi
  // server xác nhận, để buổi ở client và server không bao giờ lệch nhau.
  setBusy(btn, true);
  postJson('api/action', { room: room, playerId: playerId, type: 'buoi', value: next }).then(function (j) {
    if (j.buoi) applyBuoi(j.buoi);
  }).catch(function (e) {
    showErrorToast(e.message || 'Không đổi buổi được.');
  }).finally(function () { setBusy(btn, false); });
});
document.getElementById('joinBtn').addEventListener('click', function () {
  if (!MAP) return;
  var joinBtn = document.getElementById('joinBtn');
  var codeCheck = Quan5Shared.validateRoomCode(roomInput.value.trim() || 'QUAN5');
  if (!codeCheck.ok) {
    setJoinError(codeCheck.error);
    return;
  }
  var code = codeCheck.value;
  var nameRaw = nameInput.value.trim();
  if (nameRaw) {
    var nameCheck = Quan5Shared.validatePlayerName(nameRaw);
    if (!nameCheck.ok) {
      setJoinError(nameCheck.error);
      return;
    }
  }
  var colorCheck = Quan5Shared.validateColor(selectedRobe);
  if (!colorCheck.ok) {
    setJoinError(colorCheck.error);
    return;
  }
  setJoinError('');
  setBusy(joinBtn, true);
  setJoinFormDisabled(true);
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
    shareUrl = location.origin + location.pathname + '?room=' + room;
    document.getElementById('tien').textContent = fmtMoney(myTien);
    updateHomeLabel();
    myGroup = ensurePerson({ id: playerId, name: myName, robe: selectedRobe, skin: '#ffe0bd', x: myPos.x, z: myPos.z, rot: 0 });
    applyBuoi('sang');
  }).catch(function (e) {
    setJoinError('Không vào được: ' + (e.message || 'lỗi không rõ'));
    setBusy(joinBtn, false);
    setJoinFormDisabled(false);
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
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function animate() {
  requestAnimationFrame(animate);
  if (!RENDER_OK || !clock) return;
  var dt = Math.min(clock.getDelta(), 0.05);
  var t = clock.elapsedTime;
  stepBuoiTransition(dt);
  var myMoving = false;
  if (playerId && myGroup) {
    if (poseUntil && Date.now() > poseUntil) { setPose('dung', 0); }
    var fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0) - joy.y;
    var str = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joy.x;
    myMoving = !!(fwd || str);
    if (myMoving) {
      var fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = -fz, rz = fx;
      var mx2 = rx * str + fx * fwd, mz2 = rz * str + fz * fwd, len = Math.hypot(mx2, mz2);
      mx2 /= len;
      mz2 /= len;
      // Buff tốc độ shophouse: +15% trong 30 giây sau khi ghé quán, tốc
      // độ gốc 9 không đổi khi không có buff.
      var speed = 9 * (myBuffUntil > Date.now() ? 1.15 : 1);
      var nx = Math.max(-140, Math.min(140, myPos.x + mx2 * speed * dt));
      var nz = Math.max(-75, Math.min(75, myPos.z + mz2 * speed * dt));
      var stuck = blockedAt(myPos.x, myPos.z);
      if (!blockedAt(nx, myPos.z) || stuck) myPos.x = nx;
      if (!blockedAt(myPos.x, nz) || stuck) myPos.z = nz;
      myPos.rot = Math.atan2(mx2, mz2);
      myGroup.position.set(myPos.x, 0, myPos.z);
      swingPhase += dt * 11;
    }
    // Xoay người mượt theo hướng joystick: lerp góc (có wrap ±π) thay
    // vì gán tức thì như bản cũ, để nhân vật quay tròn mượt, không giật.
    myGroup.rotation.y += wrapAngle(myPos.rot - myGroup.rotation.y) * (1 - Math.exp(-dt * 12));
    var camDist = innerWidth < innerHeight ? 13 : 10;
    camera.position.set(myPos.x + Math.sin(camYaw) * camDist, 6.5, myPos.z + Math.cos(camYaw) * camDist);
    camera.lookAt(myPos.x, 1.6, myPos.z);
    // Huy hiệu buff tốc độ trên top bar: chỉ đổi display khi trạng thái
    // đổi, không gán lại mỗi frame để khỏi layout lại vô ích.
    var buffActive = myBuffUntil > Date.now();
    if (buffActive !== buffShown) {
      buffShown = buffActive;
      var buffEl = document.getElementById('buffLabel');
      if (buffEl) buffEl.style.display = buffActive ? '' : 'none';
    }
  }
  Object.keys(people).forEach(function (id) {
    var g = people[id], u = g.userData;
    var moving, phase;
    if (id === playerId) {
      moving = myMoving;
      phase = swingPhase;
    } else if (g.userData.target) {
      var tg = g.userData.target;
      var dx = tg.x - g.position.x, dz = tg.z - g.position.z;
      moving = Math.hypot(dx, dz) > 0.15;
      g.position.x += dx * 0.3;
      g.position.z += dz * 0.3;
      g.rotation.y += wrapAngle(tg.rot - g.rotation.y) * (1 - Math.exp(-dt * 12));
      phase = t * 10 + (hashStr(id) % 10);
    } else {
      moving = false;
      phase = t * 10;
    }
    applyPoseToGroup(g, t, moving, phase);
    // Nhãn tên co giãn theo khoảng cách camera: gần thì nhỏ lại cho
    // tinh tế, xa thì to lên cho vẫn đọc được, kẹp trong 0,75-1,5 lần.
    if (u.nameSprite && camera) {
      var dist = camera.position.distanceTo(g.position);
      var f = Math.max(0.75, Math.min(1.5, dist / 14));
      u.nameSprite.scale.set(u.nameBase.x * f, u.nameBase.y * f, 1);
    }
  });
  // Pin landmark nhấp nhô + vòng sáng pulse, vòng nhà gần pulse nhẹ.
  landmarkPins.forEach(function (entry) {
    var s = Math.sin(t * 2 + entry.phase);
    entry.pin.position.y = s * 0.3;
    var rs = (entry.ringBase || 3) * (1 + s * 0.08);
    entry.ring.scale.set(rs, rs, rs);
  });
  if (houseRing && houseRing.visible && houseRingBase) {
    var hs = houseRingBase * (1 + Math.sin(t * 3) * 0.05);
    houseRing.scale.set(hs, hs, hs);
  }
  if (dynStreetSprite && dynStreetSprite.visible && Date.now() > streetShowUntil) {
    dynStreetSprite.material.opacity -= dt * 2;
    if (dynStreetSprite.material.opacity <= 0) dynStreetSprite.visible = false;
  }
  for (var fi = floatingTexts.length - 1; fi >= 0; fi--) {
    var ft = floatingTexts[fi];
    ft.life -= dt;
    ft.sp.position.y += dt * 1.4;
    ft.sp.material.opacity = Math.max(0, ft.life / ft.max);
    if (ft.life <= 0) {
      scene.remove(ft.sp);
      disposeObject(ft.sp);
      floatingTexts.splice(fi, 1);
    }
  }
  for (var pi = particles.length - 1; pi >= 0; pi--) {
    var ps = particles[pi];
    ps.life -= dt;
    var posAttr = ps.points.geometry.attributes.position;
    var arr = posAttr.array;
    for (var k = 0; k < ps.vel.length / 3; k++) {
      arr[k * 3] += ps.vel[k * 3] * dt;
      arr[k * 3 + 1] += ps.vel[k * 3 + 1] * dt;
      arr[k * 3 + 2] += ps.vel[k * 3 + 2] * dt;
      ps.vel[k * 3 + 1] -= 4 * dt;
    }
    posAttr.needsUpdate = true;
    ps.points.material.opacity = Math.max(0, ps.life / ps.max);
    if (ps.life <= 0) {
      scene.remove(ps.points);
      ps.points.geometry.dispose();
      ps.points.material.dispose();
      particles.splice(pi, 1);
    }
  }
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
function pollOnce() {
  if (!playerId) return Promise.resolve();
  return postJson('api/heartbeat', { room: room, playerId: playerId, x: myPos.x, z: myPos.z, rot: myPos.rot, pose: pose }).then(function () {
    return getState(room);
  }).then(function (st) {
    showPollError(false);
    firstStateDone = true;
    if (st.buoi && st.buoi !== curBuoi) applyBuoi(st.buoi);
    lastPlayers = st.players || [];
    document.getElementById('count').textContent = lastPlayers.length;
    // Chỉ có một mình: nút Mời bạn nhấp nháy để gợi ý mời, thay cho
    // bảng gợi ý riêng đã bỏ ở HUD mới.
    var invBtn = document.getElementById('inviteBtn');
    if (invBtn) invBtn.classList.toggle('pulse', lastPlayers.length === 1);
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
        if (typeof p.buffUntil === 'number') myBuffUntil = p.buffUntil;
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
      renderFeed(st.events || [], 'data');
    }
    var lbJson = JSON.stringify(st.leaderboard || []);
    if (lbJson !== lastLeaderboardJson) {
      lastLeaderboardJson = lbJson;
      renderLeaderboard(st.leaderboard || []);
    }
    // Đồng bộ hiệu ứng cho người khác: event mới (sau lần poll đầu,
    // để không nổ tung với 30 event cũ lúc mới vào) mà không phải của
    // mình thì hiện chữ bay + hạt tại vị trí nhân vật đó, vì feed event
    // đã là kênh multiplayer sẵn có của phòng.
    var evts = st.events || [];
    if (!firstPollEventsDone) {
      evts.forEach(function (e) { if (e.at && e.at > lastEventSeenAt) lastEventSeenAt = e.at; });
      firstPollEventsDone = true;
    } else {
      evts.forEach(function (e) {
        if (!e.at || e.at <= lastEventSeenAt) return;
        if (e.at > lastEventSeenAt) lastEventSeenAt = e.at;
        if (e.playerId === playerId) return;
        var g = people[e.playerId];
        if (!g) return;
        if (e.type === 'checkin') {
          spawnFloatingText(g.position, '+' + Quan5Shared.ACTIONS.checkin.diem + '⭐ +' + fmtMoney(Quan5Shared.CHECKIN_TIEN));
          spawnBurst(g.position, ACTION_BURST_COLORS.checkin);
        } else if (e.type === 'house') {
          if (e.message && e.message.indexOf('đã mua') !== -1) {
            spawnFloatingText(g.position, '🏠 Đã mua nhà!');
            spawnBurst(g.position, 0xf9a825);
          } else if (e.message && e.message.indexOf('đã bán') !== -1) {
            spawnFloatingText(g.position, '🏠 Đã bán nhà!');
            spawnBurst(g.position, 0x66bb6a);
          }
        } else if (Quan5Shared.ACTIONS[e.type] && Quan5Shared.ACTIONS[e.type].diem > 0) {
          spawnFloatingText(g.position, '+' + Quan5Shared.ACTIONS[e.type].diem + '⭐');
          spawnBurst(g.position, ACTION_BURST_COLORS[e.type] || 0xffffff);
        }
      });
    }
    updateNear();
    drawMinimap();
    var modal = document.getElementById('mapModal');
    if (modal && modal.classList.contains('open')) drawBigMap();
  }).catch(function (e) {
    // Session hết hạn thì hiện lại màn hình vào ngay, không để người chơi
    // tưởng mình vẫn đang chơi trong khi server đã prune phiên.
    if (e && (e.code === 'SESSION_NOT_FOUND' || e.code === 'ROOM_NOT_FOUND')) {
      handleSessionExpired(e.message);
      return;
    }
    // Lỗi mạng/timeout: banner lỗi bền vững (không tự ẩn như toast),
    // kèm nút Thử lại gọi pollOnce ngay, các tick sau vẫn tự thử lại.
    // Feed chưa từng tải được thì hiện trạng thái Error kèm Retry.
    showPollError(true);
    if (!firstStateDone) renderFeed([], 'error');
  });
}
setInterval(pollOnce, 400);
function loadMap() {
  // Three.js CDN fail thì không phí một lần tải bản đồ: hiện thẳng
  // trạng thái Error, nút Thử lại sẽ tải lại trang (render.js đã ghi
  // cùng thông báo này lúc khởi động, loadMap chỉ chuẩn hóa lại trạng
  // thái để skeleton không hiện sai).
  if (!RENDER_OK) {
    setMapState('error', 'Không tải được thư viện 3D (Three.js từ CDN). Vui lòng kiểm tra mạng rồi bấm Thử lại để tải lại trang.');
    var retryEarly = document.getElementById('retryMapBtn');
    if (retryEarly) { retryEarly.textContent = 'Thử tải lại trang'; retryEarly.onclick = function () { location.reload(); }; }
    return;
  }
  setMapState('loading', 'Đang tải bản đồ thật từ OpenStreetMap…');
  getMapJson().then(function (j) {
    MAP = j;
    buildMap();
    buildMinimapStatic();
    initHouseMarker();
    setMapState('success', 'Đã tải xong bản đồ thật: ' + j.roads.length + ' đoạn đường, ' + j.buildings.length + ' nhà trên nền vàng có thể mua bán (không nhà trên đường), ' + j.landmarks.length + ' landmark trong ranh Quận 5.');
    camera.position.set(myPos.x, 6.5, myPos.z + 10);
    camera.lookAt(myPos.x, 1.6, myPos.z);
  }).catch(function (e) {
    setMapState('error', 'Không tải được bản đồ thật (' + (e.message || 'lỗi không rõ') + '). Vui lòng kiểm tra mạng rồi bấm Thử lại.');
    var retryBtn = document.getElementById('retryMapBtn');
    if (retryBtn) {
      retryBtn.textContent = 'Thử tải lại bản đồ';
      retryBtn.onclick = function () { loadMap(); };
    }
  });
}
loadMap();
})();
