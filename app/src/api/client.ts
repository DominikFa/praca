import type {
  EventAnalytics,
  EventRecord,
  OrganizerOverview,
  ReservationRecord,
  TicketRecord,
  UserProfile,
  UserSearchResult,
  VerificationLogEntry,
  VerifierRecord,
  VerifyTicketResponse,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Users & Auth
  register: (body: { name: string; login: string; password: string }) =>
    request<{ user: UserProfile; token: string }>('/users/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { login: string; password: string }) =>
    request<{ user: UserProfile; token: string }>('/users/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getMe: () => request<UserProfile>('/users/me'),

  updateMe: (body: { name?: string; password?: string }) =>
    request<UserProfile>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  searchUsers: (name: string) =>
    request<UserSearchResult[]>(`/users/search?name=${encodeURIComponent(name)}`),

  // Events & Verifiers
  listEvents: (params?: { upcoming?: boolean; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.upcoming) query.set('upcoming', 'true');
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return request<EventRecord[]>(`/events${qs ? `?${qs}` : ''}`);
  },

  listMyEvents: () => request<EventRecord[]>('/events/my'),

  createEvent: (body: {
    name: string;
    description?: string;
    start: string;
    end: string;
    slots: number;
    price: number;
  }) =>
    request<EventRecord>('/events', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateEvent: (
    eventId: number,
    body: {
      name?: string;
      description?: string | null;
      start?: string;
      end?: string;
      slots?: number;
      price?: number;
    }
  ) =>
    request<EventRecord>(`/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteEvent: (eventId: number) =>
    request<void>(`/events/${eventId}`, {
      method: 'DELETE',
    }),

  listVerifiers: (eventId: number) =>
    request<VerifierRecord[]>(`/events/${eventId}/verifiers`),

  addVerifier: (eventId: number, body: { userId: number; start: string; end: string }) =>
    request(`/events/${eventId}/verifiers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removeVerifier: (eventId: number, userId: number) =>
    request<void>(`/events/${eventId}/verifiers/${userId}`, {
      method: 'DELETE',
    }),

  getEventReservations: (eventId: number) =>
    request<ReservationRecord[]>(`/events/${eventId}/reservations`),

  createReservation: (body: { eventId: number; quantity: number }) =>
    request<ReservationRecord>('/reservations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getMyReservations: () => request<ReservationRecord[]>('/reservations/my'),

  confirmReservation: (reservationId: number) =>
    request<{ reservation: ReservationRecord; tickets: TicketRecord[] }>(
      `/reservations/${reservationId}/confirm`,
      { method: 'POST' }
    ),

  cancelReservation: (reservationId: number) =>
    request<ReservationRecord>(`/reservations/${reservationId}/cancel`, {
      method: 'POST',
    }),

  getMyTickets: () => request<TicketRecord[]>('/tickets/my'),

  transferTicket: (ticketId: number, recipientUserId: number) =>
    request<{ invalidatedTicketId: number; ticket: TicketRecord }>(
      `/tickets/${ticketId}/transfer`,
      {
        method: 'POST',
        body: JSON.stringify({ recipientUserId }),
      }
    ),

  invalidateTicket: (ticketId: number) =>
    request<TicketRecord>(`/tickets/${ticketId}/invalidate`, {
      method: 'PATCH',
    }),

  getScannerEvents: () => request<EventRecord[]>('/tickets/scanner/events'),

  verifyTicket: (body: { qrToken: string; eventId: number }) =>
    request<VerifyTicketResponse>('/tickets/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getAnalyticsOverview: () => request<OrganizerOverview>('/analytics/overview'),

  getEventAnalytics: (eventId: number) =>
    request<EventAnalytics>(`/analytics/events/${eventId}`),

  getEventLogs: (eventId: number, result?: string) => {
    const qs = result ? `?result=${encodeURIComponent(result)}` : '';
    return request<VerificationLogEntry[]>(`/analytics/events/${eventId}/logs${qs}`);
  },
};