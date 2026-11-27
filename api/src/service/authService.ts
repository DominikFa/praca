import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { HttpError, JwtUserPayload, QrTicketPayload } from '../types';

export class AuthService {
  private readonly jwtSecret: string;
  private readonly qrSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly saltRounds = 10;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.qrSecret = process.env.QR_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN;
  }

  async hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, this.saltRounds);
  }

  async comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  signAccessToken(payload: JwtUserPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): JwtUserPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtUserPayload;
      if (!decoded || typeof decoded.userId !== 'number' || !decoded.role) {
        throw new HttpError(401, 'Invalid token payload');
      }
      return decoded;
    } catch {
      throw new HttpError(401, 'Invalid or expired authentication token');
    }
  }

  signQrToken(payload: QrTicketPayload): string {
    return jwt.sign(payload, this.qrSecret);
  }

  verifyQrToken(token: string): QrTicketPayload | null {
    try {
      const decoded = jwt.verify(token, this.qrSecret) as QrTicketPayload;
      if (!decoded || typeof decoded.ticketId !== 'number' || typeof decoded.eventId !== 'number') {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }
}