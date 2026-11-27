import { Pool } from 'pg';
import { HttpError } from '../types';
import { UserService } from './userService';

export interface EventRecord {
  id: number;
  name: string;
  description: string | null;
  start: string;
  end: string;
  organizer_id: number;
  slots: number;
  current_occupancy: number;
  price: string;
  available_slots?: number;
}

export class EventService {
  constructor(private readonly db: Pool) {}

  async listEvents(filters: { upcoming?: boolean; search?: string }): Promise<EventRecord[]> {
    const searchPattern = filters.search?.trim() ? `%${filters.search.trim()}%` : null;

    const result = await this.db.query<EventRecord>(
      `SELECT id, name, description, start, "end", organizer_id, slots, current_occupancy, price,
              (slots - current_occupancy) AS available_slots
       FROM "event"
       WHERE ($1::boolean = FALSE OR "end" > NOW())
         AND ($2::varchar IS NULL OR name ILIKE $2::varchar OR description ILIKE $2::varchar)
       ORDER BY start ASC`,
      [Boolean(filters.upcoming), searchPattern]
    );

    return result.rows;
  }

  async listOrganizerEvents(organizerId: number): Promise<EventRecord[]> {
    const result = await this.db.query<EventRecord>(
      `SELECT id, name, description, start, "end", organizer_id, slots, current_occupancy, price,
              (slots - current_occupancy) AS available_slots
       FROM "event"
       WHERE organizer_id = $1::int
       ORDER BY start DESC`,
      [organizerId]
    );

    return result.rows;
  }

  async getEventById(eventId: number): Promise<EventRecord> {
    const result = await this.db.query<EventRecord>(
      `SELECT id, name, description, start, "end", organizer_id, slots, current_occupancy, price,
              (slots - current_occupancy) AS available_slots
       FROM "event"
       WHERE id = $1::int`,
      [eventId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Event not found');
    }

    return result.rows[0];
  }

  async createEvent(
    organizerId: number,
    data: {
      name: string;
      description?: string;
      start: string;
      end: string;
      slots: number;
      price: number;
    }
  ): Promise<EventRecord> {
    if (!data.name || !data.name.trim()) {
      throw new HttpError(400, 'Event name is required');
    }

    const startDate = new Date(data.start);
    const endDate = new Date(data.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
      throw new HttpError(400, 'Event start date must be earlier than end date');
    }

    if (!Number.isInteger(data.slots) || data.slots < 0) {
      throw new HttpError(400, 'Slots must be a non-negative integer');
    }

    if (typeof data.price !== 'number' || Number.isNaN(data.price) || data.price < 0) {
      throw new HttpError(400, 'Price must be a non-negative number');
    }

    const result = await this.db.query<EventRecord>(
      `INSERT INTO "event" (name, description, start, "end", organizer_id, slots, current_occupancy, price)
       VALUES ($1::varchar, $2::text, $3::timestamptz, $4::timestamptz, $5::int, $6::int, 0, $7::numeric)
       RETURNING id, name, description, start, "end", organizer_id, slots, current_occupancy, price,
                 (slots - current_occupancy) AS available_slots`,
      [
        data.name.trim(),
        data.description?.trim() || null,
        startDate.toISOString(),
        endDate.toISOString(),
        organizerId,
        data.slots,
        data.price,
      ]
    );

    return result.rows[0];
  }

  async updateEvent(
    eventId: number,
    organizerId: number,
    updates: {
      name?: string;
      description?: string | null;
      start?: string;
      end?: string;
      slots?: number;
      price?: number;
    }
  ): Promise<EventRecord> {
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new HttpError(400, 'Event name cannot be empty');
    }

    let nextStartIso: string | null = null;
    if (updates.start !== undefined) {
      const d = new Date(updates.start);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid start date');
      nextStartIso = d.toISOString();
    }

    let nextEndIso: string | null = null;
    if (updates.end !== undefined) {
      const d = new Date(updates.end);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid end date');
      nextEndIso = d.toISOString();
    }

    if (updates.slots !== undefined && (!Number.isInteger(updates.slots) || updates.slots < 0)) {
      throw new HttpError(400, 'Slots must be a non-negative integer');
    }

    if (
      updates.price !== undefined &&
      (typeof updates.price !== 'number' || Number.isNaN(updates.price) || updates.price < 0)
    ) {
      throw new HttpError(400, 'Price must be a non-negative number');
    }

    const result = await this.db.query<{
      found_id: number;
      organizer_id: number;
      current_occupancy: number;
      updated_event: EventRecord | null;
    }>(
      `WITH existing AS (
         SELECT id, name, description, start, "end", organizer_id, slots, current_occupancy, price
         FROM "event"
         WHERE id = $1::int
         FOR UPDATE
       ),
       updated AS (
         UPDATE "event" e
         SET
           name = COALESCE($3::varchar, existing.name),
           description = CASE WHEN $4::boolean THEN $5::text ELSE existing.description END,
           start = COALESCE($6::timestamptz, existing.start),
           "end" = COALESCE($7::timestamptz, existing."end"),
           slots = COALESCE($8::int, existing.slots),
           price = COALESCE($9::numeric, existing.price)
         FROM existing
         WHERE e.id = existing.id
           AND existing.organizer_id = $2::int
           AND COALESCE($6::timestamptz, existing.start) < COALESCE($7::timestamptz, existing."end")
           AND COALESCE($8::int, existing.slots) >= existing.current_occupancy
         RETURNING e.id, e.name, e.description, e.start, e."end", e.organizer_id, e.slots, e.current_occupancy, e.price,
                   (e.slots - e.current_occupancy) AS available_slots
       )
       SELECT
         existing.id AS found_id,
         existing.organizer_id,
         existing.current_occupancy,
         (SELECT row_to_json(updated) FROM updated) AS updated_event
       FROM existing`,
      [
        eventId,
        organizerId,
        updates.name !== undefined ? updates.name.trim() : null,
        updates.description !== undefined,
        updates.description ?? null,
        nextStartIso,
        nextEndIso,
        updates.slots ?? null,
        updates.price ?? null,
      ]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Event not found');
    }

    const row = result.rows[0];
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }

    if (!row.updated_event) {
      if (updates.slots !== undefined && updates.slots < row.current_occupancy) {
        throw new HttpError(
          400,
          `Slots cannot be lower than current occupancy (${row.current_occupancy})`
        );
      }
      throw new HttpError(400, 'Event start date must be earlier than end date');
    }

    return row.updated_event;
  }

  async deleteEvent(eventId: number, organizerId: number): Promise<void> {
    const result = await this.db.query<{
      found_id: number;
      organizer_id: number;
      is_blocked: boolean;
      deleted_id: number | null;
    }>(
      `WITH target AS (
         SELECT id, organizer_id
         FROM "event"
         WHERE id = $1::int
         FOR UPDATE
       ),
       has_active_res AS (
         SELECT 1 AS blocked
         FROM "reservation"
         WHERE event_id = $1::int AND status IN ('PENDING', 'CONFIRMED')
         LIMIT 1
       ),
       can_delete AS (
         SELECT t.id
         FROM target t
         WHERE t.organizer_id = $2::int
           AND NOT EXISTS (SELECT 1 FROM has_active_res)
       ),
       del_perms AS (
         DELETE FROM "verification_permission"
         WHERE event_id IN (SELECT id FROM can_delete)
       ),
       del_event AS (
         DELETE FROM "event"
         WHERE id IN (SELECT id FROM can_delete)
         RETURNING id
       )
       SELECT
         t.id AS found_id,
         t.organizer_id,
         EXISTS (SELECT 1 FROM has_active_res) AS is_blocked,
         (SELECT id FROM del_event) AS deleted_id
       FROM target t`,
      [eventId, organizerId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Event not found');
    }

    const row = result.rows[0];
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }

    if (row.is_blocked) {
      throw new HttpError(409, 'Cannot delete an event that has active or confirmed reservations');
    }
  }

  async listVerifiers(eventId: number, organizerId: number) {
    const result = await this.db.query<{
      organizer_id: number;
      user_id: number | null;
      name: string | null;
      login: string | null;
      start: string | null;
      end: string | null;
    }>(
      `WITH ev AS (
         SELECT id, organizer_id FROM "event" WHERE id = $1::int
       )
       SELECT
         ev.organizer_id,
         vp.user_id,
         u.name,
         u.login,
         vp.start,
         vp."end"
       FROM ev
       LEFT JOIN "verification_permission" vp ON vp.event_id = ev.id
       LEFT JOIN "user" u ON u.id = vp.user_id
       ORDER BY u.name ASC`,
      [eventId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Event not found');
    }

    if (result.rows[0].organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }

    return result.rows
      .filter((r): r is Required<typeof r> => r.user_id !== null)
      .map((row) => ({
        userId: row.user_id,
        name: row.name,
        maskedLogin: UserService.maskLogin(row.login),
        start: row.start,
        end: row.end,
      }));
  }

  async addVerifier(
    eventId: number,
    organizerId: number,
    data: { userId: number; start: string; end: string }
  ) {
    const startDate = new Date(data.start);
    const endDate = new Date(data.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
      throw new HttpError(400, 'Permission start time must be earlier than end time');
    }

    const result = await this.db.query<{
      organizer_id: number | null;
      user_exists: boolean;
      permission: { user_id: number; event_id: number; start: string; end: string } | null;
    }>(
      `WITH ev AS (
         SELECT id, organizer_id FROM "event" WHERE id = $1::int
       ),
       target_user AS (
         SELECT id FROM "user" WHERE id = $3::int
       ),
       upserted AS (
         INSERT INTO "verification_permission" (user_id, event_id, start, "end")
         SELECT $3::int, $1::int, $4::timestamptz, $5::timestamptz
         FROM ev, target_user
         WHERE ev.organizer_id = $2::int
         ON CONFLICT (user_id, event_id)
         DO UPDATE SET start = EXCLUDED.start, "end" = EXCLUDED."end"
         RETURNING user_id, event_id, start, "end"
       )
       SELECT
         (SELECT organizer_id FROM ev) AS organizer_id,
         EXISTS (SELECT 1 FROM target_user) AS user_exists,
         (SELECT row_to_json(upserted) FROM upserted) AS permission`,
      [eventId, organizerId, data.userId, startDate.toISOString(), endDate.toISOString()]
    );

    const row = result.rows[0];
    if (row.organizer_id === null) {
      throw new HttpError(404, 'Event not found');
    }
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }
    if (!row.user_exists) {
      throw new HttpError(404, 'Target user not found');
    }

    return row.permission;
  }

  async updateVerifier(
    eventId: number,
    organizerId: number,
    targetUserId: number,
    data: { start: string; end: string }
  ) {
    const startDate = new Date(data.start);
    const endDate = new Date(data.end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
      throw new HttpError(400, 'Permission start time must be earlier than end time');
    }

    const result = await this.db.query<{
      organizer_id: number | null;
      permission: { user_id: number; event_id: number; start: string; end: string } | null;
    }>(
      `WITH ev AS (
         SELECT id, organizer_id FROM "event" WHERE id = $1::int
       ),
       updated AS (
         UPDATE "verification_permission" vp
         SET start = $4::timestamptz, "end" = $5::timestamptz
         FROM ev
         WHERE vp.event_id = ev.id
           AND ev.organizer_id = $2::int
           AND vp.user_id = $3::int
         RETURNING vp.user_id, vp.event_id, vp.start, vp."end"
       )
       SELECT
         (SELECT organizer_id FROM ev) AS organizer_id,
         (SELECT row_to_json(updated) FROM updated) AS permission`,
      [eventId, organizerId, targetUserId, startDate.toISOString(), endDate.toISOString()]
    );

    const row = result.rows[0];
    if (row.organizer_id === null) {
      throw new HttpError(404, 'Event not found');
    }
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }
    if (!row.permission) {
      throw new HttpError(404, 'Verifier permission not found');
    }

    return row.permission;
  }

  async removeVerifier(eventId: number, organizerId: number, targetUserId: number): Promise<void> {
    const result = await this.db.query<{
      organizer_id: number | null;
      deleted_user_id: number | null;
    }>(
      `WITH ev AS (
         SELECT id, organizer_id FROM "event" WHERE id = $1::int
       ),
       deleted AS (
         DELETE FROM "verification_permission" vp
         USING ev
         WHERE vp.event_id = ev.id
           AND ev.organizer_id = $2::int
           AND vp.user_id = $3::int
         RETURNING vp.user_id
       )
       SELECT
         (SELECT organizer_id FROM ev) AS organizer_id,
         (SELECT user_id FROM deleted) AS deleted_user_id`,
      [eventId, organizerId, targetUserId]
    );

    const row = result.rows[0];
    if (row.organizer_id === null) {
      throw new HttpError(404, 'Event not found');
    }
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }
    if (row.deleted_user_id === null) {
      throw new HttpError(404, 'Verifier permission not found');
    }
  }
}