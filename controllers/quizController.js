import { findQuestionsByTopic, findQuestions } from '../models/questionModel.js';
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

export async function getSingleQuestion(req, res) {
  try {
    const topicId = String(req.query.topicId || '').trim();
    const ratingParam = Number(req.query.rating || 3);
    const excludeIdsParam = req.query.excludeIds || '';
    
    if (!topicId) {
      return res.status(400).json({ error: 'Missing topicId' });
    }
    
    const rating = isNaN(ratingParam) ? 3 : Math.max(1, Math.min(5, ratingParam));
    
    // Parse excludeIds
    const excludeIds = excludeIdsParam 
      ? excludeIdsParam.split(',').map(id => id.trim()).filter(Boolean)
      : [];
    
    // Determine difficulty based on rating
    let difficulties = [];
    if (rating <= 2) {
      difficulties = ['easy'];
    } else if (rating <= 4) {
      difficulties = ['medium'];
    } else {
      difficulties = ['hard'];
    }
    
    // Handle compound topics like si-ci
    const topicIds = topicId === 'si-ci' ? ['si', 'ci'] : [topicId];
    
    // Single optimized query - findQuestions now uses fast file-based data first
    const questions = await findQuestions({ topicIds, difficulties, excludeIds });
    
    if (questions.length === 0) {
      return res.status(404).json({ error: 'No questions available' });
    }
    
    // Pick a random question from the filtered list
    const randomIndex = Math.floor(Math.random() * questions.length);
    const question = questions[randomIndex];
    
    res.json({ question });
  } catch (err) {
    console.error('Error fetching single question:', err);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
}


