import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { pool } from './config/db';
import { AnalyticController } from './controller/analyticController';
import { EventController } from './controller/eventController';
import { ReservationController } from './controller/reservationController';
import { TicketController } from './controller/ticketController';
import { UserController } from './controller/userController';
import { createAuthMiddleware } from './middleware/authMiddleware';
import { AnalyticService } from './service/analyticService';
import { AuthService } from './service/authService';
import { EventService } from './service/eventService';
import { ReservationService } from './service/reservationService';
import { TicketService } from './service/ticketService';
import { UserService } from './service/userService';
import { HttpError } from './types';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Core services
  const authService = new AuthService();
  const userService = new UserService(pool, authService);
  const eventService = new EventService(pool);
  const reservationService = new ReservationService(pool);
  const ticketService = new TicketService(pool, authService);
  const analyticService = new AnalyticService(pool);

  // Middleware
  const authMiddleware = createAuthMiddleware(authService);

  // Controllers
  const userController = new UserController(userService, authMiddleware);
  const eventController = new EventController(eventService, reservationService, authMiddleware);
  const reservationController = new ReservationController(reservationService, authMiddleware);
  const ticketController = new TicketController(ticketService, authMiddleware);
  const analyticController = new AnalyticController(analyticService, authMiddleware);

  // Mount routes
  app.use('/api', userController.router);
  app.use('/api', eventController.router);
  app.use('/api', reservationController.router);
  app.use('/api', ticketController.router);
  app.use('/api', analyticController.router);

  // Centralized error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, reservationService };
}