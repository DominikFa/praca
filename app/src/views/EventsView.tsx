import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Drawer } from '../components/Drawer';
import { Modal } from '../components/Modal';
import { UserSearchDrawer } from '../components/UserSearchDrawer';
import { useAuth } from '../context/AuthContext';
import type { EventRecord, VerifierRecord } from '../types';
import './EventsView.css';

export function EventsView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOrganizer = user?.role === 'ORGANIZER';

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [search, setSearch] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookingEvent, setBookingEvent] = useState<EventRecord | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const [eventDrawerOpen, setEventDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formSlots, setFormSlots] = useState(100);
  const [formPrice, setFormPrice] = useState(50);
  const [savingEvent, setSavingEvent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [verifierEvent, setVerifierEvent] = useState<EventRecord | null>(null);
  const [verifiers, setVerifiers] = useState<VerifierRecord[]>([]);
  const [addVerifierOpen, setAddVerifierOpen] = useState(false);
  const [permStart, setPermStart] = useState('');
  const [permEnd, setPermEnd] = useState('');

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = isOrganizer
        ? await api.listMyEvents()
        : await api.listEvents({ upcoming: upcomingOnly, search });
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [isOrganizer, upcomingOnly]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    loadEvents();
  };

  const openBooking = (ev: EventRecord) => {
    setBookingEvent(ev);
    setQuantity(1);
    setBookingError(null);
  };

  const handleReserve = async (payImmediately: boolean) => {
    if (!bookingEvent) return;
    setBookingLoading(true);
    setBookingError(null);
    try {
      const reservation = await api.createReservation({
        eventId: bookingEvent.id,
        quantity,
      });
      if (payImmediately) {
        await api.confirmReservation(reservation.id);
        setBookingEvent(null);
        navigate('/tickets');
      } else {
        setBookingEvent(null);
        navigate('/orders');
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Reservation failed');
    } finally {
      setBookingLoading(false);
    }
  };

  const toLocalDateTimeInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openCreateDrawer = () => {
    setEditingEvent(null);
    setFormName('');
    setFormDesc('');
    const now = new Date();
    const start = new Date(now.getTime() + 24 * 3600_000);
    const end = new Date(now.getTime() + 28 * 3600_000);
    setFormStart(toLocalDateTimeInput(start.toISOString()));
    setFormEnd(toLocalDateTimeInput(end.toISOString()));
    setFormSlots(100);
    setFormPrice(50);
    setFormError(null);
    setEventDrawerOpen(true);
  };

  const openEditDrawer = (ev: EventRecord) => {
    setEditingEvent(ev);
    setFormName(ev.name);
    setFormDesc(ev.description ?? '');
    setFormStart(toLocalDateTimeInput(ev.start));
    setFormEnd(toLocalDateTimeInput(ev.end));
    setFormSlots(ev.slots);
    setFormPrice(Number(ev.price));
    setFormError(null);
    setEventDrawerOpen(true);
  };

  const handleSaveEvent = async (e: FormEvent) => {
    e.preventDefault();
    setSavingEvent(true);
    setFormError(null);
    try {
      const payload = {
        name: formName,
        description: formDesc || undefined,
        start: new Date(formStart).toISOString(),
        end: new Date(formEnd).toISOString(),
        slots: Number(formSlots),
        price: Number(formPrice),
      };
      if (editingEvent) {
        await api.updateEvent(editingEvent.id, payload);
      } else {
        await api.createEvent(payload);
      }
      setEventDrawerOpen(false);
      await loadEvents();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (ev: EventRecord) => {
    if (!window.confirm(`Delete "${ev.name}"?`)) return;
    try {
      await api.deleteEvent(ev.id);
      await loadEvents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete event');
    }
  };

  const openVerifiersModal = async (ev: EventRecord) => {
    setVerifierEvent(ev);
    setPermStart(toLocalDateTimeInput(ev.start));
    setPermEnd(toLocalDateTimeInput(ev.end));
    try {
      const list = await api.listVerifiers(ev.id);
      setVerifiers(list);
    } catch {
      setVerifiers([]);
    }
  };

  const handleRemoveVerifier = async (targetUserId: number) => {
    if (!verifierEvent) return;
    await api.removeVerifier(verifierEvent.id, targetUserId);
    const list = await api.listVerifiers(verifierEvent.id);
    setVerifiers(list);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isOrganizer ? 'My Events' : 'Events'}</h1>
        </div>

        {isOrganizer && (
          <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
            + Create Event
          </button>
        )}
      </div>

      {!isOrganizer && (
        <form className="events-toolbar" onSubmit={handleSearchSubmit}>
          <input
            className="input"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn">
            Search
          </button>
          <button
            type="button"
            className={`btn ${upcomingOnly ? 'btn-secondary' : ''}`}
            onClick={() => setUpcomingOnly((prev) => !prev)}
          >
            {upcomingOnly ? 'Upcoming' : 'All Events'}
          </button>
        </form>
      )}

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading events...</p>
      ) : events.length === 0 ? (
        <div className="empty-state">No events found.</div>
      ) : (
        <div className="events-grid">
          {events.map((ev) => {
            const remaining = ev.available_slots ?? ev.slots - ev.current_occupancy;
            const soldOut = remaining <= 0;

            return (
              <article key={ev.id} className="event-card">
                <div>
                  <div className="event-card-top">
                    <h2 className="event-title">{ev.name}</h2>
                    <span className={`badge ${soldOut ? 'badge-danger' : 'badge-valid'}`}>
                      {soldOut ? 'Sold Out' : `${remaining} left`}
                    </span>
                  </div>

                  {ev.description && <p className="event-desc">{ev.description}</p>}

                  <div className="event-meta">
                    <div>
                      <strong>Starts:</strong> {new Date(ev.start).toLocaleString()}
                    </div>
                    <div>
                      <strong>Ends:</strong> {new Date(ev.end).toLocaleString()}
                    </div>
                    <div>
                      <strong>Capacity:</strong> {ev.current_occupancy} / {ev.slots}
                    </div>
                    <div>
                      <strong>Price:</strong> {Number(ev.price).toFixed(2)} PLN
                    </div>
                  </div>
                </div>

                <div className="event-card-actions">
                  {!isOrganizer ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      disabled={soldOut}
                      onClick={() => openBooking(ev)}
                    >
                      {soldOut ? 'Sold Out' : 'Reserve Tickets'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openEditDrawer(ev)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => openVerifiersModal(ev)}
                      >
                        Verifiers
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteEvent(ev)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(bookingEvent)}
        title={bookingEvent ? bookingEvent.name : 'Reserve Tickets'}
        onClose={() => setBookingEvent(null)}
      >
        {bookingEvent && (
          <>
            {bookingError && <div className="alert-error">{bookingError}</div>}

            <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {new Date(bookingEvent.start).toLocaleString()} ·{' '}
              <strong>{Number(bookingEvent.price).toFixed(2)} PLN</strong> / ticket
            </p>

            <div className="stepper-row">
              <span style={{ fontWeight: 600 }}>Quantity</span>
              <div className="stepper-controls">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <strong style={{ minWidth: '1.5rem', textAlign: 'center' }}>{quantity}</strong>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={
                    quantity >=
                    (bookingEvent.available_slots ??
                      bookingEvent.slots - bookingEvent.current_occupancy)
                  }
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="stepper-row">
              <span style={{ fontWeight: 600 }}>Total</span>
              <strong style={{ fontSize: '1.1rem' }}>
                {(Number(bookingEvent.price) * quantity).toFixed(2)} PLN
              </strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={bookingLoading}
                onClick={() => handleReserve(true)}
              >
                {bookingLoading ? 'Processing...' : 'Reserve & Pay Now'}
              </button>
              <button
                type="button"
                className="btn btn-block"
                disabled={bookingLoading}
                onClick={() => handleReserve(false)}
              >
                Reserve (Pay Within 15 Min)
              </button>
            </div>
          </>
        )}
      </Modal>

      <Drawer
        open={eventDrawerOpen}
        title={editingEvent ? 'Edit Event' : 'Create Event'}
        onClose={() => setEventDrawerOpen(false)}
      >
        {formError && <div className="alert-error">{formError}</div>}
        <form onSubmit={handleSaveEvent}>
          <div className="form-field">
            <label htmlFor="ev-name">Event Name</label>
            <input
              id="ev-name"
              className="input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="ev-desc">Description</label>
            <textarea
              id="ev-desc"
              className="input"
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="ev-start">Start Date & Time</label>
            <input
              id="ev-start"
              type="datetime-local"
              className="input"
              value={formStart}
              onChange={(e) => setFormStart(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="ev-end">End Date & Time</label>
            <input
              id="ev-end"
              type="datetime-local"
              className="input"
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="ev-slots">Capacity</label>
            <input
              id="ev-slots"
              type="number"
              min={editingEvent ? editingEvent.current_occupancy : 1}
              className="input"
              value={formSlots}
              onChange={(e) => setFormSlots(Number(e.target.value))}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="ev-price">Price (PLN)</label>
            <input
              id="ev-price"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={formPrice}
              onChange={(e) => setFormPrice(Number(e.target.value))}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={savingEvent}>
            {savingEvent ? 'Saving...' : editingEvent ? 'Save Event' : 'Create Event'}
          </button>
        </form>
      </Drawer>

      <Modal
        open={Boolean(verifierEvent)}
        title={verifierEvent ? `Verifiers: ${verifierEvent.name}` : 'Verifiers'}
        onClose={() => setVerifierEvent(null)}
      >
        {verifierEvent && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.9rem' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setAddVerifierOpen(true)}
              >
                + Add Verifier
              </button>
            </div>

            {verifiers.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No verifiers assigned yet.
              </p>
            ) : (
              <div className="verifier-list">
                {verifiers.map((v) => (
                  <div key={v.userId} className="verifier-row">
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {v.name}{' '}
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          ({v.maskedLogin})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {new Date(v.start).toLocaleString()} → {new Date(v.end).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemoveVerifier(v.userId)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      <UserSearchDrawer
        open={addVerifierOpen}
        title="Add Verifier"
        actionLabel="Assign Verifier"
        onClose={() => setAddVerifierOpen(false)}
        extraFields={
          <>
            <div className="form-field">
              <label htmlFor="perm-start">Access Starts</label>
              <input
                id="perm-start"
                type="datetime-local"
                className="input"
                value={permStart}
                onChange={(e) => setPermStart(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="perm-end">Access Ends</label>
              <input
                id="perm-end"
                type="datetime-local"
                className="input"
                value={permEnd}
                onChange={(e) => setPermEnd(e.target.value)}
                required
              />
            </div>
          </>
        }
        onConfirm={async (selectedUser) => {
          if (!verifierEvent) return;
          await api.addVerifier(verifierEvent.id, {
            userId: selectedUser.id,
            start: new Date(permStart).toISOString(),
            end: new Date(permEnd).toISOString(),
          });
          const list = await api.listVerifiers(verifierEvent.id);
          setVerifiers(list);
        }}
      />
    </div>
  );
}