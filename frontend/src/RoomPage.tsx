import { Fragment, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDays, format, isToday } from 'date-fns';
import { getTimezoneOffset } from 'date-fns-tz';
import { api, type Booking, type Room } from './api';
import { fmtWeekLabel, mondayOf, officeEnd, officeSlots, toYmd, weekDays, OFFICE_TZ } from './grid';

// Compare by offset, not by IANA name: Windows browsers may report "Europe/Kiev"
// for the same zone, and the label only matters when office time differs NOW.
// date-fns-tz getTimezoneOffset returns ms; Date#getTimezoneOffset returns minutes.
const tzDiffers =
  -new Date().getTimezoneOffset() * 60_000 !== getTimezoneOffset(OFFICE_TZ, new Date());

export default function RoomPage() {
  const { id } = useParams();
  const roomId = Number(id);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [room, setRoom] = useState<Room | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
          {tzDiffers && <span className="tz-label">Opening hours are from 09:00 to 19:00 ({OFFICE_TZ})</span>}
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
            <div className="gtable">
              <div className="ghead" />
              {days.map((d) => (
                <div className={`ghead${isToday(d) ? ' today' : ''}`} key={d.getTime()}>
                  {format(d, 'EEE')}
                  <span className="mono">{format(d, 'MMM dd')}</span>
                </div>
              ))}
              {/* visual head slot: air above 09:00 so the first label doesn't touch the header */}
              <Fragment key="head-slot">
                <div className="gtime mono" />
                {days.map((d) => (
                  <div className="gcell" key={d.getTime()} />
                ))}
              </Fragment>
              {slots.map((slot) => {
                const half = slot.getMinutes() === 0; // its bottom edge is a half-hour line
                return (
                  <Fragment key={slot.getTime()}>
                    <div className={`gtime mono${half ? ' half' : ''}`}>
                      {half && <span className="tick">{format(slot, 'HH:mm')}</span>}
                    </div>
                    {days.map((d) => (
                      <div className={`gcell${half ? ' half' : ''}`} key={d.getTime()} />
                    ))}
                  </Fragment>
                );
              })}
              {/* visual tail slot 19:00–19:30: label hangs like every other hour */}
              <Fragment key="end-slot">
                <div className="gtime mono half">
                  <span className="tick">{endLabel}</span>
                </div>
                {days.map((d) => (
                  <div className="gcell half" key={d.getTime()} />
                ))}
              </Fragment>
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
