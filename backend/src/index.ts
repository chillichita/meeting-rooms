import express from 'express';
import cookieParser from 'cookie-parser';
import './db.js'; // create tables on start
import authRouter from './routes/auth.js';

const app = express();
const PORT = Number(process.env.PORT ?? 8080);

app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
