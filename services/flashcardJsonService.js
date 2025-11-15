import { loadQuestionsFromCSV } from './csvQuestionService.js';
import { getEligibleQuestionIdsForUser, getUserReviewData } from './userService.js';
import { getAllDueQuestions } from './spacedRepService.js';

/**
 * Load all questions from CSV
 * @returns {Object} Object containing topics and questions arrays
 */
export function loadQuestions() {
  return loadQuestionsFromCSV();
}

/**
 * Get a random flashcard from CSV
 * Prioritizes due reviews for authenticated users, then new flashcards
 * @param {string} userId - Optional user ID for per-user tracking
 * @returns {Object|null} Random question with flashcard data
 */
export function getRandomFlashcard(userId = null) {
  const data = loadQuestions();
  const questionsWithFlashcards = data.questions.filter(
    q => q.flashcard && q.flashcard.trim() !== ''
  );
  
  if (questionsWithFlashcards.length === 0) {
    return null;
  }
  
  // If user is authenticated, check for due reviews first (prioritize)
  if (userId) {
    const dueQuestionIds = getAllDueQuestions(userId);
    const dueFlashcards = questionsWithFlashcards.filter(q => dueQuestionIds.includes(q.id));
    
    // If due flashcards exist, return random one
    if (dueFlashcards.length > 0) {
      const randomIndex = Math.floor(Math.random() * dueFlashcards.length);
      const question = dueFlashcards[randomIndex];
      const topic = data.topics.find(t => t.id === question.topicId);
      
      return {
        questionId: question.id,
        flashcard: question.flashcard,
        flashcardAnswer: question.flashcardAnswer,
        topic: topic ? topic.name : question.topicId,
        subTopic: question.subTopic || topic?.name || question.topicId,
        topicId: question.topicId
      };
    }
    
    // No due flashcards, prioritize new flashcards (not in reviewData)
    const reviewData = getUserReviewData(userId);
    const newFlashcards = questionsWithFlashcards.filter(q => !reviewData[q.id]);
    
    // Use new flashcards if available, otherwise use all
    const eligibleQuestions = newFlashcards.length > 0 ? newFlashcards : questionsWithFlashcards;
    
    const randomIndex = Math.floor(Math.random() * eligibleQuestions.length);
    const question = eligibleQuestions[randomIndex];
    const topic = data.topics.find(t => t.id === question.topicId);
    
    return {
      questionId: question.id,
      flashcard: question.flashcard,
      flashcardAnswer: question.flashcardAnswer,
      topic: topic ? topic.name : question.topicId,
      subTopic: question.subTopic || topic?.name || question.topicId,
      topicId: question.topicId
    };
  }
  
  // Non-authenticated user - return random flashcard
  const randomIndex = Math.floor(Math.random() * questionsWithFlashcards.length);
  const question = questionsWithFlashcards[randomIndex];
  const topic = data.topics.find(t => t.id === question.topicId);
  
  return {
    questionId: question.id,
    flashcard: question.flashcard,
    flashcardAnswer: question.flashcardAnswer,
    topic: topic ? topic.name : question.topicId,
    subTopic: question.subTopic || topic?.name || question.topicId,
    topicId: question.topicId
  };
}

/**
 * Map rating (1-5) to difficulty level
 * @param {number} rating - Rating from 1 to 5
 * @returns {string} "Easy", "Medium", or "Hard"
 */
export function mapRatingToDifficulty(rating) {
  if (rating <= 2) return "Easy";
  if (rating <= 4) return "Medium";
  return "Hard";
}

/**
 * Get a follow-up question based on topic, difficulty, and subtopic
 * Respects per-user spaced repetition scheduling
 * @param {string} topicId - The topic ID
 * @param {string} difficulty - "Easy", "Medium", or "Hard"
 * @param {string} userId - Optional user ID for per-user tracking
 * @param {string} subTopic - Optional subtopic to match exactly
 * @returns {Object|null} Follow-up question
 */
export function getFollowUpQuestion(topicId, difficulty, userId = null, subTopic = null) {
  const data = loadQuestions();
  
  // Convert difficulty to lowercase to match data format
  const difficultyLower = difficulty.toLowerCase();
  
  // Filter questions by topic and difficulty
  let candidateQuestions = data.questions.filter(
    q => q.topicId === topicId && q.difficulty === difficultyLower
  );
  
  // If subtopic is provided, filter by subtopic as well (must match exactly)
  if (subTopic && subTopic.trim() !== '') {
    const subTopicFiltered = candidateQuestions.filter(q => q.subTopic === subTopic);
    // If we found questions matching subtopic, use those; otherwise fall back to all questions for topic
    if (subTopicFiltered.length > 0) {
      candidateQuestions = subTopicFiltered;
    }
  }
  
  if (candidateQuestions.length === 0) {
    // No questions found for this topic/difficulty/subtopic combo
    return null;
  }
  
  // Check spaced repetition eligibility
  let eligibleQuestions;
  if (userId) {
    // Use per-user review data
    const eligibleIds = getEligibleQuestionIdsForUser(userId, candidateQuestions.map(q => q.id));
    eligibleQuestions = candidateQuestions.filter(q => eligibleIds.includes(q.id));
  } else {
    // For non-authenticated users, allow all questions
    eligibleQuestions = candidateQuestions;
  }
  
  // If no eligible questions, fall back to any matching question
  if (eligibleQuestions.length === 0) {
    eligibleQuestions = candidateQuestions;
  }
  
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
  
  return {
    questionId: question.id,
    question: question.question,
    options,
    key,
    explanation: question.explanation,
    difficulty: difficulty,
    topic: question.topicId
  };
}

/**
 * Validate a submitted answer
 * @param {string} questionId - The question ID
 * @param {string} selectedOption - The selected option (e.g., "Option A")
 * @returns {Object} Result with correct, correctAnswer, and explanation
 */
export function validateAnswer(questionId, selectedOption) {
  const data = loadQuestions();
  const question = data.questions.find(q => q.id === questionId);
  
  if (!question) {
    return {
      error: 'Question not found',
      correct: false,
      correctAnswer: '',
      explanation: ''
    };
  }
  
  // Parse selected option (e.g., "Option A" -> "A")
  const selectedKey = selectedOption.replace('Option ', '').trim();
  
  // Get correct answer key
  const optionLabels = ['A', 'B', 'C', 'D'];
  const correctKey = optionLabels[question.answerIndex] || 'A';
  const correctAnswer = `Option ${correctKey}`;
  
  const isCorrect = selectedKey === correctKey;
  
  return {
    correct: isCorrect,
    correctAnswer,
    explanation: question.explanation || 'No explanation available.',
    questionId: question.id,
    difficulty: mapRatingToDifficulty(3) // Default to medium, will be updated based on rating
  };
}

/**
 * Get question by ID for difficulty mapping
 * @param {string} questionId - The question ID
 * @returns {Object|null} Question object
 */
export function getQuestionById(questionId) {
  const data = loadQuestions();
  return data.questions.find(q => q.id === questionId) || null;
}
