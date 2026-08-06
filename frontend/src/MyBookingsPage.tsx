import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, type MyBooking } from './api';
import { toYmd } from './grid';
import { useAuth } from './auth-context';

const PAGE = 10; // past-bookings lazy pagination chunk

export default function MyBookingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ok'>('loading');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [pastShown, setPastShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<MyBooking | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadState('loading');
    api<MyBooking[]>('/api/bookings')
      .then((list) => {
        setBookings(list);
        setLoadState('ok');
      })
      .catch(() => setLoadState('error'));
  }, []);
  useEffect(load, [load]);

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const now = Date.now();
  const upcoming = useMemo(
    () => bookings.filter((b) => new Date(b.start_at).getTime() >= now), // ASC from API
    [bookings, now],
  );
  const past = useMemo(
    () => bookings.filter((b) => new Date(b.start_at).getTime() < now).reverse(), // latest first
    [bookings, now],
  );

  const cancel = async () => {
    if (!confirm) return;
    try {
      await api(`/api/bookings/${confirm.id}`, { method: 'DELETE' });
      setToast('Booking cancelled.');
      setConfirm(null);
      load();
    } catch {
      setConfirm(null);
    }
  };

  const rows = (list: MyBooking[], withCancel: boolean) =>
    list.map((b) => (
      <div
        key={b.id}
        className="bk-row"
        role="button"
        onClick={() => navigate(`/rooms/${b.room_id}?week=${toYmd(new Date(b.start_at))}&hl=${b.id}`)}
      >
        <div className="when">
          <span className="mono">{format(new Date(b.start_at), 'EEE, MMM dd')}</span>
          <span>
            {format(new Date(b.start_at), 'HH:mm')}–{format(new Date(b.end_at), 'HH:mm')}
          </span>
        </div>
        <div className="what">
          <b>{b.title}</b>
          <span>
            {b.room_name} · Floor {b.floor}
          </span>
        </div>
        {withCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={(e) => {
              e.stopPropagation();
              setConfirm(b);
            }}
          >
            Cancel
          </button>
        )}
      </div>
    ));

  if (loading) return <main className="stub">checking session…</main>;
  if (!user) return <Navigate to="/login?next=/me" replace />;

  return (
    <div className="profile-page">
      <div className="profile-head">
        <div className="avatar">{user.name[0]?.toUpperCase() ?? '?'}</div>
        <div>
          <b>{user.name}</b>
          <span>{user.email}</span>
        </div>
      </div>

      <div className="bk-tabs">
        <button
          type="button"
          className={tab === 'upcoming' ? 'on' : ''}
          onClick={() => setTab('upcoming')}
        >
          Upcoming
        </button>
        <button type="button" className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>
          Past
        </button>
      </div>

      {loadState === 'error' ? (
        <div className="grid-state">
          <b>Couldn't load your bookings.</b>
          <span className="sub">The server may be temporarily unavailable.</span>
          <div>
            <button type="button" className="btn btn-primary btn-sm" onClick={load}>
              Try again
            </button>
          </div>
        </div>
      ) : loadState === 'loading' ? (
        <div className="grid-state">Loading…</div>
      ) : tab === 'upcoming' ? (
        upcoming.length === 0 ? (
          <div className="empty">
            <b>You have no upcoming bookings.</b>
            <span className="sub">Find a room and reserve a slot.</span>
          </div>
        ) : (
          <div className="bk-list">{rows(upcoming, true)}</div>
        )
      ) : past.length === 0 ? (
        <div className="empty">
          <b>No past bookings yet.</b>
        </div>
      ) : (
        <>
          <div className="bk-list">{rows(past.slice(0, pastShown), false)}</div>
          {past.length > pastShown && (
            <button type="button" className="btn btn-ghost show-more" onClick={() => setPastShown((n) => n + PAGE)}>
              Show more
            </button>
          )}
        </>
      )}

      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>Cancel this booking?</b>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                &ldquo;{confirm.title}&rdquo; on{' '}
                {format(new Date(confirm.start_at), 'EEE, MMM dd')},{' '}
                {format(new Date(confirm.start_at), 'HH:mm')}–
                {format(new Date(confirm.end_at), 'HH:mm')}. This can't be undone.
              </p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Keep booking
              </button>
              <button type="button" className="btn btn-danger" onClick={cancel}>
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
