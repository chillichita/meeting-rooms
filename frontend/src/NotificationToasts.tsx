import { useEffect, useState } from 'react';
import { api, type NotificationItem } from './api';
import { useAuth } from './auth-context';

const POLL_MS = 30_000;
const TOAST_MS = 8_000;

// End-of-booking alerts (spec bonus): the backend evaluates "N minutes before
// a booking's end, next slot in the room taken" on live data; this component
// polls it while logged in and shows one toast at a time from a queue.
// ponytail: client polling instead of SSE/WebSocket push; fine for a dev app,
// switch to SSE when push latency matters.
export default function NotificationToasts() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const poll = async () => {
      try {
        const items = await api<NotificationItem[]>('/api/bookings/notifications');
        if (alive && items.length > 0) {
          setQueue((q) => [
            ...q,
            ...items.map(
              (n) => `${n.room_name} is booked right after yours ends (${n.ends_in_minutes} min left).`
            ),
          ]);
        }
      } catch {
        // server unreachable — the next poll retries
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);

  // One toast at a time: shift the queue when the current one's time is up.
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), TOAST_MS);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return <div className="toast">{current}</div>;
}
