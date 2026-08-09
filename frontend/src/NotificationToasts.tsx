import { useEffect, useRef, useState } from 'react';
import { api, type NotificationItem } from './api';
import { useAuth } from './auth-context';

const POLL_MS = 30_000;

type Queued = { id: number; text: string };

// End-of-booking alerts: the backend evaluates "N minutes before
// a booking's end, next slot in the room taken" on live data; this component
// polls it while logged in and shows one alert at a time from a queue.
// Alerts persist until the user dismisses them — dismissed is remembered for
// the session, otherwise the 30s poll would re-raise the same alert forever.
// Client polling instead of SSE/WebSocket push; fine for a dev app,
// switch to SSE when push latency matters.
export default function NotificationToasts() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<Queued[]>([]);
  const seen = useRef(new Set<number>()); // dismissed alert ids (session)

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const poll = async () => {
      try {
        const items = await api<NotificationItem[]>('/api/bookings/notifications');
        if (alive) {
          setQueue((q) => {
            const queued = new Set(q.map((n) => n.id));
            const fresh = items
              .filter((n) => !seen.current.has(n.booking_id) && !queued.has(n.booking_id))
              .map((n) => ({
                id: n.booking_id,
                text: `${n.room_name} is booked right after yours ends (${n.ends_in_minutes} min left).`,
              }));
            return [...q, ...fresh];
          });
        }
      } catch {
        // server unreachable — the next poll retries.
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);

  const current = queue[0];
  const dismiss = (id: number) => {
    seen.current.add(id);
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;
  return (
    <div className="toast warn" onClick={() => dismiss(current.id)}>
      {current.text}
      <button
        type="button"
        className="toast-x"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(current.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
