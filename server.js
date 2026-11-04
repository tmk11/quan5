// Thành phố Quận 5 Online — entry point mỏng.
// Mọi logic đã tách vào src/: validate, mapStore, economyStore, rooms,
// rateLimit, handlers, static. File này chỉ làm 3 việc: khởi động có kiểm
// tra, định tuyến, và bắt lỗi toàn cục để không một request hỏng nào làm
// sập tiến trình một cách âm thầm.
// Tiền là tiền trong game, không phải tiền thật. Chủ nhà và tiền gắn với
// deviceId của trình duyệt (localStorage), không có mật khẩu ở v1 — ai dùng
// cùng thiết bị/trình duyệt thì dùng chung ví, xóa localStorage là mất ví.
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./src/config.js');
const { AppError } = require('./src/errors.js');
const { sendJson, sendError, readBody, clientIp } = require('./src/httpUtil.js');
const { MapStore } = require('./src/mapStore.js');
const { EconomyStore } = require('./src/economyStore.js');
const { RoomStore } = require('./src/rooms.js');
const { RateLimiter } = require('./src/rateLimit.js');
const handlers = require('./src/handlers.js');
const { serveStatic } = require('./src/static.js');

let version = '1.3.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(config.ROOT_DIR, 'package.json'), 'utf8'));
  if (pkg && typeof pkg.version === 'string') {
    version = pkg.version;
  }
} catch (e) {
  console.error('[' + new Date().toISOString() + '] Không đọc được package.json để lấy version: ' + e.message + '. Dùng version mặc định ' + version + '.');
}

const mapStore = new MapStore();
const economyStore = new EconomyStore();
const roomStore = new RoomStore();
const actionLimiter = new RateLimiter(
  config.RATE_LIMIT_WINDOW_MS,
  config.RATE_LIMIT_MAX_ACTIONS
);
const joinLimiter = new RateLimiter(
  config.RATE_LIMIT_WINDOW_MS,
  10
);
const ctx = {
  mapStore,
  economyStore,
  roomStore,
  actionLimiter,
  joinLimiter,
  version,
  httpUtil: { readBody, clientIp }
};

function startup() {
  // Fail nhanh nếu cấu hình hoặc dữ liệu cốt lõi hỏng, thay vì chạy với
  // trạng thái nửa vời rồi mất tiền/nhà một cách âm thầm.
  const port = config.readPort();
  const econSummary = economyStore.load();
  console.error(
    '[' + new Date().toISOString() + '] Sổ kinh tế đã tải: ' +
    econSummary.players + ' ví, ' + econSummary.houses + ' nhà' +
    (econSummary.restoredFromBackup ? ' (khôi phục từ backup)' : '') + '.'
  );
  const mapSummary = mapStore.summary();
  console.error(
    '[' + new Date().toISOString() + '] Bản đồ đã tải: ' +
    mapSummary.roads + ' đường, ' + mapSummary.buildings + ' nhà, ' +
    mapSummary.landmarks + ' landmark.'
  );
  return port;
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    sendError(res, new AppError(400, 'INVALID_URL', 'URL không hợp lệ: ' + e.message + '.'));
    return;
  }
  const pathname = url.pathname;
  // Access log: ghi mọi request với status và thời gian xử lý để vận hành
  // và debug không phải đoán mò khi client báo lỗi mà server im lặng.
  const logAccess = () => {
    console.error(
      '[' + new Date().toISOString() + '] ACCESS ' + req.method + ' ' + pathname +
      ' -> ' + res.statusCode + (res.headersSent ? '' : ' (chưa gửi response)') +
      ' ' + (Date.now() - startedAt) + 'ms'
    );
  };
  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      await handlers.handleHealth(req, res, ctx);
    } else if (req.method === 'POST' && pathname === '/api/join') {
      await handlers.handleJoin(req, res, ctx);
    } else if (req.method === 'POST' && pathname === '/api/heartbeat') {
      await handlers.handleHeartbeat(req, res, ctx);
    } else if (req.method === 'POST' && pathname === '/api/action') {
      await handlers.handleAction(req, res, ctx);
    } else if (req.method === 'POST' && pathname === '/api/house') {
      await handlers.handleHouse(req, res, ctx);
    } else if (req.method === 'GET' && pathname === '/api/state') {
      await handlers.handleState(req, res, ctx, url.searchParams);
    } else if (req.method === 'GET' && (
      pathname === '/' || pathname === '/index.html' ||
      pathname === '/quan5-map.json' ||
      (pathname.startsWith('/js/') && pathname.endsWith('.js')) ||
      (pathname.startsWith('/css/') && pathname.endsWith('.css'))
    )) {
      serveStatic(req, res, pathname);
    } else {
      sendJson(res, 404, { error: 'Không tìm thấy đường dẫn: ' + req.method + ' ' + pathname + '.', code: 'NOT_FOUND' });
    }
  } catch (err) {
    // Mọi lỗi chưa được handler xử lý đều qua đây: log đầy đủ ra console
    // của server, trả về client message chung, không lộ stack.
    if (!(err instanceof AppError)) {
      console.error(
        '[' + new Date().toISOString() + '] Lỗi chưa xử lý ở ' +
        req.method + ' ' + pathname + ': ' + (err && err.stack ? err.stack : String(err))
      );
    }
    if (!res.headersSent) {
      sendError(res, err);
    } else {
      try {
        res.end();
      } catch (e) {
        // Response đã gửi dở, không còn gì để làm thêm.
      }
    }
  } finally {
    logAccess();
  }
});

process.on('unhandledRejection', (reason) => {
  console.error(
    '[' + new Date().toISOString() + '] Unhandled rejection, server sẽ thoát để systemd khởi động lại ở trạng thái sạch: ' +
    (reason && reason.stack ? reason.stack : String(reason))
  );
  process.exit(1);
});
function shutdown(signal) {
  console.error('[' + new Date().toISOString() + '] Nhận ' + signal + ', đang dừng server.');
  // Đóng luôn các kết nối keep-alive đang chờ, nếu không server.close()
  // sẽ chờ tới khi client tự đóng (mặc định 5 giây) mới thoát được, gây
  // kẹt cổng khi restart/deploy.
  try {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  } catch (e) {
    // closeAllConnections không có trên Node cũ, bỏ qua và dùng close().
  }
  server.close(() => process.exit(0));
  // An toàn cuối: nếu close() vẫn kẹt quá 2 giây thì thoát cưỡng bức để
  // systemd không phải chờ timeout dài.
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

let port;
try {
  port = startup();
} catch (e) {
  console.error(
    '[' + new Date().toISOString() + '] Khởi động thất bại: ' + e.message
  );
  process.exit(1);
}
server.listen(port, config.HOST, () => {
  console.log('Quan 5 Online dang chay tai http://' + config.HOST + ':' + port + '/');
});

module.exports = { server, ctx };
