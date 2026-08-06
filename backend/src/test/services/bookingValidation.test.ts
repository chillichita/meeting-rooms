import { describe, expect, it } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import {
  validateBookingTimes,
  validateAlignment,
  validateDuration,
  validateWorkingHours,
  validateFuture,
} from '../../services/bookingValidation.js';

// Kyiv wall-clock slots tomorrow (same tzdb as the code under test), always in
// the future — validateFuture must not reject the fixtures.
const TOMORROW = new Date();
TOMORROW.setDate(TOMORROW.getDate() + 1);
const slot = (h: number, m = 0) =>
  fromZonedTime(
    new Date(TOMORROW.getFullYear(), TOMORROW.getMonth(), TOMORROW.getDate(), h, m),
    'Europe/Kyiv',
  ).toISOString();

describe('validateAlignment', () => {
  it('accepts 30-minute boundaries', () => {
    expect(validateAlignment(slot(10), slot(10, 30))).toBeNull();
  });

  it('rejects minutes not on a 30-minute boundary', () => {
    expect(validateAlignment(slot(10, 15), slot(10, 45))).toMatch(/30-minute/);
  });
});

describe('validateDuration', () => {
  it('accepts 30 minutes', () => {
    expect(validateDuration(slot(10), slot(10, 30))).toBeNull();
  });

  it('accepts exactly 4 hours', () => {
    expect(validateDuration(slot(9), slot(13))).toBeNull();
  });

  it('rejects more than 4 hours', () => {
    expect(validateDuration(slot(9), slot(13, 30))).toMatch(/at most 4 hours/);
  });

  it('rejects end equal to start', () => {
    expect(validateDuration(slot(10), slot(10))).toMatch(/after start/);
  });

  it('rejects end before start', () => {
    expect(validateDuration(slot(10, 30), slot(10))).toMatch(/after start/);
  });
});

describe('validateWorkingHours', () => {
  it('accepts a slot fully inside 09:00-19:00 Kyiv', () => {
    expect(validateWorkingHours(slot(10), slot(12))).toBeNull();
  });

  it('accepts a slot ending exactly at 19:00 Kyiv', () => {
    expect(validateWorkingHours(slot(18, 30), slot(19))).toBeNull();
  });

  it('rejects a slot starting before 09:00 Kyiv', () => {
    expect(validateWorkingHours(slot(8, 30), slot(9))).toMatch(/before office hours/);
  });

  it('rejects a slot ending after 19:00 Kyiv', () => {
    expect(validateWorkingHours(slot(19), slot(19, 30))).toMatch(/after office hours/);
  });
});

describe('validateFuture', () => {
  it('accepts a start in the future', () => {
    expect(validateFuture(new Date(Date.now() + 3_600_000).toISOString())).toBeNull();
  });

  it('rejects a start in the past', () => {
    expect(validateFuture(new Date(Date.now() - 3_600_000).toISOString())).toMatch(/future/);
  });
});

describe('validateBookingTimes (composition)', () => {
  it('accepts a fully valid slot', () => {
    expect(validateBookingTimes(slot(10), slot(12))).toBeNull();
  });

  it('rejects invalid date strings', () => {
    expect(validateBookingTimes('garbage', slot(11))).toMatch(/Invalid/);
  });

  it('reports the future rule before other rules', () => {
    const pastStart = new Date(Date.now() - 60_000).toISOString();
    expect(validateBookingTimes(pastStart, slot(11))).toMatch(/future/);
  });

  it('reports alignment before working hours', () => {
    expect(validateBookingTimes(slot(10, 15), slot(10, 45))).toMatch(/30-minute/);
  });
});
