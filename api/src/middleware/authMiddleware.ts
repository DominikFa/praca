import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../service/authService';
import { HttpError, Role } from '../types';

export interface AuthMiddleware {
  authenticate: (req: Request, res: Response, next: NextFunction) => void;
  requireRole: (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
}

export function createAuthMiddleware(authService: AuthService): AuthMiddleware {
  const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new HttpError(401, 'Missing or malformed Authorization header'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new HttpError(401, 'Missing authentication token'));
    }

    try {
      req.user = authService.verifyAccessToken(token);
      next();
    } catch (err) {
      next(err);
    }
  };

  const requireRole = (...roles: Role[]) => {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.user) {
        return next(new HttpError(401, 'Authentication required'));
      }
      if (!roles.includes(req.user.role)) {
        return next(new HttpError(403, 'Insufficient permissions'));
      }
      next();
    };
  };

  return { authenticate, requireRole };
}