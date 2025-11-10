import { Router } from 'express';
import { getTopics } from '../controllers/topicController.js';

const router = Router();

router.get('/topics', getTopics);

export default router;


