import { Router } from 'express';
import { db } from '../db.js';
import { weekRange } from '../services/scheduleRange.js';

const listRooms = db.prepare(`
  SELECT id, name, floor, capacity FROM rooms
  WHERE (@minCapacity IS NULL OR capacity >= @minCapacity)
  ORDER BY name
`);
const roomExists = db.prepare('SELECT 1 FROM rooms WHERE id = ?');
const weekBookings = db.prepare(`
  SELECT b.id, b.title, b.start_at, b.end_at, b.user_id, u.name AS user_name
  FROM bookings b
  JOIN users u ON u.id = b.user_id
  WHERE b.room_id = ? AND b.start_at >= ? AND b.start_at < ?
  ORDER BY b.start_at
`);

const router = Router();

router.get('/', (req, res) => {
  let minCapacity: number | null = null;
  if (req.query.capacity !== undefined) {
    minCapacity = Number(req.query.capacity);
    if (!Number.isInteger(minCapacity) || minCapacity < 1) {
      return res.status(400).json({ message: 'capacity must be a positive integer' });
    }
  }
  res.json(listRooms.all({ minCapacity }));
});

router.get('/:id/bookings', (req, res) => {
  const roomId = Number(req.params.id);
  if (!Number.isInteger(roomId)) {
    return res.status(400).json({ message: 'Invalid room id' });
  }

  const week = typeof req.query.week === 'string' ? req.query.week : undefined;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ message: 'week must be YYYY-MM-DD' });
  }
  const range = weekRange(week);
  if (!range) {
    return res.status(400).json({ message: 'Invalid week date' });
  }

  if (!roomExists.get(roomId)) {
    return res.status(404).json({ message: 'Room not found' });
  }

  res.json(weekBookings.all(roomId, range.start, range.end));
});

export default router;
