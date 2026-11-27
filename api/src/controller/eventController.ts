import { NextFunction, Request, Response, Router } from 'express';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { EventService } from '../service/eventService';
import { ReservationService } from '../service/reservationService';
import { HttpError } from '../types';

export class EventController {
  public readonly router: Router;

  constructor(
    private readonly eventService: EventService,
    private readonly reservationService: ReservationService,
    private readonly authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    const { authenticate, requireRole } = this.authMiddleware;
    const organizerOnly = [authenticate, requireRole('ORGANIZER')];

    this.router.get('/events', this.listEvents);
    this.router.get('/events/my', ...organizerOnly, this.listMyEvents);
    this.router.get('/events/:eventId', this.getEvent);
    this.router.post('/events', ...organizerOnly, this.createEvent);
    this.router.patch('/events/:eventId', ...organizerOnly, this.updateEvent);
    this.router.delete('/events/:eventId', ...organizerOnly, this.deleteEvent);

    // Verifier management
    this.router.get('/events/:eventId/verifiers', ...organizerOnly, this.listVerifiers);
    this.router.post('/events/:eventId/verifiers', ...organizerOnly, this.addVerifier);
    this.router.patch('/events/:eventId/verifiers/:userId', ...organizerOnly, this.updateVerifier);
    this.router.delete('/events/:eventId/verifiers/:userId', ...organizerOnly, this.removeVerifier);

    // Event reservations overview for organizer
    this.router.get('/events/:eventId/reservations', ...organizerOnly, this.getEventReservations);
  }

  private parseId(raw: string, label: string): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, `Invalid ${label}`);
    }
    return id;
  }

  private listEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const upcoming = req.query.upcoming === 'true';
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const events = await this.eventService.listEvents({ upcoming, search });
      res.json(events);
    } catch (err) {
      next(err);
    }
  };

  private listMyEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const events = await this.eventService.listOrganizerEvents(req.user!.userId);
      res.json(events);
    } catch (err) {
      next(err);
    }
  };

  private getEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const event = await this.eventService.getEventById(eventId);
      res.json(event);
    } catch (err) {
      next(err);
    }
  };

  private createEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = await this.eventService.createEvent(req.user!.userId, req.body);
      res.status(201).json(event);
    } catch (err) {
      next(err);
    }
  };

  private updateEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const event = await this.eventService.updateEvent(eventId, req.user!.userId, req.body);
      res.json(event);
    } catch (err) {
      next(err);
    }
  };

  private deleteEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      await this.eventService.deleteEvent(eventId, req.user!.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  private listVerifiers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const verifiers = await this.eventService.listVerifiers(eventId, req.user!.userId);
      res.json(verifiers);
    } catch (err) {
      next(err);
    }
  };

  private addVerifier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const { userId, start, end } = req.body;
      const permission = await this.eventService.addVerifier(eventId, req.user!.userId, {
        userId: Number(userId),
        start,
        end,
      });
      res.status(201).json(permission);
    } catch (err) {
      next(err);
    }
  };

  private updateVerifier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const targetUserId = this.parseId(req.params.userId, 'userId');
      const { start, end } = req.body;
      const updated = await this.eventService.updateVerifier(eventId, req.user!.userId, targetUserId, {
        start,
        end,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  private removeVerifier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const targetUserId = this.parseId(req.params.userId, 'userId');
      await this.eventService.removeVerifier(eventId, req.user!.userId, targetUserId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  private getEventReservations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const eventId = this.parseId(req.params.eventId, 'eventId');
      const reservations = await this.reservationService.getEventReservations(
        eventId,
        req.user!.userId
      );
      res.json(reservations);
    } catch (err) {
      next(err);
    }
  };
}