import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ReservationRecord } from '../types';
import './OrdersView.css';

export function OrdersView() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ReservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMyReservations();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleConfirmPayment = async (reservationId: number) => {
    setBusyId(reservationId);
    setError(null);
    try {
      await api.confirmReservation(reservationId);
      navigate('/tickets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      await loadOrders();
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (reservationId: number) => {
    if (!window.confirm('Cancel this order? Any unused tickets from this order will be invalidated.')) return;
    setBusyId(reservationId);
    setError(null);
    try {
      await api.cancelReservation(reservationId);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setBusyId(null);
    }
  };

  const badgeClass = (status: ReservationRecord['status']) => {
    if (status === 'CONFIRMED') return 'badge-valid';
    if (status === 'PENDING') return 'badge-warn';
    if (status === 'CANCELLED') return 'badge-danger';
    return 'badge-neutral';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
        </div>
        <button type="button" className="btn btn-sm" onClick={loadOrders}>
          Refresh
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading orders...</p>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders yet.</div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => {
            const isPending = order.status === 'PENDING';
            const isConfirmed = order.status === 'CONFIRMED';

            return (
              <div key={order.id} className="order-card">
                <div className="order-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <strong>Order #{order.id}</strong>
                    <span className={`badge ${badgeClass(order.status)}`}>{order.status}</span>
                  </div>

                  <div style={{ fontSize: '1.02rem', fontWeight: 700 }}>
                    {order.event_name ?? `Event #${order.event_id}`}
                  </div>

                  <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    Quantity: <strong>{order.quantity}</strong> · Total:{' '}
                    <strong>{Number(order.total_price ?? 0).toFixed(2)} PLN</strong>
                    {isPending && (
                      <> · Expires at {new Date(order.expires_at).toLocaleTimeString()}</>
                    )}
                  </div>
                </div>

                <div className="order-actions">
                  {isPending && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busyId === order.id}
                      onClick={() => handleConfirmPayment(order.id)}
                    >
                      {busyId === order.id ? 'Processing...' : 'Pay Now'}
                    </button>
                  )}
                  {(isPending || isConfirmed) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busyId === order.id}
                      onClick={() => handleCancel(order.id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}