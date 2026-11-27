import { NextFunction, Request, Response, Router } from 'express';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { TicketService } from '../service/ticketService';
import { HttpError } from '../types';

export class TicketController {
  public readonly router: Router;

  constructor(
    private readonly ticketService: TicketService,
    private readonly authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    const { authenticate, requireRole } = this.authMiddleware;

    this.router.get('/tickets/my', authenticate, this.getMyTickets);
    this.router.get('/tickets/scanner/events', authenticate, this.getScannerEvents);
    this.router.post('/tickets/verify', authenticate, this.verifyTicket);
    this.router.get('/tickets/:ticketId', authenticate, this.getTicketDetails);
    this.router.post('/tickets/:ticketId/transfer', authenticate, this.transferTicket);
    this.router.patch('/tickets/:ticketId/invalidate', authenticate, requireRole('ORGANIZER'), this.invalidateTicket);
  }

  private parseId(raw: string, label: string): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, `Invalid ${label}`);
    }
    return id;
  }

  private getMyTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tickets = await this.ticketService.getUserTickets(req.user!.userId);
      res.json(tickets);
    } catch (err) {
      next(err);
    }
  };

  private getScannerEvents = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const events = await this.ticketService.getScannerEvents(req.user!.userId);
      res.json(events);
    } catch (err) {
      next(err);
    }
  };

  private verifyTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { qrToken, eventId } = req.body;
      const result = await this.ticketService.verifyTicket(
        qrToken,
        Number(eventId),
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  private getTicketDetails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const ticketId = this.parseId(req.params.ticketId, 'ticketId');
      const ticket = await this.ticketService.getTicketDetails(ticketId, req.user!.userId);
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  };

  private transferTicket = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const ticketId = this.parseId(req.params.ticketId, 'ticketId');
      const recipientUserId = Number(req.body.recipientUserId);
      const transferred = await this.ticketService.transferTicket(
        ticketId,
        req.user!.userId,
        recipientUserId
      );
      res.json(transferred);
    } catch (err) {
      next(err);
    }
  };

  private invalidateTicket = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const ticketId = this.parseId(req.params.ticketId, 'ticketId');
      const invalidated = await this.ticketService.invalidateTicket(ticketId, req.user!.userId);
      res.json(invalidated);
    } catch (err) {
      next(err);
    }
  };
}