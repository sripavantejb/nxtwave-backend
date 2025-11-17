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
  try {
    if (!email || typeof email !== 'string') {
      console.error('findUserByEmail: Invalid email parameter:', email);
      return null;
    }
    
    const users = loadUsers();
    
    // Validate users object
    if (!users || typeof users !== 'object') {
      console.error('findUserByEmail: Invalid users data structure');
      return null;
    }
    
    const userId = Object.keys(users).find(
      id => {
        const user = users[id];
        // Safely check if user exists and has email property
        if (!user || typeof user !== 'object' || !user.email) {
          return false;
        }
        // Safely compare emails (case-insensitive)
        try {
          return user.email.toLowerCase() === email.toLowerCase();
        } catch (emailError) {
          console.error('findUserByEmail: Error comparing emails:', {
            userId: id,
            userEmail: user.email,
            searchEmail: email,
            error: emailError instanceof Error ? emailError.message : String(emailError)
          });
          return false;
        }
      }
    );
    
    if (!userId) return null;
    
    const user = users[userId];
    if (!user || typeof user !== 'object') {
      console.error('findUserByEmail: User data is invalid for userId:', userId);
      return null;
    }
    
    return {
      userId,
      ...user
    };
  } catch (error) {
    console.error('findUserByEmail: Unexpected error:', {
      email,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined
    });
    // Return null instead of throwing to prevent 500 errors
    return null;
  }
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

/**
 * Mark a flashcard subtopic as completed for a user
 * @param {string} userId - User ID
 * @param {string} subtopicName - Subtopic name
 * @param {string} nextReviewDate - Next review date (ISO string)
 * @returns {boolean} Success status
 */
export function markSubtopicCompleted(userId, subtopicName, nextReviewDate = null) {
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
    
    // Initialize flashcardSubtopic if it doesn't exist
    if (!users[userId].reviewData.flashcardSubtopic) {
      users[userId].reviewData.flashcardSubtopic = {};
    }
    
    // Mark subtopic as completed with next review date
    users[userId].reviewData.flashcardSubtopic[subtopicName] = {
      nextReviewDate: nextReviewDate || null
    };
    
    // Add to completedSubtopics array if not already there
    if (!users[userId].reviewData.completedSubtopics) {
      users[userId].reviewData.completedSubtopics = [];
    }
    
    if (!users[userId].reviewData.completedSubtopics.includes(subtopicName)) {
      users[userId].reviewData.completedSubtopics.push(subtopicName);
    }
    
    return saveUsers(users);
  } catch (error) {
    console.error('Error marking subtopic as completed:', error);
    return false;
  }
}

/**
 * Get list of completed subtopics for a user
 * @param {string} userId - User ID
 * @returns {Array<string>} Array of completed subtopic names
 */
export function getCompletedSubtopics(userId) {
  const reviewData = getUserReviewData(userId);
  return reviewData.completedSubtopics || [];
}

/**
 * Get current session's subtopics for a user
 * @param {string} userId - User ID
 * @returns {Array<string>} Array of subtopic names in current session
 */
export function getSessionSubtopics(userId) {
  const reviewData = getUserReviewData(userId);
  return reviewData.sessionSubtopics || [];
}

/**
 * Start a new session with all available subtopics and store in user data
 * @param {string} userId - User ID
 * @param {Array<string>} subtopics - Array of subtopic names to set as session
 * @returns {boolean} Success status
 */
export function startNewSession(userId, subtopics) {
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
    
    // Store session subtopics
    users[userId].reviewData.sessionSubtopics = subtopics;
    
    // Reset shown flashcards for new session (track which flashcards have been shown in this session)
    users[userId].reviewData.shownFlashcards = [];
    
    // Clear batch completion time when starting a new session
    // This ensures the timer resets properly for the next batch
    delete users[userId].reviewData.batchCompletionTime;
    
    // Reset completed subtopics for new session (or keep existing if you want to track all-time)
    // For now, we'll keep completedSubtopics as all-time tracking
    
    return saveUsers(users);
  } catch (error) {
    console.error('Error starting new session:', error);
    return false;
  }
}

/**
 * Get list of shown flashcard IDs for current session
 * @param {string} userId - User ID
 * @returns {Array<string>} Array of shown flashcard question IDs
 */
export function getShownFlashcards(userId) {
  const reviewData = getUserReviewData(userId);
  return reviewData.shownFlashcards || [];
}

/**
 * Mark a flashcard as shown in the current session
 * @param {string} userId - User ID
 * @param {string} questionId - Question ID of the flashcard shown
 * @returns {boolean} Success status
 */
export function markFlashcardAsShown(userId, questionId) {
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
    
    // Initialize shownFlashcards if it doesn't exist
    if (!users[userId].reviewData.shownFlashcards) {
      users[userId].reviewData.shownFlashcards = [];
    }
    
    // Add questionId if not already in the list
    if (!users[userId].reviewData.shownFlashcards.includes(questionId)) {
      users[userId].reviewData.shownFlashcards.push(questionId);
    }
    
    return saveUsers(users);
  } catch (error) {
    console.error('Error marking flashcard as shown:', error);
    return false;
  }
}

/**
 * Check if a subtopic is due for review
 * @param {string} userId - User ID
 * @param {string} subtopicName - Subtopic name
 * @returns {boolean} True if subtopic is due for review
 */
export function isSubtopicDue(userId, subtopicName) {
  const reviewData = getUserReviewData(userId);
  const subtopicData = reviewData.flashcardSubtopic?.[subtopicName];
  
  if (!subtopicData || !subtopicData.nextReviewDate) {
    return true; // No schedule exists, eligible for review
  }
  
  const nextReview = new Date(subtopicData.nextReviewDate);
  const now = new Date();
  
  return now >= nextReview;
}

/**
 * Update flashcard subtopic's next review date
 * @param {string} userId - User ID
 * @param {string} subtopicName - Subtopic name
 * @param {string} nextReviewDate - Next review date (ISO string)
 * @returns {boolean} Success status
 */
export function updateSubtopicReviewDate(userId, subtopicName, nextReviewDate) {
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
    
    // Initialize flashcardSubtopic if it doesn't exist
    if (!users[userId].reviewData.flashcardSubtopic) {
      users[userId].reviewData.flashcardSubtopic = {};
    }
    
    // Update or create subtopic entry
    if (!users[userId].reviewData.flashcardSubtopic[subtopicName]) {
      users[userId].reviewData.flashcardSubtopic[subtopicName] = {};
    }
    
    users[userId].reviewData.flashcardSubtopic[subtopicName].nextReviewDate = nextReviewDate;
    
    return saveUsers(users);
  } catch (error) {
    console.error('Error updating subtopic review date:', error);
    return false;
  }
}

/**
 * Set batch completion time for a user
 * @param {string} userId - User ID
 * @param {number} timestamp - Batch completion timestamp (milliseconds since epoch)
 * @returns {boolean} Success status
 */
export function setBatchCompletionTime(userId, timestamp) {
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
    
    // Store batch completion time
    users[userId].reviewData.batchCompletionTime = timestamp;
    
    return saveUsers(users);
  } catch (error) {
    console.error('Error setting batch completion time:', error);
    return false;
  }
}

/**
 * Get batch completion time for a user
 * @param {string} userId - User ID
 * @returns {number|null} Batch completion timestamp (milliseconds since epoch) or null if not set
 */
export function getBatchCompletionTime(userId) {
  const reviewData = getUserReviewData(userId);
  return reviewData.batchCompletionTime || null;
}

/**
 * Check if day shift has completed (nextReviewDate has passed)
 * Day shift = 5 minutes (for testing) or 1 day (for production)
 * @param {string} userId - User ID
 * @returns {boolean} True if day shift has completed and new batch is available
 */
export function isDayShiftCompleted(userId) {
  const reviewData = getUserReviewData(userId);
  const now = new Date();
  
  // First, check if batchCompletionTime exists and if 5 minutes have passed since batch completion
  const batchCompletionTime = getBatchCompletionTime(userId);
  if (batchCompletionTime !== null) {
    const batchCompletionDate = new Date(batchCompletionTime);
    const dayShiftEndTime = new Date(batchCompletionDate.getTime() + (5 * 60 * 1000)); // Add 5 minutes
    if (now >= dayShiftEndTime) {
      return true;
    }
    // If batchCompletionTime exists but hasn't passed yet, return false
    return false;
  }
  
  // Fallback: Check if there are any incorrectly answered flashcards that are due
  // This is for backward compatibility if batchCompletionTime doesn't exist
  const specialKeys = ['flashcardSubtopic', 'sessionSubtopics', 'completedSubtopics', 'shownFlashcards', 'batchCompletionTime'];
  
  for (const [questionId, review] of Object.entries(reviewData)) {
    // Skip special keys
    if (specialKeys.includes(questionId)) {
      continue;
    }
    
    // Check if this is an incorrectly answered flashcard that is due
    if (review && 
        review.lastAnswerCorrect === false && 
        review.nextReviewDate) {
      const nextReview = new Date(review.nextReviewDate);
      if (now >= nextReview) {
        // Found at least one incorrectly answered flashcard that is due
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get incorrectly answered flashcards that are due for review
 * @param {string} userId - User ID
 * @returns {Array<string>} Array of question IDs that are incorrectly answered and due
 */
export function getIncorrectlyAnsweredDueFlashcards(userId) {
  const reviewData = getUserReviewData(userId);
  const now = new Date();
  const incorrectDueFlashcards = [];
  
  const specialKeys = ['flashcardSubtopic', 'sessionSubtopics', 'completedSubtopics', 'shownFlashcards'];
  
  for (const [questionId, review] of Object.entries(reviewData)) {
    // Skip special keys
    if (specialKeys.includes(questionId)) {
      continue;
    }
    
    // Check if this is an incorrectly answered flashcard that is due
    if (review && 
        review.lastAnswerCorrect === false && 
        review.nextReviewDate) {
      const nextReview = new Date(review.nextReviewDate);
      if (now >= nextReview) {
        incorrectDueFlashcards.push(questionId);
      }
    }
  }
  
  return incorrectDueFlashcards;
}
