
export type Role = 'USER' | 'ORGANIZER';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type TicketStatus = 'ACTIVE' | 'USED' | 'INVALIDATED';
export type VerificationLogResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID'
  | 'WRONG_EVENT'
  | 'UNAUTHORIZED';

export interface UserProfile {
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

export interface VerifierRecord {
  userId: number;
  name: string;
  maskedLogin: string;
  start: string;
  end: string;
}

export interface ReservationRecord {
  id: number;
  status: ReservationStatus;
  event_id: number;
  user_id: number;
  created_at: string;
  expires_at: string;
  quantity: number;
  event_name?: string;
  event_start?: string;
  event_end?: string;
  unit_price?: string;
  total_price?: string;
  user_name?: string;
}

export interface TicketRecord {
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

export interface VerifyTicketResponse {
  valid: boolean;
  result: VerificationLogResult;
  message: string;
  ticket?: {
    id: number;
    ownerName: string;
    eventName: string;
  };
}

export interface OrganizerOverview {
  totalEvents: number;
  totalSlots: number;
  totalOccupancy: number;
  occupancyRate: number;
  confirmedTicketsSold: number;
  checkedInTickets: number;
  checkInRate: number;
  simulatedRevenue: number;
}

export interface EventAnalytics {
  eventId: number;
  eventName: string;
  slots: number;
  currentOccupancy: number;
  occupancyRate: number;
  simulatedRevenue: number;
  reservationsByStatus: Array<{
    status: ReservationStatus;
    reservationsCount: number;
    ticketsCount: number;
  }>;
  ticketsByStatus: Record<TicketStatus, number>;
  scansByResult: Array<{
    result: VerificationLogResult;
    count: number;
  }>;
  checkInTimeline: Array<{
    hour: string;
    validScans: number;
  }>;
}

export interface VerificationLogEntry {
  id: number;
  ticketId: number;
  scanningUserId: number;
  scannerName: string;
  scannerMaskedLogin: string;
  scannedAt: string;
  result: VerificationLogResult;
}