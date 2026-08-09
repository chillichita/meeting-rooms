import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError, type MyBooking } from './api';
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
  const [cancelScope, setCancelScope] = useState<'one' | 'series'>('one');
  const [repeatFor, setRepeatFor] = useState<MyBooking | null>(null);
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatBusy, setRepeatBusy] = useState(false);
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

  // keep the strip behind the floating nav dark (same trick as HomePage/RoomPage).
  useEffect(() => {
    document.body.classList.add('dark');
    return () => document.body.classList.remove('dark');
  }, []);

  // toast auto-dismiss.
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
      if (confirm.series_id && cancelScope === 'series') {
        await api(`/api/bookings/series/${confirm.series_id}`, { method: 'DELETE' });
        setToast('Series cancelled.');
      } else {
        await api(`/api/bookings/${confirm.id}`, { method: 'DELETE' });
        setToast('Booking cancelled.');
      }
      setConfirm(null);
      load();
    } catch {
      setConfirm(null);
    }
  };

  // Repeat/Extend: turn a single booking into a weekly series, or add
  // occurrences to an existing one. count = new occurrences to create.
  const repeat = async () => {
    if (!repeatFor) return;
    setRepeatBusy(true);
    try {
      const res = await api<{ created: number }>(`/api/bookings/${repeatFor.id}/repeat`, {
        method: 'POST',
        body: JSON.stringify({ count: repeatCount }),
      });
      setToast(
        repeatFor.series_id
          ? `Series extended by ${res.created} more week${res.created === 1 ? '' : 's'}.`
          : `Now repeats weekly — ${res.created + 1} occurrences.`,
      );
      setRepeatFor(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) setToast(err.message);
      else setToast("Can't reach the server.");
    } finally {
      setRepeatBusy(false);
    }
  };

  const rows = (list: MyBooking[], withActions: boolean) =>
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
          <b>
            {b.title}
            {b.series_id && <span className="series-mark" title="Repeats weekly">↻</span>}
          </b>
          <span>
            {b.room_name} · Floor {b.floor}
            {b.series_id && ' · weekly'}
          </span>
        </div>
        {withActions && (
          <div className="bk-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                setRepeatCount(4);
                setRepeatFor(b);
              }}
            >
              Repeat
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                setCancelScope('one');
                setConfirm(b);
              }}
            >
              Cancel
            </button>
          </div>
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
              {confirm.series_id && (
                <div className="scope-row">
                  <label className="scope-opt">
                    <input
                      type="radio"
                      name="cancel-scope"
                      checked={cancelScope === 'one'}
                      onChange={() => setCancelScope('one')}
                    />
                    This occurrence only — the rest of the series stays
                  </label>
                  <label className="scope-opt">
                    <input
                      type="radio"
                      name="cancel-scope"
                      checked={cancelScope === 'series'}
                      onChange={() => setCancelScope('series')}
                    />
                    Entire series
                  </label>
                </div>
              )}
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

      {repeatFor && (
        <div className="modal-overlay" onClick={() => setRepeatFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>{repeatFor.series_id ? 'Extend series' : 'Repeat weekly'}</b>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                {repeatFor.series_id ? (
                  <>
                    &ldquo;{repeatFor.title}&rdquo; repeats every week. Add more occurrences to
                    this series?
                  </>
                ) : (
                  <>
                    &ldquo;{repeatFor.title}&rdquo; on{' '}
                    {format(new Date(repeatFor.start_at), 'EEE, MMM dd')} will repeat every week,
                    same room and time.
                  </>
                )}
              </p>
              <div className="field" style={{ marginTop: 14 }}>
                <label className="lbl" htmlFor="repeat-count">
                  {repeatFor.series_id ? 'Add occurrences' : 'Weekly occurrences'}
                </label>
                <input
                  id="repeat-count"
                  className="input"
                  type="number"
                  min={1}
                  max={52}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Number(e.target.value))}
                />
                <div className="modal-hint">1–52 weeks</div>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setRepeatFor(null)}>
                Keep as is
              </button>
              <button type="button" className="btn btn-primary" disabled={repeatBusy} onClick={repeat}>
                {repeatFor.series_id ? 'Extend' : 'Repeat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
