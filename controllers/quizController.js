import { findQuestionsByTopic, findQuestions } from '../models/questionModel.js';
import { buildQuiz } from '../services/quizService.js';
import { loadQuestions } from '../services/flashcardJsonService.js';
import { getEligibleQuestionIdsForUser } from '../services/userService.js';

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
    const subTopic = String(req.query.subTopic || '').trim();
    
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
    let questions = await findQuestions({ topicIds, difficulties, excludeIds });
    
    // Filter by subTopic if provided
    if (subTopic && questions.length > 0) {
      const subTopicFiltered = questions.filter(q => q.subTopic === subTopic);
      if (subTopicFiltered.length > 0) {
        questions = subTopicFiltered;
      }
      // If no questions match the subTopic, fall back to all questions for the topic
    }
    
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

/**
 * GET /quiz/next
 * Get the next eligible question for the authenticated user based on spaced repetition
 * Requires JWT authentication
 */
export function getNextQuestion(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Load all questions from questions.json
    const data = loadQuestions();
    
    if (!data.questions || data.questions.length === 0) {
      return res.status(404).json({ error: 'No questions available' });
    }
    
    // Get all question IDs
    const allQuestionIds = data.questions.map(q => q.id);
    
    // Filter by eligibility based on user's review schedule
    const eligibleIds = getEligibleQuestionIdsForUser(userId, allQuestionIds);
    
    if (eligibleIds.length === 0) {
      // No questions are due for review
      return res.status(204).send(); // 204 No Content
    }
    
    // Get eligible questions
    const eligibleQuestions = data.questions.filter(q => eligibleIds.includes(q.id));
    
    // Pick a random eligible question
    const randomIndex = Math.floor(Math.random() * eligibleQuestions.length);
    const question = eligibleQuestions[randomIndex];
    
    // Format options as {A: ..., B: ..., C: ..., D: ...}
    const options = {};
    const optionLabels = ['A', 'B', 'C', 'D'];
    question.options.forEach((opt, idx) => {
      if (idx < optionLabels.length) {
        options[optionLabels[idx]] = opt;
      }
    });
    
    // Get the correct answer key (A, B, C, or D)
    const key = optionLabels[question.answerIndex] || 'A';
    
    // Get topic information
    const topic = data.topics.find(t => t.id === question.topicId);
    
    return res.json({
      questionId: question.id,
      question: question.question,
      options,
      key,
      explanation: question.explanation,
      difficulty: question.difficulty,
      topic: topic ? topic.name : question.topicId,
      topicId: question.topicId,
      subTopic: question.subTopic || topic?.name || question.topicId
    });
  } catch (err) {
    console.error('Error fetching next question:', err);
    return res.status(500).json({ error: 'Failed to fetch next question' });
  }
}



