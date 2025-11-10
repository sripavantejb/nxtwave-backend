import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './config/db.js';
import topicRoutes from './routes/topicRoutes.js';
import quizRoutes from './routes/quizRoutes.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes (MVC)
app.use('/api', topicRoutes);
app.use('/api', quizRoutes);

// Not found handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

async function start() {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      console.log(`SmartQuiz backend listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();


