import { matchedData, validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';

// Two validators, one output: on success req.valid = { params, query, body };
// on failure a 400 with { error: { code, message, details: [{ path, message }] } }.
//
//  - validateRules  (express-validator) for simple HTTP inputs: ids in the URL,
//    query filters, small bodies. Good at string checks, sanitising, coercion.
//  - validateSchema (zod) for structured payloads that share a schema with the
//    rest of the app, e.g. the review body reuses the AI result schema.

const PARTS = ['params', 'query', 'body'];

// Usage: router.get('/:id', validateRules([param('id').isMongoId()]), controller.get)
export function validateRules(rules) {
  return [
    ...rules,
    (req, _res, next) => {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        const details = result.array().map((e) => ({
          path: e.type === 'field' ? `${e.location}.${e.path}` : e.type,
          message: e.msg,
        }));
        return next(AppError.badRequest('Invalid request', details));
      }
      // Only fields that had a rule are kept; unknown fields are dropped.
      const valid = { ...req.valid };
      for (const part of PARTS) {
        const data = matchedData(req, { locations: [part] });
        if (Object.keys(data).length) valid[part] = { ...valid[part], ...data };
      }
      req.valid = valid;
      next();
    },
  ];
}

// Validates req.body / req.query / req.params against zod schemas.
// On success the parsed (typed, defaulted) values are stored in req.valid.
// Usage: router.patch('/:id', validateSchema({ body: ReviewSchema }), controller.review)
export function validateSchema(schemas) {
  return (req, _res, next) => {
    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (!result.success) {
        const details = result.error.issues.map((i) => ({
          path: [part, ...i.path].join('.'),
          message: i.message,
        }));
        return next(AppError.badRequest(`Invalid request ${part}`, details));
      }
      // req.query is a getter in Express 5, so store parsed values separately.
      req.valid = { ...req.valid, [part]: result.data };
    }
    next();
  };
}
