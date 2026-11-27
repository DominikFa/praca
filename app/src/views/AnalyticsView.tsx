import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type {
  EventAnalytics,
  EventRecord,
  OrganizerOverview,
  VerificationLogEntry,
} from '../types';
import './AnalyticsView.css';

export function AnalyticsView() {
  const [overview, setOverview] = useState<OrganizerOverview | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | ''>('');
  const [eventAnalytics, setEventAnalytics] = useState<EventAnalytics | null>(null);
  const [logs, setLogs] = useState<VerificationLogEntry[]>([]);
  const [resultFilter, setResultFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAnalyticsOverview(), api.listMyEvents()])
      .then(([ov, evList]) => {
        setOverview(ov);
        setEvents(evList);
        if (evList.length > 0) {
          setSelectedEventId(evList[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'));
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const id = Number(selectedEventId);
    Promise.all([api.getEventAnalytics(id), api.getEventLogs(id, resultFilter || undefined)])
      .then(([stats, logEntries]) => {
        setEventAnalytics(stats);
        setLogs(logEntries);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load event stats'));
  }, [selectedEventId, resultFilter]);

  const logBadgeClass = (result: VerificationLogEntry['result']) => {
    if (result === 'VALID') return 'badge-valid';
    if (result === 'ALREADY_USED') return 'badge-warn';
    return 'badge-danger';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {overview && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Events</div>
            <div className="kpi-value">{overview.totalEvents}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Tickets Sold</div>
            <div className="kpi-value">{overview.confirmedTicketsSold}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Check-in Rate</div>
            <div className="kpi-value">{overview.checkInRate}%</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Revenue</div>
            <div className="kpi-value">{overview.simulatedRevenue.toFixed(2)} PLN</div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="empty-state">Create an event first to view analytics.</div>
      ) : (
        <>
          <div className="analytics-section">
            <div className="form-field">
              <label htmlFor="analytics-event-select">Event</label>
              <select
                id="analytics-event-select"
                className="input"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>

            {eventAnalytics && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span>
                    Occupancy: <strong>{eventAnalytics.currentOccupancy}</strong> /{' '}
                    {eventAnalytics.slots}
                  </span>
                  <span>
                    Revenue: <strong>{eventAnalytics.simulatedRevenue.toFixed(2)} PLN</strong>
                  </span>
                </div>

                <div className="analytics-bar-track">
                  <div
                    className="analytics-bar-fill"
                    style={{ width: `${Math.min(100, eventAnalytics.occupancyRate)}%` }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="badge badge-valid">
                    Active: {eventAnalytics.ticketsByStatus.ACTIVE ?? 0}
                  </span>
                  <span className="badge badge-neutral">
                    Used: {eventAnalytics.ticketsByStatus.USED ?? 0}
                  </span>
                  <span className="badge badge-danger">
                    Invalidated: {eventAnalytics.ticketsByStatus.INVALIDATED ?? 0}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="analytics-section">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                marginBottom: '0.9rem',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Scan Log</h2>

              <select
                className="input"
                style={{ maxWidth: '210px' }}
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                aria-label="Filter scan logs"
              >
                <option value="">All Results</option>
                <option value="VALID">VALID</option>
                <option value="ALREADY_USED">ALREADY_USED</option>
                <option value="INVALID">INVALID</option>
                <option value="WRONG_EVENT">WRONG_EVENT</option>
                <option value="UNAUTHORIZED">UNAUTHORIZED</option>
              </select>
            </div>

            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                No scans recorded.
              </p>
            ) : (
              <div className="logs-table-wrap">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Ticket</th>
                      <th>Result</th>
                      <th>Scanned By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.scannedAt).toLocaleString()}</td>
                        <td>#{log.ticketId}</td>
                        <td>
                          <span className={`badge ${logBadgeClass(log.result)}`}>{log.result}</span>
                        </td>
                        <td>
                          {log.scannerName} ({log.scannerMaskedLogin})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}