import { NextFunction, Request, Response, Router } from 'express';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { ReservationService } from '../service/reservationService';
import { HttpError } from '../types';

export class ReservationController {
  public readonly router: Router;

  constructor(
    private readonly reservationService: ReservationService,
    private readonly authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    const { authenticate } = this.authMiddleware;

    this.router.post('/reservations', authenticate, this.createReservation);
    this.router.get('/reservations/my', authenticate, this.getMyReservations);
    this.router.get('/reservations/:reservationId', authenticate, this.getReservationDetails);
    this.router.post('/reservations/:reservationId/confirm', authenticate, this.confirmReservation);
    this.router.post('/reservations/:reservationId/cancel', authenticate, this.cancelReservation);
  }

  private parseId(raw: string, label: string): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, `Invalid ${label}`);
    }
    return id;
  }

  private createReservation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const eventId = Number(req.body.eventId);
      const quantity = Number(req.body.quantity);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throw new HttpError(400, 'Valid eventId is required');
      }

      const reservation = await this.reservationService.createReservation(
        req.user!.userId,
        eventId,
        quantity
      );
      res.status(201).json(reservation);
    } catch (err) {
      next(err);
    }
  };

  private getMyReservations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservations = await this.reservationService.getUserReservations(req.user!.userId);
      res.json(reservations);
    } catch (err) {
      next(err);
    }
  };

  private getReservationDetails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservationId = this.parseId(req.params.reservationId, 'reservationId');
      const details = await this.reservationService.getReservationDetails(
        reservationId,
        req.user!.userId
      );
      res.json(details);
    } catch (err) {
      next(err);
    }
  };

  private confirmReservation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservationId = this.parseId(req.params.reservationId, 'reservationId');
      const result = await this.reservationService.confirmReservation(
        reservationId,
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  private cancelReservation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reservationId = this.parseId(req.params.reservationId, 'reservationId');
      const reservation = await this.reservationService.cancelReservation(
        reservationId,
        req.user!.userId
      );
      res.json(reservation);
    } catch (err) {
      next(err);
    }
  };
}