import { Pool } from 'pg';
import { HttpError, ReservationStatus } from '../types';

export interface ReservationRecord {
  id: number;
  status: ReservationStatus;
  event_id: number;
  user_id: number;
  created_at: string;
  expires_at: string;
  quantity: number;
}

export class ReservationService {
  private expirationTimer: NodeJS.Timeout | null = null;

  constructor(private readonly db: Pool) {}

  startExpirationWorker(intervalMs = 60_000): void {
    if (this.expirationTimer) return;
    this.expirationTimer = setInterval(() => {
      this.expireOverdueReservations().catch((err) => {
        console.error('[ReservationService] Expiration worker error:', err);
      });
    }, intervalMs);
  }

  stopExpirationWorker(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  async expireOverdueReservations(): Promise<number> {
    const result = await this.db.query<{ expired_count: number }>(
      `WITH overdue AS (
         SELECT id, event_id, quantity
         FROM "reservation"
         WHERE status = 'PENDING' AND expires_at <= NOW()
         FOR UPDATE SKIP LOCKED
       ),
       expired_res AS (
         UPDATE "reservation" r
         SET status = 'EXPIRED'
         FROM overdue o
         WHERE r.id = o.id
         RETURNING o.event_id, o.quantity
       ),
       released_per_event AS (
         SELECT event_id, SUM(quantity)::int AS total_released
         FROM expired_res
         GROUP BY event_id
       ),
       updated_events AS (
         UPDATE "event" e
         SET current_occupancy = GREATEST(0, e.current_occupancy - rpe.total_released)
         FROM released_per_event rpe
         WHERE e.id = rpe.event_id
         RETURNING e.id
       )
       SELECT COUNT(*)::int AS expired_count FROM expired_res`
    );

    return result.rows[0]?.expired_count ?? 0;
  }

  async createReservation(
    userId: number,
    eventId: number,
    quantity: number
  ): Promise<ReservationRecord> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new HttpError(400, 'Quantity must be an integer >= 1');
    }

    const result = await this.db.query<{
      event_found_id: number | null;
      event_ended: boolean | null;
      no_slots: boolean | null;
      reservation: ReservationRecord | null;
    }>(
      `WITH target_event AS (
         SELECT id, "end", slots, current_occupancy
         FROM "event"
         WHERE id = $1::int
         FOR UPDATE
       ),
       updated_event AS (
         UPDATE "event" e
         SET current_occupancy = e.current_occupancy + $3::int
         FROM target_event te
         WHERE e.id = te.id
           AND te."end" > NOW()
           AND te.current_occupancy + $3::int <= te.slots
         RETURNING e.id
       ),
       inserted_res AS (
         INSERT INTO "reservation" (status, event_id, user_id, created_at, quantity)
         SELECT 'PENDING', ue.id, $2::int, NOW(), $3::int
         FROM updated_event ue
         RETURNING id, status, event_id, user_id, created_at, expires_at, quantity
       )
       SELECT
         te.id AS event_found_id,
         (te."end" <= NOW()) AS event_ended,
         (te.current_occupancy + $3::int > te.slots) AS no_slots,
         (SELECT row_to_json(ir) FROM inserted_res ir) AS reservation
       FROM (SELECT 1) dummy
       LEFT JOIN target_event te ON TRUE`,
      [eventId, userId, quantity]
    );

    const row = result.rows[0];
    if (row.event_found_id === null) {
      throw new HttpError(404, 'Event not found');
    }
    if (row.event_ended) {
      throw new HttpError(400, 'Cannot reserve tickets for an event that has already ended');
    }
    if (row.no_slots || !row.reservation) {
      throw new HttpError(409, 'Not enough available slots for this event');
    }

    return row.reservation;
  }

  async getUserReservations(userId: number) {
    const result = await this.db.query(
      `SELECT r.id, r.status, r.event_id, r.user_id, r.created_at, r.expires_at, r.quantity,
              e.name AS event_name, e.start AS event_start, e."end" AS event_end, e.price AS unit_price,
              (e.price * r.quantity) AS total_price
       FROM "reservation" r
       JOIN "event" e ON e.id = r.event_id
       WHERE r.user_id = $1::int
       ORDER BY r.created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  async getReservationDetails(reservationId: number, requesterId: number) {
    const result = await this.db.query(
      `SELECT
         r.id, r.status, r.event_id, r.user_id, r.created_at, r.expires_at, r.quantity,
         e.name AS event_name, e.start AS event_start, e."end" AS event_end,
         e.price AS unit_price, e.organizer_id,
         COALESCE(
           json_agg(
             json_build_object(
               'id', t.id,
               'event_id', t.event_id,
               'reservation_id', t.reservation_id,
               'status', t.status,
               'owner_id', t.owner_id,
               'owner_name', u.name
             )
             ORDER BY t.id ASC
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'::json
         ) AS tickets
       FROM "reservation" r
       JOIN "event" e ON e.id = r.event_id
       LEFT JOIN "ticket" t ON t.reservation_id = r.id
       LEFT JOIN "user" u ON u.id = t.owner_id
       WHERE r.id = $1::int
       GROUP BY r.id, e.id`,
      [reservationId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Reservation not found');
    }

    const reservation = result.rows[0];
    if (reservation.user_id !== requesterId && reservation.organizer_id !== requesterId) {
      throw new HttpError(403, 'Access denied to this reservation');
    }

    return reservation;
  }

  async confirmReservation(reservationId: number, userId: number) {
    const result = await this.db.query<{
      found_id: number | null;
      owner_user_id: number | null;
      original_status: ReservationStatus | null;
      was_expired: boolean;
      reservation: ReservationRecord | null;
      tickets: unknown[];
    }>(
      `WITH target_res AS (
         SELECT id, status, event_id, user_id, created_at, expires_at, quantity
         FROM "reservation"
         WHERE id = $1::int
         FOR UPDATE
       ),
       auto_expired AS (
         UPDATE "reservation" r
         SET status = 'EXPIRED'
         FROM target_res tr
         WHERE r.id = tr.id
           AND tr.user_id = $2::int
           AND tr.status = 'PENDING'
           AND tr.expires_at <= NOW()
         RETURNING tr.event_id, tr.quantity
       ),
       released_event AS (
         UPDATE "event" e
         SET current_occupancy = GREATEST(0, e.current_occupancy - ae.quantity)
         FROM auto_expired ae
         WHERE e.id = ae.event_id
         RETURNING e.id
       ),
       confirmed_res AS (
         UPDATE "reservation" r
         SET status = 'CONFIRMED'
         FROM target_res tr
         WHERE r.id = tr.id
           AND tr.user_id = $2::int
           AND tr.status = 'PENDING'
           AND tr.expires_at > NOW()
         RETURNING r.id, r.status, r.event_id, r.user_id, r.created_at, r.expires_at, r.quantity
       ),
       minted_tickets AS (
         INSERT INTO "ticket" (event_id, reservation_id, status, owner_id)
         SELECT cr.event_id, cr.id, 'ACTIVE', cr.user_id
         FROM confirmed_res cr
         CROSS JOIN generate_series(1, cr.quantity)
         RETURNING id, event_id, reservation_id, status, owner_id
       )
       SELECT
         tr.id AS found_id,
         tr.user_id AS owner_user_id,
         tr.status AS original_status,
         EXISTS (SELECT 1 FROM auto_expired) AS was_expired,
         (SELECT row_to_json(cr) FROM confirmed_res cr) AS reservation,
         COALESCE(
           (SELECT json_agg(row_to_json(mt) ORDER BY mt.id ASC) FROM minted_tickets mt),
           '[]'::json
         ) AS tickets
       FROM (SELECT 1) dummy
       LEFT JOIN target_res tr ON TRUE`,
      [reservationId, userId]
    );

    const row = result.rows[0];
    if (row.found_id === null) {
      throw new HttpError(404, 'Reservation not found');
    }
    if (row.owner_user_id !== userId) {
      throw new HttpError(403, 'You do not own this reservation');
    }
    if (row.was_expired) {
      throw new HttpError(409, 'Reservation has expired');
    }
    if (row.original_status !== 'PENDING' || !row.reservation) {
      throw new HttpError(
        409,
        `Reservation cannot be confirmed (current status: ${row.original_status})`
      );
    }

    return {
      reservation: row.reservation,
      tickets: row.tickets,
    };
  }

  async cancelReservation(reservationId: number, userId: number): Promise<ReservationRecord> {
    const result = await this.db.query<{
      found_id: number | null;
      owner_user_id: number | null;
      original_status: ReservationStatus | null;
      has_used: boolean;
      reservation: ReservationRecord | null;
    }>(
      `WITH target_res AS (
         SELECT id, status, event_id, user_id, created_at, expires_at, quantity
         FROM "reservation"
         WHERE id = $1::int
         FOR UPDATE
       ),
       has_used_ticket AS (
         SELECT 1 AS used
         FROM "ticket"
         WHERE reservation_id = $1::int AND status = 'USED'
         LIMIT 1
       ),
       can_cancel AS (
         SELECT tr.*
         FROM target_res tr
         WHERE tr.user_id = $2::int
           AND tr.status IN ('PENDING', 'CONFIRMED')
           AND NOT EXISTS (SELECT 1 FROM has_used_ticket)
       ),
       invalidated_tickets AS (
         UPDATE "ticket" t
         SET status = 'INVALIDATED'
         FROM can_cancel cc
         WHERE t.reservation_id = cc.id
           AND cc.status = 'CONFIRMED'
         RETURNING t.id
       ),
       cancelled_res AS (
         UPDATE "reservation" r
         SET status = 'CANCELLED'
         FROM can_cancel cc
         WHERE r.id = cc.id
         RETURNING r.id, r.status, r.event_id, r.user_id, r.created_at, r.expires_at, r.quantity
       ),
       updated_event AS (
         UPDATE "event" e
         SET current_occupancy = GREATEST(0, e.current_occupancy - cc.quantity)
         FROM can_cancel cc
         WHERE e.id = cc.event_id
         RETURNING e.id
       )
       SELECT
         tr.id AS found_id,
         tr.user_id AS owner_user_id,
         tr.status AS original_status,
         EXISTS (SELECT 1 FROM has_used_ticket) AS has_used,
         (SELECT row_to_json(cr) FROM cancelled_res cr) AS reservation
       FROM (SELECT 1) dummy
       LEFT JOIN target_res tr ON TRUE`,
      [reservationId, userId]
    );

    const row = result.rows[0];
    if (row.found_id === null) {
      throw new HttpError(404, 'Reservation not found');
    }
    if (row.owner_user_id !== userId) {
      throw new HttpError(403, 'You do not own this reservation');
    }
    if (row.original_status !== 'PENDING' && row.original_status !== 'CONFIRMED') {
      throw new HttpError(409, `Cannot cancel reservation in status ${row.original_status}`);
    }
    if (row.has_used) {
      throw new HttpError(409, 'Cannot cancel a reservation with already used tickets');
    }

    return row.reservation!;
  }

  async getEventReservations(eventId: number, organizerId: number) {
    const result = await this.db.query<{
      organizer_id: number;
      reservation_id: number | null;
      status: ReservationStatus | null;
      event_id: number | null;
      user_id: number | null;
      created_at: string | null;
      expires_at: string | null;
      quantity: number | null;
      user_name: string | null;
    }>(
      `WITH ev AS (
         SELECT id, organizer_id FROM "event" WHERE id = $1::int
       )
       SELECT
         ev.organizer_id,
         r.id AS reservation_id,
         r.status,
         r.event_id,
         r.user_id,
         r.created_at,
         r.expires_at,
         r.quantity,
         u.name AS user_name
       FROM ev
       LEFT JOIN "reservation" r ON r.event_id = ev.id
       LEFT JOIN "user" u ON u.id = r.user_id
       ORDER BY r.created_at DESC`,
      [eventId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Event not found');
    }

    if (result.rows[0].organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }

    return result.rows
      .filter((r) => r.reservation_id !== null)
      .map((r) => ({
        id: r.reservation_id,
        status: r.status,
        event_id: r.event_id,
        user_id: r.user_id,
        created_at: r.created_at,
        expires_at: r.expires_at,
        quantity: r.quantity,
        user_name: r.user_name,
      }));
  }
}