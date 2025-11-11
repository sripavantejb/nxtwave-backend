import { Router } from 'express';
import { getQuiz, getSingleQuestion } from '../controllers/quizController.js';

const router = Router();

router.get('/quiz', getQuiz);
router.get('/question', getSingleQuestion);

export default router;


