import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import {
  getNextFlashcardForUser,
  rateFlashcardForUser,
  getNextQuestionForUser,
  submitSpacedAnswer
} from '../controllers/spacedRepetitionController.js';

const router = Router();

router.get('/flashcard/next', authenticateUser, getNextFlashcardForUser);
router.post('/flashcard/rate', authenticateUser, rateFlashcardForUser);
router.post('/question/next', authenticateUser, getNextQuestionForUser);
router.post('/question/submit', authenticateUser, submitSpacedAnswer);

export default router;
