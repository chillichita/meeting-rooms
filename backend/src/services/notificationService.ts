import { db } from '../db.js';
import { NOTIFY_BEFORE_MINUTES } from '../config.js';

export interface NotificationItem {
  booking_id: number;
  room_name: string;
  ends_at: string;
  ends_in_minutes: number;
}

// The due query reads live booking rows, so a cancelled booking on either side
// of the pair simply stops matching — no extra bookkeeping. Exactly-once is
// enforced by the notifications table: rows are inserted here, at delivery,
// and ON DELETE CASCADE clears them when the booking is cancelled.
const dueQuery = db.prepare(`
  SELECT b.id AS booking_id, r.name AS room_name, b.end_at AS ends_at
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  WHERE b.user_id = @userId
    AND b.end_at > @now
    AND b.end_at <= @nowPlusN
    AND EXISTS (
      SELECT 1 FROM bookings n
      WHERE n.room_id = b.room_id AND n.start_at = b.end_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM notifications s WHERE s.booking_id = b.id
    )
`);
const markSent = db.prepare('INSERT INTO notifications (booking_id, sent_at) VALUES (?, ?)');

// nowIso is a parameter (not Date.now inside) so tests can drive the
// notification window with controlled timestamps.
export function dueNotifications(userId: number, nowIso: string): NotificationItem[] {
  const now = new Date(nowIso).getTime();
  const nowPlusN = new Date(now + NOTIFY_BEFORE_MINUTES * 60_000).toISOString();
  const due = dueQuery.all({ userId, now: nowIso, nowPlusN }) as Omit<NotificationItem, 'ends_in_minutes'>[];

  return due.map((n) => {
    markSent.run(n.booking_id, nowIso);
    return {
      ...n,
      ends_in_minutes: Math.max(1, Math.round((new Date(n.ends_at).getTime() - now) / 60_000)),
    };
  });
}
