import { NextFunction, Request, Response, Router } from 'express';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { AnalyticService } from '../service/analyticService';
import { HttpError } from '../types';

export class AnalyticController {
  public readonly router: Router;

  constructor(
    private readonly analyticService: AnalyticService,
    private readonly authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    const { authenticate, requireRole } = this.authMiddleware;
    const organizerOnly = [authenticate, requireRole('ORGANIZER')];

    this.router.get('/analytics/overview', ...organizerOnly, this.getOverview);
    this.router.get('/analytics/events/:eventId', ...organizerOnly, this.getEventAnalytics);
    this.router.get('/analytics/events/:eventId/logs', ...organizerOnly, this.getEventLogs);
  }

  private parseId(raw: string, label: string): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, `Invalid ${label}`);
    }
    return id;
  }

  private getOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const overview = await this.analyticService.getOrganizerOverview(req.user!.userId);
      res.json(overview);
    } catch (err) {
      next(err);
    }
  };

  private getEventAnalytics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const analytics = await this.analyticService.getEventAnalytics(eventId, req.user!.userId);
      res.json(analytics);
    } catch (err) {
      next(err);
    }
  };

  private getEventLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const resultFilter = typeof req.query.result === 'string' ? req.query.result : undefined;
      const logs = await this.analyticService.getEventVerificationLogs(
        eventId,
        req.user!.userId,
        resultFilter
      );
      res.json(logs);
    } catch (err) {
      next(err);
    }
  };
}