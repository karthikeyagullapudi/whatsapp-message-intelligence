import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// The one place where errors become HTTP responses.
// Every error returns the same shape: { error: { code, message, details? } }.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Invalid Mongo ObjectId in a URL, e.g. /api/messages/abc
  if (err.name === 'CastError') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Invalid ${err.path}` } });
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } });
  }

  // Anything else is a bug: log the details, hide them from the client.
  (req.log ?? logger).error({ err }, 'Unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
