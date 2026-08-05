import { describe, expect, it } from 'vitest';
import { toZonedTime } from 'date-fns-tz';
import { weekRange } from '../../services/scheduleRange.js';
import { OFFICE_TIME_ZONE } from '../../services/bookingValidation.js';

const kyivWall = (iso: string) => {
  const d = toZonedTime(new Date(iso), OFFICE_TIME_ZONE);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.getHours()}:00`;
};

describe('weekRange', () => {
  it('maps a Thursday to the surrounding Monday', () => {
    const r = weekRange('2026-08-06');
    expect(r).not.toBeNull();
    expect(kyivWall(r!.start)).toBe('2026-08-03 0:00'); // Monday 00:00 Kyiv
    expect(kyivWall(r!.end)).toBe('2026-08-10 0:00'); // next Monday 00:00 Kyiv
  });

  it('maps a Monday to itself', () => {
    const r = weekRange('2026-08-03');
    expect(kyivWall(r!.start)).toBe('2026-08-03 0:00');
  });

  it('maps a Sunday to the previous Monday', () => {
    const r = weekRange('2026-08-09');
    expect(kyivWall(r!.start)).toBe('2026-08-03 0:00');
  });

  it('spans exactly 7 days', () => {
    const r = weekRange('2026-08-06')!;
    expect(new Date(r.end).getTime() - new Date(r.start).getTime()).toBe(7 * 24 * 3_600_000);
  });

  it('rejects an invalid date (2026-02-30 rolls over)', () => {
    expect(weekRange('2026-02-30')).toBeNull();
  });

  it('rejects a malformed date', () => {
    expect(weekRange('2026-13-01')).toBeNull();
    expect(weekRange('not-a-date')).toBeNull();
  });
});
