export type Role = 'USER' | 'ORGANIZER';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type TicketStatus = 'ACTIVE' | 'USED' | 'INVALIDATED';
export type VerificationLogResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID'
  | 'WRONG_EVENT'
  | 'UNAUTHORIZED';

export interface JwtUserPayload {
  userId: number;
  login: string;
  role: Role;
}

export interface QrTicketPayload {
  ticketId: number;
  eventId: number;
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}