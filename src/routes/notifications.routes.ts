import { Router, Response } from 'express';
import { NotificationService } from '../services/notification.service.js';
import { AuthenticatedRequest, authMiddleware, serviceAuthMiddleware } from '../middleware/auth.middleware.js';
import { NotFoundError } from '../middleware/error.middleware.js';

const router = Router();

// POST /notifications/send - requires service token (called by other services)
router.post('/notifications/send', serviceAuthMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new NotificationService(db);
  const { userId, type, title, body, metadata, channels } = req.body;

  const notifications = service.send({ userId, type, title, body, metadata, channels });
  res.status(201).json({ success: true, data: notifications });
});

// GET /notifications - user's notifications (paginated)
router.get('/notifications', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new NotificationService(db);
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const result = service.list(req.userId!, { page, pageSize });
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
