import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { api, ApiError, type Room } from './api';

const OFFICE_TZ = 'Europe/Kyiv';

type Props = {
  room: Room;
  /** Slot start as a local instant (the clicked cell). */
  initialStart: Date;
  onClose: () => void;
  onCreated: () => void;
};

const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd');
const toTimeInput = (d: Date) => format(d, 'HH:mm');

/** Combine date+time inputs (browser wall time) into a local instant. */
const buildDate = (dateStr: string, timeStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

// Mirrors backend bookingValidation.ts, but in the browser's wall time — the
// office-hours rule is evaluated in Europe/Kyiv, everything else on UTC
// instants, so a user in another zone sees the same accept/reject as the API.
function validate(start: Date, end: Date, title: string): { title?: string; range?: string } {
  const errors: { title?: string; range?: string } = {};
  const t = title.trim();
  if (!t) {
    errors.title = 'Enter a title for this booking.';
  } else if (t.length > 100) {
    errors.title = 'Title must be 100 characters or fewer.';
  }

  const ms = end.getTime() - start.getTime();
  if (ms < 30 * 60_000) {
    errors.range = 'Minimum booking length is 30 minutes.';
  } else if (ms > 4 * 60 * 60_000) {
    errors.range = 'Maximum booking length is 4 hours.';
  }
  if (start.getTime() <= Date.now()) {
    errors.range = errors.range ?? 'Choose a time in the future.';
  }
  const sKyiv = toZonedTime(start, OFFICE_TZ);
  const eKyiv = toZonedTime(end, OFFICE_TZ);
  const sMin = sKyiv.getHours() * 60 + sKyiv.getMinutes();
  const eMin = eKyiv.getHours() * 60 + eKyiv.getMinutes();
  if (sMin < 9 * 60 || eMin > 19 * 60) {
    errors.range = 'This room is only bookable between 09:00–19:00 office time.';
  }
  return errors;
}

export default function BookingModal({ room, initialStart, onClose, onCreated }: Props) {
  const [dateStr, setDateStr] = useState(toDateInput(initialStart));
  const [startStr, setStartStr] = useState(toTimeInput(initialStart));
  const [endStr, setEndStr] = useState(toTimeInput(new Date(initialStart.getTime() + 30 * 60_000)));
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<{ title?: string; range?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const start = buildDate(dateStr, startStr);
  const end = buildDate(dateStr, endStr);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(start, end, title);
    setErrors(v);
    setServerError(null);
    if (v.title || v.range) return;

    setSubmitting(true);
    try {
      await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          roomId: room.id,
          title: title.trim(),
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        }),
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError('This slot was just booked by someone else. Pick another time.');
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Can't reach the server. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Book {room.name}</b>
          <button type="button" className="modal-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="modal-body">
            <div className="lock">
              <span>Room</span>
              <span className="mono" style={{ marginLeft: 'auto' }}>
                {room.name} · F{room.floor} · {room.capacity} people
              </span>
            </div>

            <div className="two">
              <div className="field">
                <label className="lbl" htmlFor="bk-date">
                  Date
                </label>
                <input
                  id="bk-date"
                  type="date"
                  className="input"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bk-start">
                  Start
                </label>
                <input
                  id="bk-start"
                  type="time"
                  step={1800}
                  className="input"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="bk-end">
                  End
                </label>
                <input
                  id="bk-end"
                  type="time"
                  step={1800}
                  className="input"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                />
              </div>
            </div>
            {errors.range && <div className="err">{errors.range}</div>}

            <div className="field">
              <label className="lbl" htmlFor="bk-title">
                Title
              </label>
              <input
                id="bk-title"
                className="input"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            {errors.title && <div className="err">{errors.title}</div>}

            {serverError && <div className="form-error">{serverError}</div>}
            <div className="modal-hint">30-min steps · 30m–4h · 09:00–19:00 office time.</div>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Booking…' : 'Book'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
