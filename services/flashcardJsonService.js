import { loadQuestionsFromCSV } from './csvQuestionService.js';
import { getEligibleQuestionIdsForUser, getUserReviewData, getShownFlashcards, loadUsers, saveUsers } from './userService.js';
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
 * @param {string} flashcardQuestionId - Optional flashcard question ID to filter by flashcard linkage
 * @returns {Object|null} Follow-up question
 */
export function getFollowUpQuestion(topicId, difficulty, userId = null, subTopic = null, flashcardQuestionId = null) {
  const data = loadQuestions();
  
  // Convert difficulty to lowercase to match data format
  const difficultyLower = difficulty.toLowerCase();
  
  // Filter questions by topic and difficulty
  // Only include questions that have actual question text (not just flashcards)
  let candidateQuestions = data.questions.filter(
    q => q.topicId === topicId && 
         q.difficulty === difficultyLower &&
         q.question && 
         q.question.trim() !== '' &&
         q.options && 
         q.options.length >= 2
  );
  
  // If flashcardQuestionId is provided, filter questions to match that specific flashcard
  // This ensures questions are matched to the flashcard's concept, not just subtopic
  if (flashcardQuestionId && flashcardQuestionId.trim() !== '') {
    const flashcardQuestion = data.questions.find(q => q.id === flashcardQuestionId);
    
    if (flashcardQuestion && flashcardQuestion.flashcard) {
      const flashcardText = flashcardQuestion.flashcard.trim();
      // Filter questions to only those that have the same flashcard text
      // This matches questions to the specific flashcard concept
      candidateQuestions = candidateQuestions.filter(q => 
        q.flashcard && q.flashcard.trim() === flashcardText
      );
    } else {
      // If flashcard question not found or has no flashcard text, return null
      console.log(`Flashcard question with ID ${flashcardQuestionId} not found or has no flashcard text. Returning null.`);
      return null;
    }
  }
  
  // If subtopic is provided, filter by subtopic (case-insensitive, trimmed) - MANDATORY, no fallback
  if (subTopic && subTopic.trim() !== '') {
    const subTopicNormalized = subTopic.trim().toLowerCase();
    candidateQuestions = candidateQuestions.filter(q => {
      const qSubTopic = (q.subTopic || '').trim().toLowerCase();
      // Case-insensitive matching - strict filtering, no fallback
      return qSubTopic === subTopicNormalized;
    });
  }
  
  // If no questions found for this exact topic/difficulty/subtopic/flashcard combo, return null (NO fallbacks)
  if (candidateQuestions.length === 0) {
    console.log(`No follow-up questions found for topicId: ${topicId}, difficulty: ${difficultyLower}, subTopic: ${subTopic}, flashcardQuestionId: ${flashcardQuestionId}. Returning null.`);
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
    difficulty: question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1), // Use actual question difficulty, not requested
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
