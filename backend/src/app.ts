import express from 'express';
import cookieParser from 'cookie-parser';
import './db.js'; // create tables on start
import authRouter from './routes/auth.js';
import roomsRouter from './routes/rooms.js';

export const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
