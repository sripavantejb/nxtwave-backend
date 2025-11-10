import { Router } from 'express';
import { getQuiz } from '../controllers/quizController.js';

const router = Router();

router.get('/quiz', getQuiz);

export default router;


