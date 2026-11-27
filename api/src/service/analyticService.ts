import { Pool } from 'pg';
import { HttpError, VerificationLogResult } from '../types';
import { UserService } from './userService';

const ALLOWED_LOG_RESULTS: VerificationLogResult[] = [
  'VALID',
  'ALREADY_USED',
  'INVALID',
  'WRONG_EVENT',
  'UNAUTHORIZED',
];

export class AnalyticService {
  constructor(private readonly db: Pool) {}

  async getOrganizerOverview(organizerId: number) {
    const result = await this.db.query<{
      total_events: number;
      total_slots: number;
      total_occupancy: number;
      confirmed_tickets: number;
      checked_in_tickets: number;
      simulated_revenue: string;
    }>(
      `WITH org_events AS (
         SELECT id, slots, current_occupancy, price
         FROM "event"
         WHERE organizer_id = $1::int
       ),
       ev_agg AS (
         SELECT
           COUNT(*)::int AS total_events,
           COALESCE(SUM(slots), 0)::int AS total_slots,
           COALESCE(SUM(current_occupancy), 0)::int AS total_occupancy
         FROM org_events
       ),
       tk_agg AS (
         SELECT
           COUNT(t.id) FILTER (WHERE t.status IN ('ACTIVE', 'USED'))::int AS confirmed_tickets,
           COUNT(t.id) FILTER (WHERE t.status = 'USED')::int AS checked_in_tickets,
           COALESCE(SUM(oe.price) FILTER (WHERE t.status IN ('ACTIVE', 'USED')), 0)::text AS simulated_revenue
         FROM org_events oe
         LEFT JOIN "ticket" t ON t.event_id = oe.id
       )
       SELECT
         ev_agg.total_events,
         ev_agg.total_slots,
         ev_agg.total_occupancy,
         tk_agg.confirmed_tickets,
         tk_agg.checked_in_tickets,
         tk_agg.simulated_revenue
       FROM ev_agg, tk_agg`,
      [organizerId]
    );

    const row = result.rows[0];
    return {
      totalEvents: row.total_events,
      totalSlots: row.total_slots,
      totalOccupancy: row.total_occupancy,
      occupancyRate:
        row.total_slots > 0 ? Number(((row.total_occupancy / row.total_slots) * 100).toFixed(2)) : 0,
      confirmedTicketsSold: row.confirmed_tickets,
      checkedInTickets: row.checked_in_tickets,
      checkInRate:
        row.confirmed_tickets > 0
          ? Number(((row.checked_in_tickets / row.confirmed_tickets) * 100).toFixed(2))
          : 0,
      simulatedRevenue: Number(row.simulated_revenue),
    };
  }

  async getEventAnalytics(eventId: number, organizerId: number) {
    const result = await this.db.query<{
      found_id: number | null;
      organizer_id: number | null;
      event_name: string | null;
      slots: number;
      current_occupancy: number;
      price: string;
      reservations_by_status: Array<{ status: string; reservationsCount: number; ticketsCount: number }>;
      tickets_by_status: Array<{ status: string; count: number }>;
      scans_by_result: Array<{ result: string; count: number }>;
      checkin_timeline: Array<{ hour: string; validScans: number }>;
    }>(
      `WITH ev AS (
         SELECT id, name, organizer_id, slots, current_occupancy, price
         FROM "event"
         WHERE id = $1::int
       ),
       res_stats AS (
         SELECT COALESCE(
           json_agg(
             json_build_object(
               'status', status,
               'reservationsCount', cnt,
               'ticketsCount', tks
             )
           ),
           '[]'::json
         ) AS data
         FROM (
           SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(quantity), 0)::int AS tks
           FROM "reservation"
           WHERE event_id = $1::int
           GROUP BY status
         ) s
       ),
       tk_stats AS (
         SELECT COALESCE(
           json_agg(json_build_object('status', status, 'count', cnt)),
           '[]'::json
         ) AS data
         FROM (
           SELECT status, COUNT(*)::int AS cnt
           FROM "ticket"
           WHERE event_id = $1::int
           GROUP BY status
         ) s
       ),
       scan_stats AS (
         SELECT COALESCE(
           json_agg(json_build_object('result', result, 'count', cnt)),
           '[]'::json
         ) AS data
         FROM (
           SELECT vl.result, COUNT(*)::int AS cnt
           FROM "verification_logs" vl
           JOIN "ticket" t ON t.id = vl.ticket_id
           WHERE t.event_id = $1::int
           GROUP BY vl.result
         ) s
       ),
       timeline AS (
         SELECT COALESCE(
           json_agg(json_build_object('hour', hr, 'validScans', cnt) ORDER BY hr ASC),
           '[]'::json
         ) AS data
         FROM (
           SELECT date_trunc('hour', vl.scanned_at) AS hr, COUNT(*)::int AS cnt
           FROM "verification_logs" vl
           JOIN "ticket" t ON t.id = vl.ticket_id
           WHERE t.event_id = $1::int AND vl.result = 'VALID'
           GROUP BY hr
         ) s
       )
       SELECT
         ev.id AS found_id,
         ev.organizer_id,
         ev.name AS event_name,
         COALESCE(ev.slots, 0) AS slots,
         COALESCE(ev.current_occupancy, 0) AS current_occupancy,
         COALESCE(ev.price, 0)::text AS price,
         res_stats.data AS reservations_by_status,
         tk_stats.data AS tickets_by_status,
         scan_stats.data AS scans_by_result,
         timeline.data AS checkin_timeline
       FROM (SELECT 1) dummy
       LEFT JOIN ev ON TRUE
       CROSS JOIN res_stats
       CROSS JOIN tk_stats
       CROSS JOIN scan_stats
       CROSS JOIN timeline`,
      [eventId]
    );

    const row = result.rows[0];
    if (row.found_id === null) {
      throw new HttpError(404, 'Event not found');
    }
    if (row.organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }

    const ticketCounts: Record<string, number> = { ACTIVE: 0, USED: 0, INVALIDATED: 0 };
    for (const item of row.tickets_by_status) {
      ticketCounts[item.status] = item.count;
    }

    const activeAndUsed = ticketCounts.ACTIVE + ticketCounts.USED;
    const simulatedRevenue = Number((activeAndUsed * Number(row.price)).toFixed(2));

    return {
      eventId: row.found_id,
      eventName: row.event_name,
      slots: row.slots,
      currentOccupancy: row.current_occupancy,
      occupancyRate:
        row.slots > 0 ? Number(((row.current_occupancy / row.slots) * 100).toFixed(2)) : 0,
      simulatedRevenue,
      reservationsByStatus: row.reservations_by_status,
      ticketsByStatus: ticketCounts,
      scansByResult: row.scans_by_result,
      checkInTimeline: row.checkin_timeline,
    };
  }

  async getEventVerificationLogs(eventId: number, organizerId: number, resultFilter?: string) {
    let normalizedFilter: VerificationLogResult | null = null;
    if (resultFilter) {
      const upper = resultFilter.toUpperCase() as VerificationLogResult;
      if (!ALLOWED_LOG_RESULTS.includes(upper)) {
        throw new HttpError(400, `Invalid result filter: ${resultFilter}`);
      }
      normalizedFilter = upper;
    }

    const result = await this.db.query<{
      organizer_id: number;
      log_id: number | null;
      ticket_id: number | null;
      scanning_user_id: number | null;
      scanner_name: string | null;
      scanner_login: string | null;
      scanned_at: string | null;
      result: VerificationLogResult | null;
    }>(
      `WITH ev AS (
         SELECT id, organizer_id FROM "event" WHERE id = $1::int
       )
       SELECT
         ev.organizer_id,
         vl.id AS log_id,
         vl.ticket_id,
         vl.scanning_user_id,
         u.name AS scanner_name,
         u.login AS scanner_login,
         vl.scanned_at,
         vl.result
       FROM ev
       LEFT JOIN "ticket" t ON t.event_id = ev.id
       LEFT JOIN "verification_logs" vl
         ON vl.ticket_id = t.id
         AND ($2::verification_logs_result IS NULL OR vl.result = $2::verification_logs_result)
       LEFT JOIN "user" u ON u.id = vl.scanning_user_id
       ORDER BY vl.scanned_at DESC`,
      [eventId, normalizedFilter]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Event not found');
    }

    if (result.rows[0].organizer_id !== organizerId) {
      throw new HttpError(403, 'You do not own this event');
    }

    return result.rows
      .filter((r): r is Required<typeof r> => r.log_id !== null)
      .map((row) => ({
        id: row.log_id,
        ticketId: row.ticket_id,
        scanningUserId: row.scanning_user_id,
        scannerName: row.scanner_name,
        scannerMaskedLogin: UserService.maskLogin(row.scanner_login),
        scannedAt: row.scanned_at,
        result: row.result,
      }));
  }
}