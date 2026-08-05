import { Fragment, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDays, format, isToday } from 'date-fns';
import { getTimezoneOffset } from 'date-fns-tz';
import { api, type Booking, type Room } from './api';
import { fmtWeekLabel, mondayOf, officeEnd, officeSlots, toYmd, weekDays, OFFICE_TZ } from './grid';
import { useAuth } from './auth-context';

const SLOT_MS = 30 * 60_000;
const ROW_H = 28; // matches grid-auto-rows in CSS

// Compare by offset, not by IANA name: Windows browsers may report "Europe/Kiev"
// for the same zone, and the label only matters when office time differs NOW.
// date-fns-tz getTimezoneOffset returns ms; Date#getTimezoneOffset returns minutes.
const tzDiffers =
  -new Date().getTimezoneOffset() * 60_000 !== getTimezoneOffset(OFFICE_TZ, new Date());

export default function RoomPage() {
  const { id } = useParams();
  const roomId = Number(id);
  const { user } = useAuth();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [room, setRoom] = useState<Room | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      api<Room[]>('/api/rooms'),
      api<Booking[]>(`/api/rooms/${roomId}/bookings?week=${toYmd(monday)}`),
    ])
      .then(([rooms, list]) => {
        setRoom(rooms.find((r) => r.id === roomId) ?? null);
        setBookings(list);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [roomId, monday]);

  useEffect(() => {
    load();
  }, [load]);

  const slots = officeSlots(monday);
  const days = weekDays(monday);
  const endLabel = format(officeEnd(monday), 'HH:mm');
  const firstSlot = slots[0];

  // Bookings → grid cells: keyed by day column + starting slot index.
  const slotByKey = new Map<string, { booking: Booking; len: number; mine: boolean }>();
  if (firstSlot) {
    for (const b of bookings) {
      const start = new Date(b.start_at);
      const end = new Date(b.end_at);
      const dayIdx = (start.getDay() + 6) % 7; // 0 = Monday
      // slot index within that day's working hours (firstSlot = Monday 09:00)
      const dayStart = firstSlot.getTime() + dayIdx * 24 * 60 * 60_000;
      const startIdx = Math.round((start.getTime() - dayStart) / SLOT_MS);
      const endIdx = Math.round((end.getTime() - dayStart) / SLOT_MS);
      if (startIdx < 0 || endIdx > slots.length) continue; // outside the visible grid
      slotByKey.set(`${dayIdx}:${startIdx}`, {
        booking: b,
        len: endIdx - startIdx,
        mine: user?.id === b.user_id,
      });
    }
  }

  // S1 — amber now-line at the current 30-min slot, office day only.
  const nowLineIdx = firstSlot ? Math.floor((now.getTime() - firstSlot.getTime()) / SLOT_MS) : -1;
  const showNowLine = nowLineIdx >= 0 && nowLineIdx < slots.length;

  return (
    <div className="room-page">
      <div className="room-head">
        <span className="crumb">Rooms →</span>
        <h1 className="room-title">{room?.name ?? '…'}</h1>
        {room && (
          <p className="room-meta">
            Floor {room.floor} · up to {room.capacity} people · 09:00–19:00 office time
          </p>
        )}
      </div>

      <div className="grid-wrap">
        <div className="grid-toolbar">
          <button
            type="button"
            className="wkbtn"
            aria-label="Previous week"
            onClick={() => setMonday((m) => addDays(m, -7))}
          >
            ‹
          </button>
          <span className="mono">{fmtWeekLabel(monday)}</span>
          <button
            type="button"
            className="wkbtn"
            aria-label="Next week"
            onClick={() => setMonday((m) => addDays(m, 7))}
          >
            ›
          </button>
          <span style={{ flex: 1 }} />
          {tzDiffers && <span className="tz-label">Office: {OFFICE_TZ}</span>}
        </div>

        {loading ? (
          <div className="gtable skeleton" aria-hidden="true">
            <div className="ghead sk" />
            {Array.from({ length: 7 }, (_, i) => (
              <div className="ghead sk" key={i} />
            ))}
            {Array.from({ length: 20 * 8 }, (_, i) => (
              <div className="gcell sk" key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="grid-state">
            <b>Couldn't load the schedule.</b>
            <span className="sub">The server may be temporarily unavailable.</span>
            <div>
              <button type="button" className="btn btn-primary btn-sm" onClick={load}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* All grid children use explicit grid-row/column so the now-line
                and booking slots never disturb auto-placement. */}
            <div className="gtable">
              <div className="ghead" style={{ gridColumn: 1, gridRow: 1 }} />
              {days.map((d, di) => (
                <div
                  key={d.getTime()}
                  className={`ghead${isToday(d) ? ' today' : ''}`}
                  style={{ gridColumn: di + 2, gridRow: 1 }}
                >
                  {format(d, 'EEE')}
                  <span className="mono">{format(d, 'MMM dd')}</span>
                </div>
              ))}

              {/* visual head slot: air above 09:00 */}
              <div className="gtime mono" style={{ gridColumn: 1, gridRow: 2 }} />
              {days.map((d, di) => (
                <div key={d.getTime()} className="gcell" style={{ gridColumn: di + 2, gridRow: 2 }} />
              ))}

              {slots.map((slot, i) => {
                const half = slot.getMinutes() === 0; // bottom edge is a half-hour line
                const row = 3 + i;
                return (
                  <Fragment key={slot.getTime()}>
                    <div
                      className={`gtime mono${half ? ' half' : ''}`}
                      style={{ gridColumn: 1, gridRow: `${row} / ${row + 1}` }}
                    >
                      {half && <span className="tick">{format(slot, 'HH:mm')}</span>}
                    </div>
                    {days.map((d, di) => {
                      const s = slotByKey.get(`${di}:${i}`);
                      return (
                        <div
                          key={d.getTime()}
                          className={`gcell${half ? ' half' : ''}${isToday(d) ? ' today-col' : ''}`}
                          style={{ gridColumn: di + 2, gridRow: `${row} / ${row + 1}` }}
                        >
                          {s && (
                            <div
                              className={`slot${s.mine ? ' mine' : ' other'}`}
                              style={{ height: s.len * ROW_H - 2 }}
                            >
                              {s.booking.title} · {s.booking.user_name}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* visual tail slot 19:00–19:30 */}
              <div
                className="gtime mono half"
                style={{ gridColumn: 1, gridRow: `${3 + slots.length} / ${4 + slots.length}` }}
              >
                <span className="tick">{endLabel}</span>
              </div>
              {days.map((d, di) => (
                <div
                  key={d.getTime()}
                  className="gcell half"
                  style={{ gridColumn: di + 2, gridRow: `${3 + slots.length} / ${4 + slots.length}` }}
                />
              ))}

              {showNowLine && (
                <div
                  className="now-line"
                  style={{ gridRow: `${3 + nowLineIdx} / ${4 + nowLineIdx}` }}
                />
              )}
            </div>

            <div className="legend">
              <span className="slot mine">Mine</span>
              <span className="slot other">Booked by others</span>
              <span className="legend-now">
                <span className="now-line-sample" />
                Now
              </span>
            </div>

            {bookings.length === 0 && (
              <div className="grid-state">
                <b>No bookings this week yet.</b>
                <span className="sub">Hover any open slot to reserve it.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
