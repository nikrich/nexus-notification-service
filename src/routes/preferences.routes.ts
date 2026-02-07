import { Router, Response } from 'express';
import { PreferencesService } from '../services/preferences.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// GET /preferences - get user notification preferences (with defaults)
router.get('/preferences', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new PreferencesService(db);
  const preferences = service.get(req.userId!);
  res.json({ success: true, data: preferences });
});

// PUT /preferences - update preferences
router.put('/preferences', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const db = req.app.get('db');
  const service = new PreferencesService(db);
  const preferences = service.update(req.userId!, req.body);
  res.json({ success: true, data: preferences });
});

export default router;
