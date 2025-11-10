import { findQuestionsByTopic } from '../models/questionModel.js';
import { buildQuiz } from '../services/quizService.js';

export async function getQuiz(req, res) {
  try {
    const topicId = String(req.query.topicId || '').trim();
    const ratingParam = Number(req.query.rating || 3);
    if (!topicId) {
      return res.status(400).json({ error: 'Missing topicId' });
    }
    const rating = isNaN(ratingParam) ? 3 : Math.max(1, Math.min(5, ratingParam));

    const allForTopic = await findQuestionsByTopic(topicId);
    if (allForTopic.length === 0) {
      return res.status(404).json({ error: 'No questions for topicId' });
    }

    const questions = buildQuiz(allForTopic, rating);
    res.json({ topicId, rating, questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build quiz' });
  }
}


