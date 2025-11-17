import { Router } from 'express';
import {
  getRandomFlashcard,
  getFollowUpFlashcard,
  getRandomFlashcardJson,
  rateFlashcard,
  submitRating,
  getFollowUpQuestionJson,
  submitAnswer,
  getNextQuestion,
  getDueReviews,
  getConcepts,
  startSession,
  resetShownFlashcards,
  checkNewBatch,
  createNewBatch
} from '../controllers/flashcardController.js';
import { optionalAuth, authenticateUser } from '../middleware/auth.js';

const router = Router();

// Legacy MongoDB-based routes (kept for backward compatibility)
router.get('/random', getRandomFlashcard);
router.get('/follow-up', getFollowUpFlashcard);

// New JSON-based routes for adaptive flashcard system
// Use optionalAuth to support both authenticated and non-authenticated users
router.get('/random-json', optionalAuth, getRandomFlashcardJson);
router.post('/rate', optionalAuth, rateFlashcard); // Deprecated, kept for backward compatibility

// Routes requiring JWT authentication
router.get('/start-session', authenticateUser, startSession);
router.post('/submit-rating', authenticateUser, submitRating);
router.post('/question/submit', authenticateUser, submitAnswer);
router.get('/next-question', authenticateUser, getNextQuestion);
router.get('/due-reviews', authenticateUser, getDueReviews);
router.post('/reset-shown', authenticateUser, resetShownFlashcards);
router.get('/check-new-batch', authenticateUser, checkNewBatch);
router.post('/create-new-batch', authenticateUser, createNewBatch);

// Question routes (optional auth for flexibility)
router.get('/question/followup/:topic/:difficulty', optionalAuth, getFollowUpQuestionJson);

// Concepts route for conceptual learning flow (from CSV)
router.get('/concepts', getConcepts);

export default router;
