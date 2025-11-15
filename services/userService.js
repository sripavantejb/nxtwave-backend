import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_JSON_PATH = path.join(__dirname, '../data/users.json');

/**
 * Load all users from users.json
 * Creates the file if it doesn't exist
 * @returns {Object} Object containing users keyed by userId
 */
export function loadUsers() {
  try {
    if (!fs.existsSync(USERS_JSON_PATH)) {
      // Create empty users file
      const initialData = {};
      fs.writeFileSync(USERS_JSON_PATH, JSON.stringify(initialData, null, 2), 'utf8');
      return initialData;
    }
    const content = fs.readFileSync(USERS_JSON_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading users.json:', error);
    return {};
  }
}

/**
 * Save users data to users.json atomically
 * @param {Object} usersData - Users object to save
 * @returns {boolean} Success status
 */
export function saveUsers(usersData) {
  try {
    const tempPath = USERS_JSON_PATH + '.tmp';
    
    // Write to temporary file first
    fs.writeFileSync(tempPath, JSON.stringify(usersData, null, 2), 'utf8');
    
    // Atomically rename temp file to actual file
    fs.renameSync(tempPath, USERS_JSON_PATH);
    
    return true;
  } catch (error) {
    console.error('Error saving users.json:', error);
    return false;
  }
}

/**
 * Find a user by email
 * @param {string} email - User email
 * @returns {Object|null} User object with userId included, or null if not found
 */
export function findUserByEmail(email) {
  const users = loadUsers();
  const userId = Object.keys(users).find(
    id => users[id].email.toLowerCase() === email.toLowerCase()
  );
  
  if (!userId) return null;
  
  return {
    userId,
    ...users[userId]
  };
}

/**
 * Find a user by userId
 * @param {string} userId - User ID
 * @returns {Object|null} User object or null if not found
 */
export function findUserById(userId) {
  const users = loadUsers();
  return users[userId] || null;
}

/**
 * Create a new user
 * @param {Object} userData - User data (name, email, passwordHash)
 * @returns {Object} Created user with userId
 */
export function createUser(userData) {
  const users = loadUsers();
  
  // Generate unique userId
  const userId = generateUserId();
  
  // Create user object
  users[userId] = {
    name: userData.name,
    email: userData.email,
    passwordHash: userData.passwordHash,
    reviewData: {},
    createdAt: new Date().toISOString()
  };
  
  // Save to file
  saveUsers(users);
  
  return {
    userId,
    ...users[userId]
  };
}

/**
 * Update user's review data for a specific question
 * @param {string} userId - User ID
 * @param {string} questionId - Question ID
 * @param {Object} reviewData - Review data { difficulty, lastAnswerCorrect, nextReviewDate, timesReviewed }
 * @returns {boolean} Success status
 */
export function updateUserReviewData(userId, questionId, reviewData) {
  try {
    const users = loadUsers();
    
    if (!users[userId]) {
      console.error(`User ${userId} not found`);
      return false;
    }
    
    // Initialize reviewData if it doesn't exist
    if (!users[userId].reviewData) {
      users[userId].reviewData = {};
    }
    
    // Get existing review
    const existingReview = users[userId].reviewData[questionId];
    
    // Calculate timesReviewed - if provided use it, otherwise increment if exists, or set to 1
    let timesReviewed;
    if (reviewData.timesReviewed !== undefined) {
      timesReviewed = reviewData.timesReviewed;
    } else if (existingReview && existingReview.timesReviewed) {
      timesReviewed = existingReview.timesReviewed + 1;
    } else {
      timesReviewed = 1;
    }
    
    // Update the review data for this question
    users[userId].reviewData[questionId] = {
      difficulty: reviewData.difficulty !== undefined ? reviewData.difficulty : (existingReview?.difficulty || 'medium'),
      lastAnswerCorrect: reviewData.lastAnswerCorrect !== undefined ? reviewData.lastAnswerCorrect : existingReview?.lastAnswerCorrect,
      nextReviewDate: reviewData.nextReviewDate !== undefined ? reviewData.nextReviewDate : existingReview?.nextReviewDate,
      timesReviewed
    };
    
    // Save atomically (immediate persistence)
    return saveUsers(users);
  } catch (error) {
    console.error('Error updating review data:', error);
    return false;
  }
}

/**
 * Get user's review data
 * @param {string} userId - User ID
 * @returns {Object} Review data object
 */
export function getUserReviewData(userId) {
  const user = findUserById(userId);
  return user?.reviewData || {};
}

/**
 * Legacy function for backward compatibility - maps to reviewData
 * @deprecated Use getUserReviewData instead
 */
export function getUserReviewSchedule(userId) {
  return getUserReviewData(userId);
}

/**
 * Legacy function for backward compatibility - maps to reviewData
 * @deprecated Use updateUserReviewData instead
 */
export function updateUserReviewSchedule(userId, questionId, reviewData) {
  // Map old structure to new structure
  const newReviewData = {
    difficulty: reviewData.lastDifficulty || reviewData.difficulty || 'medium',
    lastAnswerCorrect: reviewData.lastAnswerCorrect,
    nextReviewDate: reviewData.nextReviewDate,
    timesReviewed: reviewData.timesReviewed || 1
  };
  return updateUserReviewData(userId, questionId, newReviewData);
}

/**
 * Generate a unique user ID
 * @returns {string} Unique user ID
 */
function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Check if a question is eligible for review for a specific user
 * @param {string} userId - User ID
 * @param {string} questionId - Question ID
 * @returns {boolean} True if eligible for review
 */
export function isQuestionEligibleForUser(userId, questionId) {
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
 * Get all eligible question IDs for a user
 * @param {string} userId - User ID
 * @param {Array<string>} questionIds - Array of question IDs to check
 * @returns {Array<string>} Array of eligible question IDs
 */
export function getEligibleQuestionIdsForUser(userId, questionIds) {
  return questionIds.filter(qId => isQuestionEligibleForUser(userId, qId));
}
