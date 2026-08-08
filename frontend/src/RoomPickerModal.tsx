import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Room } from './api';

/** Global room picker — the nav "Schedule" entry: pick a room → its schedule. */
export default function RoomPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    api<Room[]>('/api/rooms')
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
          {error ? (
            <div className="picker-state">
              <p>Couldn't load the rooms.</p>
              <button type="button" className="btn btn-ghost-d" onClick={load}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="picker-state">Loading…</div>
          ) : rooms.length === 0 ? (
            <div className="picker-state">No rooms yet.</div>
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
