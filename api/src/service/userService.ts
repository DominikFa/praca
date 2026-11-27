import { Pool } from 'pg';
import { HttpError, Role } from '../types';
import { AuthService } from './authService';

export interface UserPublicProfile {
  id: number;
  name: string;
  login: string;
  role: Role;
}

export interface UserSearchResult {
  id: number;
  name: string;
  maskedLogin: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UserService {
  constructor(
    private readonly db: Pool,
    private readonly authService: AuthService
  ) {}

  static maskLogin(email: string): string {
    const visible = email.slice(0, 3);
    return `${visible}***`;
  }

  async register(
    name: string,
    login: string,
    password: string
  ): Promise<{ user: UserPublicProfile; token: string }> {
    const trimmedName = name?.trim();
    const normalizedEmail = login?.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password || password.length < 6) {
      throw new HttpError(400, 'Name, email, and a password of at least 6 characters are required');
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new HttpError(400, 'Please enter a valid email address');
    }

    const passwordHash = await this.authService.hashPassword(password);

    // Role is always forced to 'USER'; organizers are provisioned manually
    const result = await this.db.query<UserPublicProfile>(
      `INSERT INTO "user" (name, login, password_hash, role)
       VALUES ($1::varchar, $2::varchar, $3::varchar, 'USER')
       ON CONFLICT (login) DO NOTHING
       RETURNING id, name, login, role`,
      [trimmedName, normalizedEmail, passwordHash]
    );

    if (result.rowCount === 0) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    const user = result.rows[0];
    const token = this.authService.signAccessToken({
      userId: user.id,
      login: user.login,
      role: user.role,
    });

    return { user, token };
  }

  async login(login: string, password: string): Promise<{ user: UserPublicProfile; token: string }> {
    const normalizedEmail = login?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new HttpError(400, 'Email and password are required');
    }

    const result = await this.db.query<{
      id: number;
      name: string;
      login: string;
      password_hash: string;
      role: Role;
    }>('SELECT id, name, login, password_hash, role FROM "user" WHERE login = $1::varchar', [
      normalizedEmail,
    ]);

    if (result.rowCount === 0) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const row = result.rows[0];
    const valid = await this.authService.comparePassword(password, row.password_hash);
    if (!valid) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const user: UserPublicProfile = {
      id: row.id,
      name: row.name,
      login: row.login,
      role: row.role,
    };

    const token = this.authService.signAccessToken({
      userId: user.id,
      login: user.login,
      role: user.role,
    });

    return { user, token };
  }

  async getProfile(userId: number): Promise<UserPublicProfile> {
    const result = await this.db.query<UserPublicProfile>(
      'SELECT id, name, login, role FROM "user" WHERE id = $1::int',
      [userId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'User not found');
    }

    return result.rows[0];
  }

  async updateProfile(
    userId: number,
    updates: { name?: string; password?: string }
  ): Promise<UserPublicProfile> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) {
        throw new HttpError(400, 'Name cannot be empty');
      }
      fields.push(`name = $${idx++}::varchar`);
      values.push(trimmed);
    }

    if (updates.password !== undefined) {
      if (updates.password.length < 6) {
        throw new HttpError(400, 'Password must be at least 6 characters long');
      }
      const passwordHash = await this.authService.hashPassword(updates.password);
      fields.push(`password_hash = $${idx++}::varchar`);
      values.push(passwordHash);
    }

    if (fields.length === 0) {
      throw new HttpError(400, 'No valid fields provided for update');
    }

    values.push(userId);
    const result = await this.db.query<UserPublicProfile>(
      `UPDATE "user"
       SET ${fields.join(', ')}
       WHERE id = $${idx}::int
       RETURNING id, name, login, role`,
      values
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'User not found');
    }

    return result.rows[0];
  }

  async searchByName(query: string, excludeUserId?: number): Promise<UserSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new HttpError(400, 'Search query must be at least 2 characters');
    }

    const result = await this.db.query<{ id: number; name: string; login: string }>(
      `SELECT id, name, login
       FROM "user"
       WHERE name ILIKE $1::varchar
         AND ($2::int IS NULL OR id <> $2::int)
       ORDER BY name ASC
       LIMIT 20`,
      [`%${trimmed}%`, excludeUserId ?? null]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      maskedLogin: UserService.maskLogin(row.login),
    }));
  }
}