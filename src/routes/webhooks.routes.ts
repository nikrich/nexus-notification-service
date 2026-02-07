import { Router, Response } from 'express';
import { z } from 'zod';
import { WebhookService } from '../services/webhook.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { NotFoundError, ValidationError } from '../middleware/error.middleware.js';

const router = Router();

const notificationTypeSchema = z.enum([
  'task_assigned',
  'task_status_changed',
  'comment_added',
  'project_invited',
  'task_due_soon',
]);

const createWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(1),
  events: z.array(notificationTypeSchema).min(1),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().min(1).optional(),
  events: z.array(notificationTypeSchema).min(1).optional(),
  active: z.boolean().optional(),
}).strict();

// POST /webhooks - create webhook config
router.post('/webhooks', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const parsed = createWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid webhook data', parsed.error.flatten().fieldErrors);
  }

  const db = req.app.get('db');
  const service = new WebhookService(db);
  const webhook = service.create(req.userId!, parsed.data);
  res.status(201).json({ success: true, data: webhook });
});

// GET /webhooks - list user's webhooks
router.get('/webhooks', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new WebhookService(db);
  const webhooks = service.list(req.userId!);
  res.json({ success: true, data: webhooks });
});

// PATCH /webhooks/:id - update webhook
router.patch('/webhooks/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid webhook update data', parsed.error.flatten().fieldErrors);
  }

  const db = req.app.get('db');
  const service = new WebhookService(db);
  const webhook = service.update(req.params.id, req.userId!, parsed.data);

  if (!webhook) {
    throw new NotFoundError('Webhook not found');
  }

  res.json({ success: true, data: webhook });
});

// DELETE /webhooks/:id - delete webhook
router.delete('/webhooks/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new WebhookService(db);
  const deleted = service.delete(req.params.id, req.userId!);

  if (!deleted) {
    throw new NotFoundError('Webhook not found');
  }

  res.json({ success: true, data: { deleted: true } });
});

// GET /webhooks/:id/deliveries - list delivery history
router.get('/webhooks/:id/deliveries', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new WebhookService(db);
  const deliveries = service.getDeliveries(req.params.id, req.userId!);
  res.json({ success: true, data: deliveries });
});

export default router;
