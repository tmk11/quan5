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
async function fetchJson(url, options, timeoutMs) {
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = null;
  if (controller) {
    options.signal = controller.signal;
    timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  }
  try {
    var response = await fetch(url, options);
    var data = await response.json();
    if (!response.ok) {
      throw apiError(data.error || ('Lỗi ' + response.status), data.code || null, response.status);
    }
    return data;
  } catch (err) {
    if (controller && controller.signal.aborted) {
      throw apiError('Hết thời gian chờ máy chủ (' + Math.round(timeoutMs / 1000) + ' giây), vui lòng thử lại.', 'TIMEOUT', 0);
    }
    if (err instanceof SyntaxError) {
      throw apiError('Máy chủ trả về dữ liệu không hợp lệ.', 'BAD_RESPONSE', response.status);
    }
    if (err instanceof TypeError) {
      throw apiError('Không kết nối được tới máy chủ, vui lòng kiểm tra mạng rồi thử lại.', 'NETWORK', 0);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function postJson(p, b) {
  return fetchJson(p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b)
  }, 10000);
}
function getState(room, sessionId) {
  return fetchJson('api/state?room=' + encodeURIComponent(room), {
    headers: { Authorization: 'Bearer ' + sessionId }
  }, 8000);
}
function getMapJson() {
  return fetchJson('quan5-map.json', {}, 15000);
}
