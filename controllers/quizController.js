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
    const flashcardQuestionId = String(req.query.flashcardQuestionId || '').trim();
    
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
    
    // Build filter object with mandatory subtopic filtering when provided
    const filterParams = { topicIds, difficulties, excludeIds };
    if (subTopic && subTopic.trim() !== '') {
      // Add subtopic as mandatory filter - no fallback to other subtopics
      filterParams.subTopics = [subTopic.trim()];
    }
    
    // Single optimized query with strict subtopic filtering (no fallbacks)
    let questions = await findQuestions(filterParams);
    
    // If flashcardQuestionId is provided, filter questions to match that specific flashcard
    // This ensures questions are matched to the flashcard's concept, not just subtopic
    if (flashcardQuestionId && questions.length > 0) {
      // Load questions to find the flashcard text
      const data = loadQuestions();
      const flashcardQuestion = data.questions.find(q => q.id === flashcardQuestionId);
      
      if (flashcardQuestion && flashcardQuestion.flashcard) {
        const flashcardText = flashcardQuestion.flashcard.trim();
        // Filter questions to only those that have the same flashcard text
        // This matches questions to the specific flashcard concept
        questions = questions.filter(q => 
          q.flashcard && q.flashcard.trim() === flashcardText
        );
      }
    }
    
    // If no questions found for requested difficulty in that subtopic/flashcard, return error
    if (questions.length === 0) {
      return res.status(404).json({ error: 'Requested Question Not Found' });
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
    
    // Load all questions from topics_until_percentages.csv
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



