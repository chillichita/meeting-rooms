import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Room } from './api';

/** Global room picker — the nav "Schedule" entry: pick a room → its schedule. */
const CAPACITY_CHIPS = [4, 6, 8, 10, 12] as const; // room capacities from the seed

export default function RoomPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  // Minimum capacity filter (null = any); backend: GET /api/rooms?capacity=N
  const [minCap, setMinCap] = useState<number | null>(null);

  const load = (cap: number | null = minCap) => {
    setLoading(true);
    setError(false);
    api<Room[]>(`/api/rooms${cap ? `?capacity=${cap}` : ''}`)
      .then((list) => setRooms(list))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = (id: number) => {
    onClose();
    navigate(`/rooms/${id}`);
  };

  return (
    <div
      className="picker-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="picker" role="dialog" aria-label="Pick a room">
        <div className="picker-head">
          <b>Pick a room</b>
          <button type="button" className="picker-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="picker-body">
          <div className="picker-chips" role="group" aria-label="Filter by minimum capacity">
            <button
              type="button"
              className={`cap-chip${minCap === null ? ' on' : ''}`}
              onClick={() => {
                setMinCap(null);
                load(null);
              }}
            >
              Any
            </button>
            {CAPACITY_CHIPS.map((cap) => (
              <button
                key={cap}
                type="button"
                className={`cap-chip${minCap === cap ? ' on' : ''}`}
                onClick={() => {
                  setMinCap(cap);
                  load(cap);
                }}
              >
                {cap}+
              </button>
            ))}
          </div>
          {error ? (
            <div className="picker-state">
              <p>Couldn't load the rooms.</p>
              <button type="button" className="btn btn-ghost-d" onClick={() => load()}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="picker-state">Loading…</div>
          ) : rooms.length === 0 ? (
            <div className="picker-state">
              <p>{minCap ? `No rooms for ${minCap}+ people.` : 'No rooms yet.'}</p>
              {minCap && (
                <button type="button" className="btn btn-ghost-d" onClick={() => { setMinCap(null); load(null); }}>
                  Show all rooms
                </button>
              )}
            </div>
          ) : (
            <div className="picker-list">
              {rooms.map((room, i) => (
                <button key={room.id} type="button" className="picker-row" onClick={() => pick(room.id)}>
                  <span className="picker-idx mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="picker-name">{room.name}</span>
                  <span className="picker-meta">
                    {room.capacity} people · F{room.floor}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
