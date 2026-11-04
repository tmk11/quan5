// Lỗi có cấu trúc cho toàn bộ server. Mọi lỗi gửi về client đều phải qua
// AppError hoặc được chuyển thành AppError ở dispatcher, không bao giờ gửi
// stack trace hay chi tiết nội bộ ra ngoài.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

function badRequest(message) {
  return new AppError(400, 'VALIDATION_ERROR', message);
}
function notFound(message) {
  return new AppError(404, 'NOT_FOUND', message);
}
function rateLimited(message) {
  return new AppError(429, 'RATE_LIMITED', message);
}
function internal(message) {
  return new AppError(500, 'INTERNAL_ERROR', message);
}
function isAppError(err) {
  return err instanceof AppError;
}
// Lỗi gửi về client: chỉ có code và message thân thiện, không có stack.
function toClientJson(err) {
  if (isAppError(err)) {
    return { error: err.message, code: err.code };
  }
  return { error: 'Lỗi hệ thống, vui lòng thử lại sau.', code: 'INTERNAL_ERROR' };
}
function statusOf(err) {
  return isAppError(err) ? err.status : 500;
}

module.exports = {
  AppError,
  badRequest,
  notFound,
  rateLimited,
  internal,
  isAppError,
  toClientJson,
  statusOf
};
