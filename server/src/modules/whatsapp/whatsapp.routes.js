import { Router } from 'express';
import { body } from 'express-validator';
import { validateRules } from '../../middleware/validate.js';
import { createWhatsAppController } from './whatsapp.controller.js';

// Routes only map URLs to controller methods (plus input validation).
export function whatsappRoutes(service) {
  const router = Router();
  const controller = createWhatsAppController(service);

  router.get('/status', controller.status);
  router.get('/groups', controller.groups);
  router.put(
    '/group',
    validateRules([
      body('groupId')
        .isString()
        .trim()
        .matches(/^[\w.-]+@g\.us$/)
        .withMessage('groupId must be a WhatsApp group id ending in @g.us'),
    ]),
    controller.selectGroup,
  );
  router.post('/logout', controller.logout);

  return router;
}
