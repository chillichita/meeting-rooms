import express from 'express';
import './db.js'; // create tables on start

const app = express();
const PORT = Number(process.env.PORT ?? 8080);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
