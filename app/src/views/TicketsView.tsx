import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { UserSearchDrawer } from '../components/UserSearchDrawer';
import type { TicketRecord } from '../types';
import { downloadTicketPdf, generateQrDataUrl } from '../utils/ticketGenerator';
import './TicketsView.css';

export function TicketsView() {
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTicket, setActiveTicket] = useState<TicketRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [transferTicket, setTransferTicket] = useState<TicketRecord | null>(null);

  const loadTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMyTickets();
      setTickets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const openQrModal = async (ticket: TicketRecord) => {
    setActiveTicket(ticket);
    setQrDataUrl(null);
    const dataUrl = await generateQrDataUrl(ticket.qrToken);
    setQrDataUrl(dataUrl);
  };

  const statusBadgeClass = (status: TicketRecord['status']) => {
    if (status === 'ACTIVE') return 'badge-valid';
    if (status === 'USED') return 'badge-neutral';
    return 'badge-danger';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Tickets</h1>
        </div>
        <button type="button" className="btn btn-sm" onClick={loadTickets}>
          Refresh
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading tickets...</p>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          You don't have any tickets yet.
        </div>
      ) : (
        <div className="tickets-grid">
          {tickets.map((ticket) => {
            const isActive = ticket.status === 'ACTIVE';
            return (
              <article
                key={ticket.id}
                className={`ticket-stub ${!isActive ? 'ticket-stub--inactive' : ''}`}
              >
                <div>
                  <div className="ticket-stub-header">
                    <div>
                      <div className="ticket-id-tag">
                        TICKET #{ticket.id} · ORDER #{ticket.reservation_id}
                      </div>
                      <h2 className="event-title" style={{ marginTop: '0.2rem' }}>
                        {ticket.event_name}
                      </h2>
                    </div>
                    <span className={`badge ${statusBadgeClass(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <strong>Holder:</strong> {ticket.owner_name}
                    </div>
                    <div>
                      <strong>Starts:</strong> {new Date(ticket.event_start).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="ticket-stub-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={!isActive}
                    onClick={() => openQrModal(ticket)}
                  >
                    Show QR
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => downloadTicketPdf(ticket)}
                  >
                    PDF
                  </button>
                  {isActive && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setTransferTicket(ticket)}
                    >
                      Transfer
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(activeTicket)}
        title={activeTicket ? activeTicket.event_name : 'Ticket'}
        onClose={() => setActiveTicket(null)}
      >
        {activeTicket && (
          <>
            <div className="qr-optical-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR code for ticket #${activeTicket.id}`} />
              ) : (
                <p>Generating QR code...</p>
              )}
              <div className="qr-caption">
                TICKET #{activeTicket.id} · {activeTicket.owner_name}
              </div>
            </div>

            <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              <div>
                <strong>Starts:</strong> {new Date(activeTicket.event_start).toLocaleString()}
              </div>
              <div>
                <strong>Ends:</strong> {new Date(activeTicket.event_end).toLocaleString()}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => downloadTicketPdf(activeTicket)}
            >
              Download PDF
            </button>
          </>
        )}
      </Modal>

      <UserSearchDrawer
        open={Boolean(transferTicket)}
        title={transferTicket ? `Transfer Ticket #${transferTicket.id}` : 'Transfer Ticket'}
        actionLabel="Transfer Ticket"
        onClose={() => setTransferTicket(null)}
        extraFields={
          <div className="alert-info">
            Your current ticket (#{transferTicket?.id}) will be canceled and a new active ticket will be sent to the selected user.
          </div>
        }
        onConfirm={async (recipient) => {
          if (!transferTicket) return;
          await api.transferTicket(transferTicket.id, recipient.id);
          await loadTickets();
        }}
      />
    </div>
  );
}