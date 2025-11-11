import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './config/db.js';
import topicRoutes from './routes/topicRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import flashcardRoutes from './routes/flashcardRoutes.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration - allow frontend domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://nxtwave-frontend-blond.vercel.app'
    ];
    
    // Check if origin is in allowed list or is a vercel.app subdomain
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      // Allow all origins in production for now (can be restricted later)
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));
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


