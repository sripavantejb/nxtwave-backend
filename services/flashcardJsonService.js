import { loadQuestionsFromCSV } from './csvQuestionService.js';
import { getEligibleQuestionIdsForUser, getUserReviewData, getShownFlashcards, loadUsers, saveUsers, getPreviousBatchFlashcards, getCurrentBatchFlashcards } from './userService.js';
import { getAllDueQuestions } from './spacedRepService.js';

/**
 * Load all questions from CSV
 * @returns {Object} Object containing topics and questions arrays
 */
export function loadQuestions() {
  return loadQuestionsFromCSV();
}

/**
 * Get all unique subtopics from CSV data that have flashcards
 * @returns {Array<string>} Array of unique subtopic names
 */
export function getAllUniqueSubtopics() {
  const data = loadQuestions();
  const subtopicsSet = new Set();
  
  // Only include subtopics that have flashcards
  data.questions.forEach(q => {
    if (q.flashcard && q.flashcard.trim() !== '' && q.subTopic && q.subTopic.trim() !== '') {
      subtopicsSet.add(q.subTopic.trim());
    }
  });
  
  return Array.from(subtopicsSet);
}

/**
 * Pick N random unique subtopics from available subtopics
 * @param {number} count - Number of subtopics to pick (default: 6)
 * @returns {Array<string>} Array of randomly selected subtopic names
 */
export function pickRandomSubtopics(count = 6) {
  const allSubtopics = getAllUniqueSubtopics();
  
  if (allSubtopics.length === 0) {
    return [];
  }
  
  // If we have fewer subtopics than requested, return all
  if (allSubtopics.length <= count) {
    return [...allSubtopics];
  }
  
  // Shuffle and pick first N
  const shuffled = [...allSubtopics].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get a random flashcard from CSV
 * Prioritizes due reviews for authenticated users, then new flashcards
 * @param {string} userId - Optional user ID for per-user tracking
 * @param {Array<string>} allowedSubtopics - Optional array of subtopic names to filter by
 * @returns {Object|null} Random question with flashcard data
 */
export function getRandomFlashcard(userId = null, allowedSubtopics = null) {
  const data = loadQuestions();
  let questionsWithFlashcards = data.questions.filter(
    q => q.flashcard && q.flashcard.trim() !== ''
  );
  
  // Filter by allowed subtopics if provided
  if (allowedSubtopics && Array.isArray(allowedSubtopics) && allowedSubtopics.length > 0) {
    questionsWithFlashcards = questionsWithFlashcards.filter(
      q => q.subTopic && allowedSubtopics.includes(q.subTopic.trim())
    );
  }
  
  if (questionsWithFlashcards.length === 0) {
    return null;
  }
  
  // If user is authenticated, check for due reviews first (prioritize)
  if (userId) {
    // Priority 1: Check for due flashcards FIRST, before any filtering
    // Due flashcards bypass shownFlashcards filter completely
    const dueQuestionIds = getAllDueQuestions(userId);
    if (dueQuestionIds.length > 0) {
      // Get all flashcards that are due (bypass shownFlashcards filter)
      const dueFlashcards = questionsWithFlashcards.filter(q => dueQuestionIds.includes(q.id));
      
      if (dueFlashcards.length > 0) {
        // Return random due flashcard (bypasses shownFlashcards filter)
        const randomIndex = Math.floor(Math.random() * dueFlashcards.length);
        const question = dueFlashcards[randomIndex];
        const topic = data.topics.find(t => t.id === question.topicId);
        
        return {
          questionId: question.id,
          flashcard: question.flashcard,
          flashcardAnswer: question.flashcardAnswer,
          topic: topic ? topic.name : question.topicId,
          subTopic: question.subTopic || topic?.name || question.topicId,
          topicId: question.topicId,
          hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
        };
      }
    }
    
    // Priority 2: Get new flashcards (not in reviewData, filtered by shownFlashcards)
    // Get flashcards already shown in this session to avoid repetition
    const shownFlashcardIds = getShownFlashcards(userId);
    
    // Filter out already shown flashcards (only for new flashcards, not due ones)
    let availableFlashcards = questionsWithFlashcards.filter(
      q => !shownFlashcardIds.includes(q.id)
    );
    
    // If all flashcards are shown, reset and use all (for new session)
    if (availableFlashcards.length === 0) {
      // Reset shown flashcards in the database to allow cycling through again
      // This is safe because:
      // 1. Due flashcards are still prioritized (checked before this point)
      // 2. Spaced repetition data (reviewData) is separate and untouched
      // 3. This only affects session-level repetition, not review scheduling
      const users = loadUsers();
      if (users[userId] && users[userId].reviewData) {
        users[userId].reviewData.shownFlashcards = [];
        saveUsers(users);
      }
      availableFlashcards = questionsWithFlashcards;
    }
    
    // No due flashcards, prioritize new flashcards (not in reviewData)
    const reviewData = getUserReviewData(userId);
    const newFlashcards = availableFlashcards.filter(q => !reviewData[q.id]);
    
    // Use new flashcards if available, otherwise use all available (excluding shown)
    let eligibleQuestions = newFlashcards.length > 0 ? newFlashcards : availableFlashcards;
    
    // If still no eligible questions, use all flashcards from CSV (last resort)
    // This ensures we always return a flashcard when CSV has data
    if (eligibleQuestions.length === 0 && questionsWithFlashcards.length > 0) {
      eligibleQuestions = questionsWithFlashcards;
    }
    
    // Final fallback: if still no questions, return null (shouldn't happen if CSV has data)
    if (eligibleQuestions.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * eligibleQuestions.length);
    const question = eligibleQuestions[randomIndex];
    const topic = data.topics.find(t => t.id === question.topicId);
    
    return {
      questionId: question.id,
      flashcard: question.flashcard,
      flashcardAnswer: question.flashcardAnswer,
      topic: topic ? topic.name : question.topicId,
      subTopic: question.subTopic || topic?.name || question.topicId,
      topicId: question.topicId,
      hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
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
    topicId: question.topicId,
    hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
  };
}

/**
 * Map rating (1-5) to difficulty level
 * @param {number} rating - Rating from 1 to 5
 * @returns {string} "Easy", "Medium", or "Hard"
 */
export function mapRatingToDifficulty(rating) {
  if (rating <= 2) return "Easy";
  if (rating <= 3) return "Medium";
  return "Hard";
}

/**
 * Batch Composition Algorithm
 * Priority 1: Include all past-due flashcards (incorrect + correct with arrived nextReview)
 * Priority 2: Fill remaining slots with new flashcards never attempted before
 * Excludes flashcards from previous batches
 * @param {string} userId - User ID
 * @param {number} batchSize - Total batch size (default: 6)
 * @returns {Object} Object with flashcardIds array and subtopics array
 */
export function composeBatch(userId, batchSize = 6) {
  const data = loadQuestions();
  const reviewData = getUserReviewData(userId);
  const now = new Date();
  
  // Get all questions with flashcards
  const allFlashcards = data.questions.filter(
    q => q.flashcard && q.flashcard.trim() !== ''
  );
  
  // Get previous batch flashcard IDs to exclude them
  const previousBatchFlashcards = getPreviousBatchFlashcards(userId);
  const previousBatchSet = new Set(previousBatchFlashcards);
  
  // Also get current batch flashcard IDs to exclude them (in case batch wasn't properly moved to previous)
  // This prevents the same batch from being repeated if completeBatch wasn't called or failed
  const currentBatchFlashcards = getCurrentBatchFlashcards(userId);
  const currentBatchSet = new Set(currentBatchFlashcards || []);
  
  // Combine previous and current batches into exclusion set
  const excludedBatchSet = new Set([...previousBatchFlashcards, ...(currentBatchFlashcards || [])]);
  
  // Priority 1: Collect all past-due flashcards
  // Include both incorrectly answered and correctly answered flashcards where nextReviewDate has arrived
  const dueFlashcardIds = [];
  const dueSubtopics = new Set();
  const selectedFlashcardIds = new Set(); // Track selected IDs to ensure uniqueness
  const selectedFlashcardTexts = new Set(); // Track selected flashcard texts to prevent duplicates
  
  // Special keys to skip when iterating reviewData (not applicable when checking by question.id)
  // But we'll use getAllDueQuestions which already handles this correctly
  const allDueQuestionIds = getAllDueQuestions(userId);
  const dueQuestionIdsSet = new Set(allDueQuestionIds);
  
  // Find all past-due flashcards (both incorrect and correct)
  // Use the flashcard questions that are in the due questions list
  // Past-due flashcards can repeat even if in previous batches or current batch (they're due, so must be reviewed)
  for (const question of allFlashcards) {
    // Check if this flashcard is due (in the due questions list)
    if (dueQuestionIdsSet.has(question.id)) {
      // Normalize flashcard text for comparison
      const flashcardText = question.flashcard.trim().toLowerCase();
      
      // Check both ID and text uniqueness before adding
      // Past-due flashcards can repeat even if in previous/current batches
      if (!selectedFlashcardIds.has(question.id) && !selectedFlashcardTexts.has(flashcardText)) {
        dueFlashcardIds.push(question.id);
        selectedFlashcardIds.add(question.id);
        selectedFlashcardTexts.add(flashcardText);
        if (question.subTopic && question.subTopic.trim() !== '') {
          dueSubtopics.add(question.subTopic.trim());
        }
      }
    }
  }
  
  // Limit past-due flashcards to batch size (take first batchSize if more than batchSize)
  const limitedDueFlashcardIds = dueFlashcardIds.slice(0, batchSize);
  const remainingSlots = Math.max(0, batchSize - limitedDueFlashcardIds.length);
  
  // Priority 2: Fill remaining slots with new flashcards (never attempted)
  const newFlashcardIds = [];
  const newSubtopics = new Set();
  
  if (remainingSlots > 0) {
    // Filter for new flashcards that:
    // 1. Have never been attempted (no reviewData entry)
    // 2. Are not in previous batches
    // 3. Do not have a future scheduled time (nextReviewDate > now)
    // 4. Are all unique (not already in selectedFlashcardIds or selectedFlashcardTexts)
    const newFlashcards = allFlashcards.filter(question => {
      // Skip if already selected in this batch (ensures uniqueness)
      if (selectedFlashcardIds.has(question.id)) {
        return false;
      }
      
      // Skip if flashcard text already selected (prevents duplicates)
      const flashcardText = question.flashcard.trim().toLowerCase();
      if (selectedFlashcardTexts.has(flashcardText)) {
        return false;
      }
      
      // Skip if in previous batches or current batch (for new flashcards only, past-due can repeat)
      if (excludedBatchSet.has(question.id)) {
        return false;
      }
      
      const review = reviewData[question.id];
      
      // Never attempted: no review data exists at all
      if (!review) {
        return true;
      }
      
      // If review exists, it means the flashcard has been attempted before
      // Check if it's scheduled for future - if so, exclude it
      if (review.nextReviewDate) {
        const nextReview = new Date(review.nextReviewDate);
        if (nextReview > now) {
          // Scheduled for future - exclude (not eligible yet)
          return false;
        }
        // If nextReviewDate <= now, it should have been caught by getAllDueQuestions
        // So if we reach here, it's an edge case - exclude to be safe
        return false;
      }
      
      // If review exists but no nextReviewDate, it's an edge case
      // Exclude it to ensure we only get truly never-attempted flashcards
      return false;
    });
    
    // Shuffle and select up to remainingSlots new flashcards
    const shuffled = [...newFlashcards].sort(() => Math.random() - 0.5);
    const selectedNew = shuffled.slice(0, remainingSlots);
    
    for (const question of selectedNew) {
      if (!selectedFlashcardIds.has(question.id)) {
        const flashcardText = question.flashcard.trim().toLowerCase();
        if (!selectedFlashcardTexts.has(flashcardText)) {
          newFlashcardIds.push(question.id);
          selectedFlashcardIds.add(question.id);
          selectedFlashcardTexts.add(flashcardText);
          if (question.subTopic && question.subTopic.trim() !== '') {
            newSubtopics.add(question.subTopic.trim());
          }
        }
      }
    }
  }
  
  // Combine: due flashcards first, then new ones
  const allFlashcardIds = [...limitedDueFlashcardIds, ...newFlashcardIds];
  const allSubtopics = Array.from(new Set([...dueSubtopics, ...newSubtopics]));
  
  // Ensure exactly batchSize flashcard IDs
  const finalFlashcardIds = allFlashcardIds.slice(0, batchSize);
  
  return {
    flashcardIds: finalFlashcardIds,
    subtopics: allSubtopics.slice(0, batchSize) // Limit subtopics to batch size
  };
}

/**
 * Get a follow-up question based on topic, difficulty, and subtopic
 * Respects per-user spaced repetition scheduling
 * Implements progressive fallback logic to find questions when exact match fails
 * @param {string} topicId - The topic ID
 * @param {string} difficulty - "Easy", "Medium", or "Hard"
 * @param {string} userId - Optional user ID for per-user tracking
 * @param {string} subTopic - Optional subtopic to match exactly
 * @param {string} flashcardQuestionId - Optional flashcard question ID to filter by flashcard linkage
 * @returns {Object|null} Follow-up question
 */
export function getFollowUpQuestion(topicId, difficulty, userId = null, subTopic = null, flashcardQuestionId = null) {
  const data = loadQuestions();
  
  // Convert difficulty to lowercase to match data format
  // Handle both "Easy"/"Medium"/"Hard" and "easy"/"medium"/"hard"
  const difficultyLower = String(difficulty || '').toLowerCase().trim();
  
  // Helper function to filter and select a question
  const findQuestion = (filters) => {
    let candidates = data.questions.filter(
      q => q.topicId === topicId && 
           q.question && 
           q.question.trim() !== '' &&
           q.options && 
           q.options.length >= 2
    );
    
    // Apply difficulty filter if specified
    if (filters.difficulty !== null) {
      candidates = candidates.filter(q => 
        String(q.difficulty || '').toLowerCase().trim() === filters.difficulty
      );
    }
    
    // Apply flashcard text filter if specified
    if (filters.flashcardText !== null) {
      candidates = candidates.filter(q => {
        if (!q.flashcard) return false;
        const qFlashcardText = q.flashcard.trim().replace(/\s+/g, ' ');
        return qFlashcardText === filters.flashcardText;
      });
    }
    
    // Apply subtopic filter if specified
    if (filters.subTopic !== null) {
      const subTopicNormalized = filters.subTopic.trim().toLowerCase().replace(/\s+/g, ' ');
      candidates = candidates.filter(q => {
        const qSubTopic = (q.subTopic || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return qSubTopic === subTopicNormalized;
      });
    }
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Check spaced repetition eligibility
    let eligibleQuestions;
    if (userId) {
      const eligibleIds = getEligibleQuestionIdsForUser(userId, candidates.map(q => q.id));
      eligibleQuestions = candidates.filter(q => eligibleIds.includes(q.id));
    } else {
      eligibleQuestions = candidates;
    }
    
    // If no eligible questions, fall back to any matching question
    if (eligibleQuestions.length === 0) {
      eligibleQuestions = candidates;
    }
    
    // Pick a random eligible question
    const randomIndex = Math.floor(Math.random() * eligibleQuestions.length);
    return eligibleQuestions[randomIndex];
  };
  
  // Get flashcard text if flashcardQuestionId is provided
  let flashcardText = null;
  if (flashcardQuestionId && flashcardQuestionId.trim() !== '') {
    const flashcardQuestion = data.questions.find(q => q.id === flashcardQuestionId);
    if (flashcardQuestion && flashcardQuestion.flashcard) {
      flashcardText = flashcardQuestion.flashcard.trim().replace(/\s+/g, ' ');
    }
  }
  
  // Progressive fallback strategy:
  // 1. Try exact match: topic + difficulty + subtopic + flashcard text
  let question = findQuestion({
    difficulty: difficultyLower,
    subTopic: subTopic || null,
    flashcardText: flashcardText
  });
  
  if (question) {
    return formatQuestionResponse(question);
  }
  
  // 2. Try without flashcard text filter: topic + difficulty + subtopic
  if (flashcardText) {
    question = findQuestion({
      difficulty: difficultyLower,
      subTopic: subTopic || null,
      flashcardText: null
    });
    
    if (question) {
      console.log(`Fallback: Found question without flashcard text match for topicId: ${topicId}, difficulty: ${difficultyLower}, subTopic: ${subTopic}`);
      return formatQuestionResponse(question);
    }
  }
  
  // 3. Try without subtopic filter: topic + difficulty
  if (subTopic && subTopic.trim() !== '') {
    question = findQuestion({
      difficulty: difficultyLower,
      subTopic: null,
      flashcardText: null
    });
    
    if (question) {
      console.log(`Fallback: Found question without subtopic match for topicId: ${topicId}, difficulty: ${difficultyLower}`);
      return formatQuestionResponse(question);
    }
  }
  
  // 4. Try same topic with any difficulty
  question = findQuestion({
    difficulty: null,
    subTopic: null,
    flashcardText: null
  });
  
  if (question) {
    console.log(`Fallback: Found question with any difficulty for topicId: ${topicId}`);
    return formatQuestionResponse(question);
  }
  
  // 5. No questions found for this topic at all
  console.log(`No follow-up questions found for topicId: ${topicId} (tried all fallback strategies)`);
  return null;
}

/**
 * Helper function to format a question object into the response format
 */
function formatQuestionResponse(question) {
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
    difficulty: question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1),
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
