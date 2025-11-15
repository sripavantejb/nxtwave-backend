import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REVIEW_SCHEDULE_PATH = path.join(__dirname, '../data/reviewSchedule.json');

/**
 * Load the review schedule from reviewSchedule.json
 * Creates the file if it doesn't exist
 */
export function loadReviewSchedule() {
  try {
    if (!fs.existsSync(REVIEW_SCHEDULE_PATH)) {
      // Create empty review schedule file
      const initialData = { reviews: {} };
      fs.writeFileSync(REVIEW_SCHEDULE_PATH, JSON.stringify(initialData, null, 2), 'utf8');
      return initialData;
    }
    const content = fs.readFileSync(REVIEW_SCHEDULE_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading review schedule:', error);
    return { reviews: {} };
  }
}

/**
 * Save the review schedule to reviewSchedule.json
 */
export function saveReviewSchedule(scheduleData) {
  try {
    fs.writeFileSync(REVIEW_SCHEDULE_PATH, JSON.stringify(scheduleData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving review schedule:', error);
    return false;
  }
}

/**
 * Calculate next review date based on difficulty and correctness
 * @param {string} difficulty - "Easy", "Medium", or "Hard"
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {Date} Next review date
 */
export function getNextReviewDate(difficulty, isCorrect) {
  const now = new Date();
  
  if (!isCorrect) {
    now.setDate(now.getDate() + 1);
    return now;
  }
  
  if (difficulty === "Easy") {
    now.setDate(now.getDate() + 3);
  } else if (difficulty === "Medium") {
    now.setDate(now.getDate() + 5);
  } else if (difficulty === "Hard") {
    now.setDate(now.getDate() + 7);
  }
  
  return now;
}

/**
 * Update the review schedule for a specific question
 * @param {string} questionId - The question ID
 * @param {string} difficulty - "Easy", "Medium", or "Hard"
 * @param {boolean} isCorrect - Whether the answer was correct
 */
export function updateReviewSchedule(questionId, difficulty, isCorrect) {
  const schedule = loadReviewSchedule();
  
  const nextReviewDate = getNextReviewDate(difficulty, isCorrect);
  
  schedule.reviews[questionId] = {
    nextReviewDate: nextReviewDate.toISOString(),
    lastReviewed: new Date().toISOString(),
    difficulty,
    wasCorrect: isCorrect
  };
  
  saveReviewSchedule(schedule);
  return nextReviewDate;
}

/**
 * Check if a question is eligible for review (not scheduled for future)
 * @param {string} questionId - The question ID
 * @returns {boolean} True if eligible for review
 */
export function isEligibleForReview(questionId) {
  const schedule = loadReviewSchedule();
  const review = schedule.reviews[questionId];
  
  if (!review || !review.nextReviewDate) {
    return true; // No schedule exists, eligible for review
  }
  
  const nextReviewDate = new Date(review.nextReviewDate);
  const now = new Date();
  
  return now >= nextReviewDate;
}

/**
 * Get all questions that are eligible for review
 * @param {Array} questionIds - Array of question IDs to check
 * @returns {Array} Array of eligible question IDs
 */
export function getEligibleQuestions(questionIds) {
  return questionIds.filter(id => isEligibleForReview(id));
}
