import { Router, Response } from 'express';
import { z } from 'zod';
import { PreferencesService } from '../services/preferences.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.middleware.js';
import { ValidationError } from '../middleware/error.middleware.js';

const router = Router();

const notificationChannelSchema = z.enum(['in_app', 'email', 'webhook']);

const updatePreferencesSchema = z.object({
  taskAssigned: z.array(notificationChannelSchema).optional(),
  taskStatusChanged: z.array(notificationChannelSchema).optional(),
  commentAdded: z.array(notificationChannelSchema).optional(),
  projectInvited: z.array(notificationChannelSchema).optional(),
  taskDueSoon: z.array(notificationChannelSchema).optional(),
}).strict();

// GET /preferences - get user notification preferences (with defaults)
router.get('/preferences', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new PreferencesService(db);
  const preferences = service.get(req.userId!);
  res.json({ success: true, data: preferences });
});

// PUT /preferences - update preferences
router.put('/preferences', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid preferences data', parsed.error.flatten().fieldErrors);
  }

  const db = req.app.get('db');
  const service = new PreferencesService(db);
  const preferences = service.update(req.userId!, parsed.data);
  res.json({ success: true, data: preferences });
});

export default router;
