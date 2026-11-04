// Tiện ích HTTP dùng chung: gửi JSON, gửi lỗi, đọc body.
// Mọi lỗi ở tầng này đều có message cụ thể, không có trường hợp request
// bị treo mà không có phản hồi.
const S = require('../public/js/shared-core.js');
const { AppError, badRequest, internal, toClientJson, statusOf } = require('./errors.js');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
function sendError(res, err) {
  const status = statusOf(err);
  const payload = toClientJson(err);
  if (!(err instanceof AppError)) {
    console.error(
      '[' + new Date().toISOString() + '] Lỗi hệ thống không mong đợi: ' +
      (err && err.stack ? err.stack : String(err))
    );
  }
  // Khi body quá lớn, server sẽ đóng connection sau response này để client
  // không tái sử dụng socket đã bị cắt dở. Header này phải set trước khi
  // sendJson gọi writeHead.
  if (err && err.closeConnection) {
    try {
      res.setHeader('Connection', 'close');
    } catch (e) {
      // Response đã gửi, không còn gì để làm.
    }
  }
  sendJson(res, status, payload);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    let oversize = false;
    const contentType = req.headers['content-type'];
    if (contentType !== undefined && !String(contentType).includes('application/json')) {
      reject(badRequest('Content-Type phải là application/json.'));
      return;
    }
    req.on('data', (chunk) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > S.MAX_BODY_BYTES) {
        oversize = true;
        // Không destroy socket ngay: destroy làm chết connection keep-alive
        // và request sau của cùng client sẽ fail "other side closed" dù
        // server vẫn sống. Thay vào đó, đọc bỏ phần còn lại (tới 1MB thì
        // mới destroy để chống abuse), rồi trả 413 kèm Connection: close
        // khi 'end' tới, để client tự mở connection mới một cách sạch sẽ.
        if (size > 1024 * 1024) {
          settled = true;
          const err = new AppError(413, 'BODY_TOO_LARGE', 'Body quá lớn (tối đa ' + S.MAX_BODY_BYTES + ' byte).');
          err.closeConnection = true;
          reject(err);
          try {
            req.destroy();
          } catch (e) {
            // req đã đóng, không cần xử lý thêm.
          }
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) {
        return;
      }
      settled = true;
      if (oversize) {
        const err = new AppError(413, 'BODY_TOO_LARGE', 'Body quá lớn (tối đa ' + S.MAX_BODY_BYTES + ' byte).');
        err.closeConnection = true;
        reject(err);
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') {
        resolve({});
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        reject(badRequest('Body không phải là JSON hợp lệ: ' + e.message + '.'));
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(badRequest('Body phải là một JSON object.'));
        return;
      }
      resolve(parsed);
    });
    req.on('error', (e) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(internal('Lỗi đọc dữ liệu yêu cầu: ' + e.message + '.'));
    });
  });
}
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

module.exports = { sendJson, sendError, readBody, clientIp };
