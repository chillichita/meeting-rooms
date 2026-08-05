import { fromZonedTime } from 'date-fns-tz';
import { OFFICE_TIME_ZONE } from './bookingValidation.js';

// Week = Monday 00:00 .. next Monday 00:00 in office wall time (Europe/Kyiv),
// returned as UTC instants. Any date inside the week maps to the same range.
export function weekRange(weekDate: string): { start: string; end: string } | null {
  const [y, m, d] = weekDate.split('-').map(Number);
  if (!y || !m || !d) return null;

  const wall = new Date(y, m - 1, d);
  // Reject rolled-over dates like 2026-02-30 (new Date would normalize them).
  if (wall.getFullYear() !== y || wall.getMonth() !== m - 1 || wall.getDate() !== d) {
    return null;
  }

  const day = wall.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const start = fromZonedTime(new Date(y, m - 1, d + mondayOffset, 0, 0), OFFICE_TIME_ZONE).toISOString();
  const end = fromZonedTime(new Date(y, m - 1, d + mondayOffset + 7, 0, 0), OFFICE_TIME_ZONE).toISOString();
  return { start, end };
}
