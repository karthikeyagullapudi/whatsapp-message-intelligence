import { Router } from 'express';
import { param, query } from 'express-validator';
import { validateRules } from '../../middleware/validate.js';
import { CATEGORIES } from '../ai/ai.schema.js';
import { PROCESSING_STATUSES } from './message.model.js';
import { createMessageController } from './message.controller.js';

export const idParam = param('id').isMongoId().withMessage('must be a valid message id');

// Only messages from this WhatsApp group (the UI passes the selected group).
const groupRule = query('groupId').optional().isString().matches(/^[\w.-]+@g\.us$/).withMessage('must be a WhatsApp group id ending in @g.us');

// Simple HTTP inputs (ids, query filters) → express-validator.
const listRules = [
  groupRule,
  query('status').optional().isIn(PROCESSING_STATUSES).withMessage(`must be one of: ${PROCESSING_STATUSES.join(', ')}`),
  query('category').optional().isIn(CATEGORIES).withMessage(`must be one of: ${CATEGORIES.join(', ')}`),
  query('q').optional().isString().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['newest', 'oldest']),
];

export function messageRoutes(service) {
  const router = Router();
  const c = createMessageController(service);

  router.get('/', validateRules(listRules), c.list);
  router.get('/stats', validateRules([groupRule]), c.stats);
  router.get('/:id', validateRules([idParam]), c.get);
  router.get('/:id/media', validateRules([idParam]), c.media);
  router.post('/:id/retry', validateRules([idParam]), c.retry);

  return router;
}
