import { Router } from 'express';
import { getQuiz, getSingleQuestion, getNextQuestion } from '../controllers/quizController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

router.get('/quiz', getQuiz);
router.get('/question', getSingleQuestion);
router.get('/quiz/next', authenticateUser, getNextQuestion);

export default router;


