import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import topicRoutes from './routes/topicRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import flashcardRoutes from './routes/flashcardRoutes.js';
import authRoutes from './routes/authRoutes.js';
import spacedRoutes from './routes/spacedRoutes.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration - allow frontend domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  preflightContinue: false,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes (MVC)
app.use('/api/auth', authRoutes);
app.use('/api', topicRoutes);
app.use('/api', quizRoutes);
app.use('/api/flashcards', flashcardRoutes);
app.use('/api', spacedRoutes);

// Not found handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

function start() {
  // Start the HTTP server
  app.listen(PORT, () => {
    console.log(`SmartQuiz backend listening on http://localhost:${PORT}`);
    console.log('Using CSV file as data source: topics_until_percentages.csv');
  });
}

start();


