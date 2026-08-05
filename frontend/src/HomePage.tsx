import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toZonedTime } from 'date-fns-tz';
import { api, type Room } from './api';

const OFFICE_TZ = 'Europe/Kyiv';
const OFFICE_OPEN = 9;
const OFFICE_CLOSE = 19;
const CARD_WIDTH = 400;
const CARD_GAP = 12;

export default function HomePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const gridRef = useRef<HTMLDivElement>(null);

  // one card + gap per click
  const scrollByCard = (dir: number) =>
    gridRef.current?.scrollBy({ left: dir * (CARD_WIDTH + CARD_GAP), behavior: 'smooth' });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = () => {
    setError(false);
    api<Room[]>('/api/rooms')
      .then((list) => {
        setRooms(list);
        setSelectedId((id) => id ?? list[0]?.id ?? null);
      })
      .catch(() => setError(true));
  };

  useEffect(load, []);

  const kyiv = toZonedTime(now, OFFICE_TZ);
  const hour = kyiv.getHours() + kyiv.getMinutes() / 60;
  const open = hour >= OFFICE_OPEN && hour < OFFICE_CLOSE; // H2

  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  return (
    <div className={`space-canvas${open ? '' : ' closed'}`}>
      {/* H4 — meridian arc draws itself as you scroll; static without animation-timeline */}
      <svg className="hero-arc" viewBox="0 0 900 500" fill="none" aria-hidden="true">
        <path d="M450 500 Q 150 380 120 40" stroke="rgba(255,255,255,0.14)" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <div className="space-inner">
        <div className="space-head">
          <span className="label">Rooms</span>
          <span className="count mono">
            {error
              ? ''
              : `${String(rooms.length).padStart(2, '0')} / ${String(rooms.length).padStart(2, '0')} · ${
                  open ? 'free now' : 'office closed'
                }`}
          </span>
        </div>

        {error ? (
          <div className="space-error">
            <p>Couldn't load the rooms.</p>
            <p className="sub">The server may be temporarily unavailable.</p>
            <button type="button" className="btn btn-ghost-d" onClick={load}>
              Try again
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="space-error">
            <p>No rooms yet.</p>
          </div>
        ) : (
          <div className="room-grid-wrap">
            <button
              type="button"
              className="carousel-btn prev"
              aria-label="Previous rooms"
              onClick={() => scrollByCard(-1)}
            >
              ‹
            </button>
            <div className="room-grid" ref={gridRef}>
              {rooms.map((room, i) => (
                <button
                  key={room.id}
                  type="button"
                  className={`room-card${room.id === selectedId ? ' sel' : ''}`}
                  onClick={() => setSelectedId(room.id)}
                >
                  <span className="num mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ico" />
                  <b>{room.name}</b>
                  <span>
                    {room.capacity} people · F{room.floor}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="carousel-btn next"
              aria-label="Next rooms"
              onClick={() => scrollByCard(1)}
            >
              ›
            </button>
          </div>
        )}

        {!error && selected && (
          <div className="detail">
            <div className="idx mono">
              {rooms.map((room, i) => (
                <span key={room.id} className={room.id === selectedId ? 'sel' : ''}>
                  {String(i + 1).padStart(2, '0')} {room.name}
                </span>
              ))}
            </div>
            <div className="desc">
              <h5>{selected.name}</h5>
              <p>
                Floor {selected.floor} · up to {selected.capacity} people.
              </p>
              <div className="acts">
                <Link to={`/rooms/${selected.id}`} className="btn btn-primary">
                  View schedule →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {!open && <div className="office-closed mono">Office opens 09:00 Kyiv</div>}
    </div>
  );
}
