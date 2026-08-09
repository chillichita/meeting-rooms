import { addDays, format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export const OFFICE_TZ = 'Europe/Kyiv';

// Week = Monday .. Sunday in the BROWSER's timezone. The API accepts any date
// inside a week and resolves the Kyiv week itself (backend scheduleRange.ts).
export function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day === 0 ? -6 : 1 - day));
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Office working hours (09:00–19:00 Kyiv) as local instants, computed once per
// week from Monday. Slot boundaries are 30-min steps in UTC time.
// A DST transition inside the week shifts that day by an hour;
// per-day boundaries would need variable row counts and break the 7×N grid.
export function officeSlots(monday: Date): Date[] {
  const start = fromZonedTime(
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 9, 0),
    OFFICE_TZ,
  );
  const end = fromZonedTime(
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 19, 0),
    OFFICE_TZ,
  );
  const out: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += 30 * 60_000) out.push(new Date(t));
  return out;
}

/** End of the office day (19:00 Kyiv) as a local instant — the grid's last time label. */
export function officeEnd(monday: Date): Date {
  return fromZonedTime(
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 19, 0),
    OFFICE_TZ,
  );
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function fmtWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  return `${format(monday, 'MMM dd')} – ${format(sunday, 'MMM dd')}, ${format(sunday, 'yyyy')}`;
}
