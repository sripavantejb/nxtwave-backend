import { getUserReviewData } from './userService.js';

/**
 * Calculate next review date based on answer correctness and difficulty
 * @param {boolean} isCorrect - Whether the answer was correct
 * @param {string} difficulty - Difficulty level ("easy", "medium", "hard" or "Easy", "Medium", "Hard")
 * @returns {Date} Next review date
 */
export function calculateNextReviewDate(isCorrect, difficulty) {
  const now = new Date();
  const difficultyLower = String(difficulty || 'medium').toLowerCase();

  if (!isCorrect) {
    // Wrong answer → always 1 day
    now.setDate(now.getDate() + 1);
    return now;
  }

  // Correct answer → schedule based on difficulty
  if (difficultyLower === 'easy') {
    now.setDate(now.getDate() + 3);
  } else if (difficultyLower === 'medium') {
    now.setDate(now.getDate() + 5);
  } else if (difficultyLower === 'hard') {
    now.setDate(now.getDate() + 7);
  } else {
    // Default to medium if unknown
    now.setDate(now.getDate() + 5);
  }

  return now;
}

/**
 * Check if a question is due for review for a specific user
 * @param {string} userId - User ID
 * @param {string} questionId - Question ID
 * @returns {boolean} True if question is due for review
 */
export function isQuestionDue(userId, questionId) {
  if (!userId || !questionId) {
    return true; // If no user or question, consider eligible
  }

  const reviewData = getUserReviewData(userId);
  const review = reviewData[questionId];

  if (!review || !review.nextReviewDate) {
    return true; // No schedule exists, eligible for review
  }

  const nextReview = new Date(review.nextReviewDate);
  const now = new Date();

  return now >= nextReview;
}

/**
 * Filter question IDs to only those due for review
 * @param {string} userId - User ID
 * @param {Array<string>} questionIds - Array of question IDs to check
 * @returns {Array<string>} Array of question IDs that are due for review
 */
export function getDueQuestionIds(userId, questionIds) {
  if (!userId || !Array.isArray(questionIds)) {
    return questionIds || [];
  }

  return questionIds.filter(qId => isQuestionDue(userId, qId));
}

/**
 * Get all question IDs that are due for review for a user
 * @param {string} userId - User ID
 * @returns {Array<string>} Array of question IDs that are due
 */
export function getAllDueQuestions(userId) {
  if (!userId) {
    return [];
  }

  const reviewData = getUserReviewData(userId);
  const now = new Date();
  const dueQuestionIds = [];

  for (const [questionId, review] of Object.entries(reviewData)) {
    if (review && review.nextReviewDate) {
      const nextReview = new Date(review.nextReviewDate);
      if (now >= nextReview) {
        dueQuestionIds.push(questionId);
      }
    }
  }

  return dueQuestionIds;
}

