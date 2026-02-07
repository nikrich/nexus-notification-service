import { Router, Response } from 'express';
import { z } from 'zod';
import { NotificationService } from '../services/notification.service.js';
import { AuthenticatedRequest, authMiddleware, serviceAuthMiddleware } from '../middleware/auth.middleware.js';
import { NotFoundError, ValidationError } from '../middleware/error.middleware.js';

const router = Router();

const notificationTypeSchema = z.enum([
  'task_assigned',
  'task_status_changed',
  'comment_added',
  'project_invited',
  'task_due_soon',
]);

const notificationChannelSchema = z.enum(['in_app', 'email', 'webhook']);

const sendNotificationSchema = z.object({
  userId: z.string().min(1),
  type: notificationTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  metadata: z.record(z.string()).optional(),
  channels: z.array(notificationChannelSchema).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

// POST /notifications/send - requires service token (called by other services)
router.post('/notifications/send', serviceAuthMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const parsed = sendNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid notification data', parsed.error.flatten().fieldErrors);
  }

  const db = req.app.get('db');
  const service = new NotificationService(db);
  const notifications = service.send(parsed.data);
  res.status(201).json({ success: true, data: notifications });
});

// GET /notifications - user's notifications (paginated)
router.get('/notifications', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Invalid pagination parameters', parsed.error.flatten().fieldErrors);
  }

  const db = req.app.get('db');
  const service = new NotificationService(db);
  const result = service.list(req.userId!, parsed.data);
  res.json({ success: true, data: result });
});

// PATCH /notifications/:id/read - mark as read
router.patch('/notifications/:id/read', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new NotificationService(db);
  const notification = service.markAsRead(req.params.id, req.userId!);

  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  res.json({ success: true, data: notification });
});

// POST /notifications/read-all - mark all as read
router.post('/notifications/read-all', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new NotificationService(db);
  const count = service.markAllAsRead(req.userId!);
  res.json({ success: true, data: { updated: count } });
});

// GET /notifications/unread-count - get unread count
router.get('/notifications/unread-count', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new NotificationService(db);
  const count = service.getUnreadCount(req.userId!);
  res.json({ success: true, data: { count } });
});

export default router;
