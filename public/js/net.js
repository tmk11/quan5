// Net: client API thuần túy, không chạm DOM, không nuốt lỗi.
// Mọi request đều có timeout rõ ràng và lỗi có message tiếng Việt cụ thể
// cùng code từ server (nếu có) để app.js quyết định: session hết hạn thì
// hiện lại màn hình vào, lỗi mạng thì toast một lần rồi thử lại ở tick sau.
// Bản cũ dùng .catch(function(){}) ở nhiều chỗ nên mất mạng là game đóng
// băng âm thầm, không có cách nào biết.
'use strict';
function apiError(message, code, status) {
  var e = new Error(message);
  e.code = code || null;
  e.status = status || 0;
  return e;
}
function fetchWithTimeout(url, options, timeoutMs) {
  var controller = null;
  var timer = null;
  var opts = options || {};
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    opts.signal = controller.signal;
    timer = setTimeout(function () {
      try { controller.abort(); } catch (e) {}
    }, timeoutMs);
  }
  return fetch(url, opts).then(function (res) {
    if (timer) clearTimeout(timer);
    return res;
  }, function (err) {
    if (timer) clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw apiError('Hết thời gian chờ máy chủ (' + Math.round(timeoutMs / 1000) + ' giây), vui lòng kiểm tra mạng rồi thử lại.', 'TIMEOUT', 0);
    }
    throw apiError('Không kết nối được tới máy chủ, vui lòng kiểm tra mạng rồi thử lại.', 'NETWORK', 0);
  });
}
function postJson(p, b) {
  return fetchWithTimeout(p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b)
  }, 10000).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) {
        throw apiError(j.error || ('Lỗi ' + r.status), j.code || null, r.status);
      }
      return j;
    }, function () {
      throw apiError('Máy chủ trả về dữ liệu không hợp lệ (HTTP ' + r.status + ').', 'BAD_RESPONSE', r.status);
    });
  });
}
function getState(room) {
  return fetchWithTimeout('api/state?room=' + encodeURIComponent(room), {}, 8000).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) {
        throw apiError(j.error || ('Lỗi ' + r.status), j.code || null, r.status);
      }
      return j;
    }, function () {
      throw apiError('Máy chủ trả về dữ liệu không hợp lệ (HTTP ' + r.status + ').', 'BAD_RESPONSE', r.status);
    });
  });
}
function getMapJson() {
  return fetchWithTimeout('quan5-map.json', {}, 15000).then(function (r) {
    if (!r.ok) {
      throw apiError('Không tải được bản đồ thật (HTTP ' + r.status + ').', 'MAP_HTTP', r.status);
    }
    return r.json();
  }, function (e) {
    if (e && e.code) throw e;
    throw apiError('Không tải được bản đồ thật: dữ liệu không hợp lệ.', 'MAP_BAD', 0);
  });
}
