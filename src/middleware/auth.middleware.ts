import { Request, Response, NextFunction } from 'express';

const SERVICE_TOKEN = process.env.NEXUS_SERVICE_TOKEN || 'nexus-internal-service-token';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userRole = req.headers['x-user-role'] as string;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  req.userId = userId;
  req.userEmail = userEmail;
  req.userRole = userRole;
  next();
}

export function serviceAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const serviceToken = req.headers['x-service-token'] as string;

  if (serviceToken === SERVICE_TOKEN || token === SERVICE_TOKEN) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Service token required' },
  });
}
