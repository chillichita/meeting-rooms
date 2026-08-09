export type User = { id: number; name: string; email: string };

export type Room = { id: number; name: string; floor: number; capacity: number };

export type Booking = {
  id: number;
  title: string;
  start_at: string; // UTC ISO
  end_at: string; // UTC ISO
  user_id: number;
  user_name: string;
  series_id: string | null; // set when the booking is part of a weekly series
};

/** Booking as listed on /api/bookings (own bookings, joined with the room). */
export type MyBooking = Booking & {
  room_id: number;
  room_name: string;
  floor: number;
};

/** Item from GET /api/bookings/notifications (due end-of-booking alerts). */
export type NotificationItem = {
  booking_id: number;
  room_name: string;
  ends_at: string;
  ends_in_minutes: number;
};

export class ApiError extends Error {
  status: number;
  field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/** Fetch wrapper: JSON in/out, session cookie attached, errors -> ApiError. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? 'Request failed', body?.field);
  }
  return body as T;
}
