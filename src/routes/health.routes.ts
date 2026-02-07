import { Router, Request, Response } from 'express';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
