// Phục vụ file tĩnh trong public/ với allowlist chặt chẽ.
// Chỉ cho phép: / và /index.html, /quan5-map.json, /js/*.js, /css/*.css.
// Mọi đường dẫn khác đều 404, và đường dẫn thoát khỏi public/ đều 403.
// Không cache ở server và gửi Cache-Control: no-cache để sau mỗi lần deploy
// trình duyệt không dùng JS/CSS cũ. Đánh đổi hiệu năng này là cố ý cho
// giai đoạn hiện tại; cache theo hash sẽ làm ở phase hiệu năng sau.
const fs = require('fs');
const path = require('path');
const config = require('./config.js');
const { AppError, notFound } = require('./errors.js');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function resolveSafe(relativePath) {
  const resolved = path.resolve(config.PUBLIC_DIR, relativePath);
  const publicWithSep = config.PUBLIC_DIR + path.sep;
  if (resolved !== config.PUBLIC_DIR && !resolved.startsWith(publicWithSep)) {
    throw new AppError(403, 'FORBIDDEN', 'Đường dẫn không được phép.');
  }
  return resolved;
}

function serveFile(res, filePath, contentType) {
  let data;
  try {
    data = fs.readFileSync(filePath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw notFound('Không tìm thấy file: ' + path.basename(filePath) + '.');
    }
    throw new AppError(500, 'STATIC_READ_FAILED', 'Không đọc được file: ' + e.message + '.');
  }
  res.writeHead(200, {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
    'Content-Length': data.length
  });
  res.end(data);
}

function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, resolveSafe('index.html'), CONTENT_TYPES['.html']);
    return;
  }
  if (pathname === '/quan5-map.json') {
    serveFile(res, resolveSafe('quan5-map.json'), CONTENT_TYPES['.json']);
    return;
  }
  if (pathname.startsWith('/js/') && pathname.endsWith('.js')) {
    serveFile(res, resolveSafe(pathname.slice(1)), CONTENT_TYPES['.js']);
    return;
  }
  if (pathname.startsWith('/css/') && pathname.endsWith('.css')) {
    serveFile(res, resolveSafe(pathname.slice(1)), CONTENT_TYPES['.css']);
    return;
  }
  throw notFound('Không tìm thấy đường dẫn: ' + pathname + '.');
}

module.exports = { serveStatic };
