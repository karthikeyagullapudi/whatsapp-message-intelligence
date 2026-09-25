// An error we throw on purpose. It carries an HTTP status and a stable code,
// so the error handler can turn it into a clean JSON response.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message) {
    return new AppError(409, 'CONFLICT', message);
  }

  static badGateway(message) {
    return new AppError(502, 'UPSTREAM_ERROR', message);
  }

  static unavailable(message) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }
}
