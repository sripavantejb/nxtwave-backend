import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './config/db.js';
import topicRoutes from './routes/topicRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import flashcardRoutes from './routes/flashcardRoutes.js';

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
app.use('/api/flashcards', flashcardRoutes);

// Not found handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

async function start() {
  // Start the HTTP server first
  app.listen(PORT, () => {
    console.log(`SmartQuiz backend listening on http://localhost:${PORT}`);
  });

  // Try to connect to database (non-blocking)
  try {
    await connectToDatabase();
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Warning: Failed to connect to database:', err.message);
    console.error('Server is running but database operations will fail');
    // Don't exit - allow server to run so we can debug
  }
}

start();


