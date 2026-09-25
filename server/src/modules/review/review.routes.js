import { Router } from 'express';
import { validateRules, validateSchema } from '../../middleware/validate.js';
import { idParam } from '../messages/message.routes.js';
import { createReviewController } from './review.controller.js';
import { ReviewSchema } from './review.schema.js';

// Mounted under /api/messages → PATCH /api/messages/:id/review
export function reviewRoutes(service) {
  const router = Router();
  const c = createReviewController(service);

  router.patch(
    '/:id/review',
    validateRules([idParam]), // express-validator: the URL id
    validateSchema({ body: ReviewSchema }), // zod: the structured body, shared with the AI schema
    c.approve,
  );

  return router;
}
