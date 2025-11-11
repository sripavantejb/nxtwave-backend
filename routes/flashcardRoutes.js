import { Router } from 'express';
import {
  getRandomFlashcard,
  getFollowUpFlashcard
} from '../controllers/flashcardController.js';

const router = Router();

router.get('/random', getRandomFlashcard);
router.get('/follow-up', getFollowUpFlashcard);

export default router;


