import { toZonedTime } from 'date-fns-tz';

export const OFFICE_TIME_ZONE = 'Europe/Kyiv';
export const WORK_START_MINUTES = 9 * 60; // 09:00 Kyiv
export const WORK_END_MINUTES = 19 * 60; // 19:00 Kyiv
export const SLOT_MINUTES = 30;
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 4 * 60;

// Each rule is a separate pure function returning a reason, or null when ok.
// Times are ISO-8601 UTC strings (as stored in bookings.start_at / end_at).

function isInvalid(dateIso: string): boolean {
  return Number.isNaN(new Date(dateIso).getTime());
}

export function validateAlignment(startIso: string, endIso: string): string | null {
  // UTC minutes == office minutes: DST offsets are whole hours, so 30-min
  // alignment is invariant across time zones.
  const startMin = new Date(startIso).getUTCMinutes();
  const endMin = new Date(endIso).getUTCMinutes();
  if (startMin % SLOT_MINUTES !== 0 || endMin % SLOT_MINUTES !== 0) {
    return 'Start and end must be on 30-minute boundaries';
  }
  return null;
}

export function validateDuration(startIso: string, endIso: string): string | null {
  const minutes = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000;
  if (minutes < MIN_DURATION_MINUTES) {
    return minutes <= 0 ? 'End must be after start' : 'Booking must be at least 30 minutes';
  }
  if (minutes > MAX_DURATION_MINUTES) {
    return 'Booking must be at most 4 hours';
  }
  return null;
}

export function validateWorkingHours(startIso: string, endIso: string): string | null {
  const start = toZonedTime(new Date(startIso), OFFICE_TIME_ZONE);
  const end = toZonedTime(new Date(endIso), OFFICE_TIME_ZONE);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  if (startMin < WORK_START_MINUTES) {
    return 'Booking starts before office hours (09:00-19:00, Europe/Kyiv)';
  }
  if (endMin > WORK_END_MINUTES) {
    return 'Booking ends after office hours (09:00-19:00, Europe/Kyiv)';
  }
  return null;
}

export function validateFuture(startIso: string): string | null {
  if (new Date(startIso).getTime() <= Date.now()) {
    return 'Booking must be in the future';
  }
  return null;
}

export function validateBookingTimes(startIso: string, endIso: string): string | null {
  if (isInvalid(startIso) || isInvalid(endIso)) {
    return 'Invalid date/time';
  }
  return (
    validateFuture(startIso) ??
    validateAlignment(startIso, endIso) ??
    validateDuration(startIso, endIso) ??
    validateWorkingHours(startIso, endIso)
  );
}
