import { Pool } from 'pg';
import { HttpError, TicketStatus, VerificationLogResult } from '../types';
import { AuthService } from './authService';

export interface TicketPayloadData {
  id: number;
  event_id: number;
  reservation_id: number;
  status: TicketStatus;
  owner_id: number;
  owner_name: string;
  event_name: string;
  event_description: string | null;
  event_start: string;
  event_end: string;
  price: string;
  qrToken: string;
}

export class TicketService {
  constructor(
    private readonly db: Pool,
    private readonly authService: AuthService
  ) {}

  async getUserTickets(userId: number): Promise<TicketPayloadData[]> {
    const result = await this.db.query<{
      id: number;
      event_id: number;
      reservation_id: number;
      status: TicketStatus;
      owner_id: number;
      owner_name: string;
      event_name: string;
      event_description: string | null;
      event_start: string;
      event_end: string;
      price: string;
    }>(
      `SELECT t.id, t.event_id, t.reservation_id, t.status, t.owner_id,
              u.name AS owner_name,
              e.name AS event_name, e.description AS event_description,
              e.start AS event_start, e."end" AS event_end, e.price
       FROM "ticket" t
       JOIN "event" e ON e.id = t.event_id
       JOIN "user" u ON u.id = t.owner_id
       WHERE t.owner_id = $1::int
       ORDER BY e.start ASC, t.id ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      ...row,
      qrToken: this.authService.signQrToken({
        ticketId: row.id,
        eventId: row.event_id,
      }),
    }));
  }

  async getTicketDetails(ticketId: number, requesterId: number): Promise<TicketPayloadData> {
    const result = await this.db.query<{
      id: number;
      event_id: number;
      reservation_id: number;
      status: TicketStatus;
      owner_id: number;
      owner_name: string;
      event_name: string;
      event_description: string | null;
      event_start: string;
      event_end: string;
      price: string;
      organizer_id: number;
    }>(
      `SELECT t.id, t.event_id, t.reservation_id, t.status, t.owner_id,
              u.name AS owner_name,
              e.name AS event_name, e.description AS event_description,
              e.start AS event_start, e."end" AS event_end, e.price, e.organizer_id
       FROM "ticket" t
       JOIN "event" e ON e.id = t.event_id
       JOIN "user" u ON u.id = t.owner_id
       WHERE t.id = $1::int`,
      [ticketId]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Ticket not found');
    }

    const row = result.rows[0];
    if (row.owner_id !== requesterId && row.organizer_id !== requesterId) {
      throw new HttpError(403, 'Access denied to this ticket');
    }

    const { organizer_id: _orgId, ...ticketData } = row;
    return {
      ...ticketData,
      qrToken: this.authService.signQrToken({
        ticketId: row.id,
        eventId: row.event_id,
      }),
    };
  }

  async transferTicket(ticketId: number, currentOwnerId: number, recipientUserId: number) {
    if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
      throw new HttpError(400, 'Valid recipientUserId is required');
    }

    if (currentOwnerId === recipientUserId) {
      throw new HttpError(400, 'Cannot transfer a ticket to yourself');
    }

    // Single atomic CTE: invalidates current ACTIVE ticket and creates a new ACTIVE copy for recipient
    const result = await this.db.query<{
      found_id: number | null;
      current_owner_id: number | null;
      current_status: TicketStatus | null;
      event_ended: boolean | null;
      recipient_exists: boolean;
      invalidated_ticket_id: number | null;
      new_ticket: {
        id: number;
        event_id: number;
        reservation_id: number;
        status: TicketStatus;
        owner_id: number;
      } | null;
    }>(
      `WITH target_ticket AS (
         SELECT t.id, t.event_id, t.reservation_id, t.status, t.owner_id, e."end" AS event_end
         FROM "ticket" t
         JOIN "event" e ON e.id = t.event_id
         WHERE t.id = $1::int
         FOR UPDATE OF t
       ),
       recipient AS (
         SELECT id FROM "user" WHERE id = $3::int
       ),
       can_transfer AS (
         SELECT tt.*
         FROM target_ticket tt
         CROSS JOIN recipient r
         WHERE tt.owner_id = $2::int
           AND tt.status = 'ACTIVE'
           AND tt.event_end > NOW()
           AND r.id <> $2::int
       ),
       invalidated_old AS (
         UPDATE "ticket" t
         SET status = 'INVALIDATED'
         FROM can_transfer ct
         WHERE t.id = ct.id
         RETURNING t.id
       ),
       created_new AS (
         INSERT INTO "ticket" (event_id, reservation_id, status, owner_id)
         SELECT ct.event_id, ct.reservation_id, 'ACTIVE', $3::int
         FROM can_transfer ct
         RETURNING id, event_id, reservation_id, status, owner_id
       )
       SELECT
         tt.id AS found_id,
         tt.owner_id AS current_owner_id,
         tt.status AS current_status,
         (tt.event_end <= NOW()) AS event_ended,
         EXISTS (SELECT 1 FROM recipient) AS recipient_exists,
         (SELECT id FROM invalidated_old) AS invalidated_ticket_id,
         (SELECT row_to_json(cn) FROM created_new cn) AS new_ticket
       FROM (SELECT 1) dummy
       LEFT JOIN target_ticket tt ON TRUE`,
      [ticketId, currentOwnerId, recipientUserId]
    );

    const row = result.rows[0];
    if (row.found_id === null) {
      throw new HttpError(404, 'Ticket not found');
    }
    if (row.current_owner_id !== currentOwnerId) {
      throw new HttpError(403, 'You do not own this ticket');
    }
    if (row.current_status !== 'ACTIVE') {
      throw new HttpError(
        409,
        `Only ACTIVE tickets can be transferred (current status: ${row.current_status})`
      );
    }
    if (row.event_ended) {
      throw new HttpError(400, 'Cannot transfer a ticket after the event has ended');
    }
    if (!row.recipient_exists) {
      throw new HttpError(404, 'Recipient user not found');
    }

    return {
      invalidatedTicketId: row.invalidated_ticket_id,
      ticket: row.new_ticket,
    };
  }

  async invalidateTicket(ticketId: number, organizerId: number) {
    const result = await this.db.query<{
      found_id: number | null;
      organizer_id: number | null;
      ticket: {
        id: number;
        event_id: number;
        reservation_id: number;
        status: TicketStatus;
        owner_id: number;
      } | null;
    }>(
      `WITH target AS (
         SELECT t.id, t.status, e.organizer_id
         FROM "ticket" t
         JOIN "event" e ON e.id = t.event_id
         WHERE t.id = $1::int
         FOR UPDATE OF t
       ),
       updated AS (
         UPDATE "ticket" t
         SET status = 'INVALIDATED'
         FROM target tg
         WHERE t.id = tg.id
           AND tg.organizer_id = $2::int
         RETURNING t.id, t.event_id, t.reservation_id, t.status, t.owner_id
       )
       SELECT
         tg.id AS found_id,
         tg.organizer_id,
         (SELECT row_to_json(u) FROM updated u) AS ticket
       FROM (SELECT 1) dummy
       LEFT JOIN target tg ON TRUE`,
      [ticketId, organizerId]
    );

    const row = result.rows[0];
    if (row.found_id === null) {
      throw new HttpError(404, 'Ticket not found');
    }
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own the event for this ticket');
    }

    return row.ticket;
  }

  async getScannerEvents(userId: number) {
    const result = await this.db.query(
      `SELECT DISTINCT e.id, e.name, e.description, e.start, e."end", e.slots, e.current_occupancy
       FROM "event" e
       LEFT JOIN "verification_permission" vp
         ON vp.event_id = e.id AND vp.user_id = $1::int
       WHERE e.organizer_id = $1::int
          OR (vp.user_id IS NOT NULL AND NOW() BETWEEN vp.start AND vp."end")
       ORDER BY e.start ASC`,
      [userId]
    );

    return result.rows;
  }

  async verifyTicket(qrToken: string, selectedEventId: number, scanningUserId: number) {
    if (!qrToken || !Number.isInteger(selectedEventId)) {
      throw new HttpError(400, 'qrToken and valid eventId are required');
    }

    const decoded = this.authService.verifyQrToken(qrToken);
    if (!decoded) {
      return {
        valid: false,
        result: 'INVALID' as VerificationLogResult,
        message: 'Invalid or tampered QR signature',
      };
    }

    const result = await this.db.query<{
      ticket_id: number | null;
      owner_name: string | null;
      event_name: string | null;
      outcome: VerificationLogResult | null;
    }>(
      `WITH target_ticket AS (
         SELECT
           t.id,
           t.event_id,
           t.status,
           u.name AS owner_name,
           e.name AS event_name
         FROM "ticket" t
         JOIN "user" u ON u.id = t.owner_id
         JOIN "event" e ON e.id = t.event_id
         WHERE t.id = $1::int
         FOR UPDATE OF t
       ),
       scanner_auth AS (
         SELECT EXISTS (
           SELECT 1
           FROM "event" e
           LEFT JOIN "verification_permission" vp
             ON vp.event_id = e.id AND vp.user_id = $3::int
           WHERE e.id = $2::int
             AND (e.organizer_id = $3::int OR (vp.user_id IS NOT NULL AND NOW() BETWEEN vp.start AND vp."end"))
         ) AS is_authorized
       ),
       evaluated AS (
         SELECT
           tt.id AS ticket_id,
           tt.owner_name,
           tt.event_name,
           CASE
             WHEN NOT sa.is_authorized THEN 'UNAUTHORIZED'::verification_logs_result
             WHEN tt.event_id <> $2::int OR $4::int <> $2::int THEN 'WRONG_EVENT'::verification_logs_result
             WHEN tt.status = 'USED' THEN 'ALREADY_USED'::verification_logs_result
             WHEN tt.status = 'INVALIDATED' THEN 'INVALID'::verification_logs_result
             ELSE 'VALID'::verification_logs_result
           END AS outcome
         FROM target_ticket tt
         CROSS JOIN scanner_auth sa
       ),
       mark_used AS (
         UPDATE "ticket" t
         SET status = 'USED'
         FROM evaluated ev
         WHERE t.id = ev.ticket_id
           AND ev.outcome = 'VALID'
         RETURNING t.id
       ),
       inserted_log AS (
         INSERT INTO "verification_logs" (ticket_id, scanning_user_id, scanned_at, result)
         SELECT ev.ticket_id, $3::int, NOW(), ev.outcome
         FROM evaluated ev
         RETURNING id
       )
       SELECT
         ev.ticket_id,
         ev.owner_name,
         ev.event_name,
         ev.outcome
       FROM (SELECT 1) dummy
       LEFT JOIN evaluated ev ON TRUE`,
      [decoded.ticketId, selectedEventId, scanningUserId, decoded.eventId]
    );

    const row = result.rows[0];
    if (!row || row.ticket_id === null || row.outcome === null) {
      return {
        valid: false,
        result: 'INVALID' as VerificationLogResult,
        message: 'Ticket does not exist',
      };
    }

    const messageMap: Record<VerificationLogResult, string> = {
      VALID: 'Ticket verified successfully',
      ALREADY_USED: 'Ticket has already been scanned and used',
      INVALID: 'Ticket has been invalidated',
      WRONG_EVENT: `Ticket belongs to another event (${row.event_name})`,
      UNAUTHORIZED: 'You are not authorized to scan tickets for this event at this time',
    };

    return {
      valid: row.outcome === 'VALID',
      result: row.outcome,
      message: messageMap[row.outcome],
      ticket: {
        id: row.ticket_id,
        ownerName: row.owner_name,
        eventName: row.event_name,
      },
    };
  }
}