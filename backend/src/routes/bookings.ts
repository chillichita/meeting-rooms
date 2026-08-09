import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  createBooking,
  repeatBooking,
  cancelSeries,
  BookingError,
} from '../services/bookingService.js';
import { dueNotifications } from '../services/notificationService.js';

const createBookingSchema = z.object({
  roomId: z.number({ error: 'Room is required' }).int().positive(),
  title: z
    .string({ error: 'Title is required' })
    .trim()
    .min(1, 'Title is required')
    .max(100, 'Title must be at most 100 characters'),
  startAt: z
    .string({ error: 'Start time is required' })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, 'Invalid start time'),
  endAt: z
    .string({ error: 'End time is required' })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, 'Invalid end time'),
  // 1 or absent = single booking; 2..52 = weekly series
  repeatCount: z
    .number({ error: 'Repeat count is required' })
    .int()
    .min(1, 'Repeat count must be 1-52')
    .max(52, 'Repeat count must be 1-52')
    .optional(),
});

const repeatSchema = z.object({
  count: z
    .number({ error: 'Count is required' })
    .int()
    .min(1, 'Count must be 1-52')
    .max(52, 'Count must be 1-52'),
});

const selectBooking = db.prepare('SELECT id, user_id FROM bookings WHERE id = ?');
const deleteBooking = db.prepare('DELETE FROM bookings WHERE id = ? AND user_id = ?');
const listMine = db.prepare(`
  SELECT b.id, b.title, b.start_at, b.end_at, b.room_id, b.series_id,
         r.name AS room_name, r.floor
  FROM bookings b JOIN rooms r ON r.id = b.room_id
  WHERE b.user_id = ?
  ORDER BY b.start_at ASC
`);

const router = Router();
router.use(requireAuth); // both endpoints need a session

router.get('/', (req, res) => {
  res.json(listMine.all((req as unknown as AuthedRequest).user.id));
});

// In-app notifications: the frontend polls this; the window (N minutes before
// a booking's end, next slot in the room taken) is evaluated on live data.
router.get('/notifications', (req, res) => {
  res.json(dueNotifications((req as unknown as AuthedRequest).user.id, new Date().toISOString()));
});

router.post('/', (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res
      .status(400)
      .json({ field: issue.path[0] ?? 'body', message: issue.message });
  }

  // createBooking throws BookingError (mapped by the central error handler):
  // 400 for rule violations, 404 for an unknown room, 409 on a slot conflict.
  const booking = createBooking((req as unknown as AuthedRequest).user.id, parsed.data);
  res.status(201).json(booking);
});

router.delete('/series/:seriesId', (req, res) => {
  const seriesId = req.params.seriesId;
  if (!/^[0-9a-f-]{20,}$/i.test(seriesId)) {
    throw new BookingError('Invalid series id');
  }
  cancelSeries((req as unknown as AuthedRequest).user.id, seriesId);
  res.status(204).end();
});

// Turn a single booking into a weekly series, or extend an existing series.
router.post('/:id/repeat', (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId)) {
    throw new BookingError('Invalid booking id');
  }
  const parsed = repeatSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res
      .status(400)
      .json({ field: issue.path[0] ?? 'body', message: issue.message });
  }
  const created = repeatBooking((req as unknown as AuthedRequest).user.id, bookingId, parsed.data.count);
  res.status(201).json({ created });
});

router.delete('/:id', (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId)) {
    throw new BookingError('Invalid booking id');
  }

  const booking = selectBooking.get(bookingId) as { id: number; user_id: number } | undefined;
  if (!booking) {
    throw new BookingError('Booking not found', 404);
  }
  if (booking.user_id !== (req as unknown as AuthedRequest).user.id) {
    throw new BookingError('You can only cancel your own bookings', 403);
  }

  deleteBooking.run(bookingId, (req as unknown as AuthedRequest).user.id);
  res.status(204).end();
});

export default router;
