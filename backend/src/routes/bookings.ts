import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { createBooking, BookingError } from '../services/bookingService.js';

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
});

const selectBooking = db.prepare('SELECT id, user_id FROM bookings WHERE id = ?');
const deleteBooking = db.prepare('DELETE FROM bookings WHERE id = ? AND user_id = ?');
const listMine = db.prepare(`
  SELECT b.id, b.title, b.start_at, b.end_at, b.room_id,
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
