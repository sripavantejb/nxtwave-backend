import { findQuestions } from '../models/questionModel.js';
import { findAllTopics } from '../models/topicModel.js';
import {
  pickRandomQuestion,
  pickFollowUpQuestion,
  toFlashcardPayload
} from '../services/flashcardService.js';
import {
  getRandomFlashcard as getRandomFlashcardFromJson,
  mapRatingToDifficulty,
  getFollowUpQuestion as getFollowUpQuestionFromJson,
  validateAnswer as validateAnswerFromJson,
  getQuestionById,
  loadQuestions,
  pickRandomSubtopics,
  getRandomFlashcard as getRandomFlashcardFromService,
  getAllUniqueSubtopics,
  composeBatch
} from '../services/flashcardJsonService.js';
import { updateReviewSchedule } from '../utils/reviewSchedule.js';
import { updateUserReviewData, getUserReviewData, startNewSession, getSessionSubtopics, getCompletedSubtopics, isSubtopicDue, markSubtopicCompleted, updateSubtopicReviewDate, markFlashcardAsShown, getShownFlashcards, loadUsers, saveUsers, isDayShiftCompleted, getIncorrectlyAnsweredDueFlashcards, setBatchCompletionTime, getCurrentBatchFlashcards, getPreviousBatchFlashcards, setCurrentBatchFlashcards, addToPreviousBatches, clearCurrentBatch, getBatchCompletionTime, getCurrentBatchIndex, incrementCurrentBatchIndex, markFlashcardAsShownToday, getDailyShownFlashcards } from '../services/userService.js';
import { calculateNextReviewDate, getAllDueQuestions, getDueFlashcardSubtopics, calculateSubtopicNextReviewDate } from '../services/spacedRepService.js';

let cachedTopicMap = null;
let cachedTopicTimestamp = 0;
const TOPIC_CACHE_MS = 5 * 60 * 1000;

async function getTopicMap() {
  const now = Date.now();
  if (cachedTopicMap && now - cachedTopicTimestamp < TOPIC_CACHE_MS) {
    return cachedTopicMap;
  }

  try {
    const topics = await findAllTopics();
    cachedTopicMap = new Map(topics.map(topic => [topic.id, topic]));
    cachedTopicTimestamp = now;
  } catch (err) {
    console.warn('Failed to refresh topics for flashcards:', err.message);
    // Keep old cache if available; otherwise fall back to empty map
    cachedTopicMap = cachedTopicMap || new Map();
  }

  return cachedTopicMap;
}

function parseExcludeIds(raw) {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap(entry => String(entry).split(','))
    .map(id => id.trim())
    .filter(Boolean);
}

function topicIdsForFollowUp(topicId) {
  if (topicId === 'si-ci') {
    return ['si', 'ci'];
  }
  return [topicId];
}

/**
 * Check if a subtopic has flashcards that haven't been shown in the current session
 * @param {string} subtopic - The subtopic name to check
 * @param {string} userId - User ID
 * @returns {boolean} True if there are unshown flashcards in this subtopic, false otherwise
 */
function hasUnshownFlashcardsInSubtopic(subtopic, userId) {
  const data = loadQuestions();
  const shownFlashcardIds = getShownFlashcards(userId);
  
  // Get all flashcards in this subtopic
  const flashcardsInSubtopic = data.questions.filter(
    q => q.flashcard && 
         q.flashcard.trim() !== '' && 
         q.subTopic && 
         q.subTopic.trim().toLowerCase() === subtopic.trim().toLowerCase()
  );
  
  // Check if there's at least one flashcard that hasn't been shown
  return flashcardsInSubtopic.some(q => !shownFlashcardIds.includes(q.id));
}

function enrichAndRespond(res, question, topicMeta) {
  if (!question) {
    return res.status(404).json({ error: 'No flashcard available' });
  }

  const payload = toFlashcardPayload(question, topicMeta);
  if (!payload) {
    return res.status(500).json({ error: 'Failed to format flashcard' });
  }

  return res.json({ flashcard: payload });
}

export async function getRandomFlashcard(req, res) {
  try {
    const excludeIds = parseExcludeIds(req.query.excludeIds);
    let questions = await findQuestions({ excludeIds });

    if ((!questions || questions.length === 0) && excludeIds.length) {
      questions = await findQuestions();
    }

    // Filter to only include questions that have a flashcard field
    const flashcardQuestions = questions.filter(q => q.flashcard && q.flashcard.trim() !== '');

    if (flashcardQuestions.length === 0) {
      return res.status(404).json({ error: 'No flashcards available' });
    }

    const picked = pickRandomQuestion(flashcardQuestions);
    const topicMap = await getTopicMap();
    const topicMeta = picked ? topicMap.get(picked.topicId) : null;

    return enrichAndRespond(res, picked, topicMeta);
  } catch (err) {
    console.error('Error fetching random flashcard:', err);
    return res.status(500).json({ error: 'Failed to fetch flashcard' });
  }
}

export async function getFollowUpFlashcard(req, res) {
  try {
    const topicId = String(req.query.topicId || '').trim();
    if (!topicId) {
      return res.status(400).json({ error: 'Missing topicId' });
    }

    const rating = Number(req.query.rating ?? 3);
    const excludeIds = parseExcludeIds(req.query.excludeIds);
    const mode = rating <= 2 ? 'remedial' : 'challenge';

    const topicIds = topicIdsForFollowUp(topicId);
    let questions = await findQuestions({ topicIds, excludeIds });

    if ((!questions || questions.length === 0) && excludeIds.length) {
      questions = await findQuestions({ topicIds });
    }

    if (!questions || questions.length === 0) {
      return res.status(404).json({ error: 'No related questions available' });
    }

    const picked = pickFollowUpQuestion(questions, mode);
    const topicMap = await getTopicMap();
    const topicMeta = picked ? topicMap.get(picked.topicId) || topicMap.get(topicId) : null;

    return enrichAndRespond(res, picked, topicMeta);
  } catch (err) {
    console.error('Error fetching follow-up flashcard:', err);
    return res.status(500).json({ error: 'Failed to fetch follow-up flashcard' });
  }
}

// ============== NEW JSON-BASED ENDPOINTS ==============

/**
 * GET /flashcards/start-session
 * Initializes a new session with all available subtopics
 * Requires JWT authentication
 * Returns all subtopics selected for this session
 */
export async function startSession(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Ensure user exists in the database (create if needed)
    const users = loadUsers();
    if (!users[userId]) {
      // User doesn't exist - this shouldn't happen if auth is working correctly
      // but we'll handle it gracefully by initializing the user
      console.warn(`User ${userId} not found in database, initializing...`);
      users[userId] = {
        reviewData: {}
      };
      if (!saveUsers(users)) {
        return res.status(500).json({ error: 'Failed to initialize user data' });
      }
    }
    
    // Check if force parameter is provided (to force new session even if one exists)
    const forceNew = req.query.force === 'true' || req.query.force === '1';
    
    // Check cooldown if forcing new session
    if (forceNew) {
      const batchCompletionTime = getBatchCompletionTime(userId);
      if (batchCompletionTime !== null) {
        const now = Date.now();
        const elapsed = now - batchCompletionTime;
        const cooldownMs = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        if (elapsed < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
          const minutes = Math.floor(remainingSeconds / 60);
          const seconds = remainingSeconds % 60;
          const remainingTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          
          return res.status(429).json({
            error: 'Cooldown active',
            canStart: false,
            remainingSeconds,
            remainingTime
          });
        }
      }
    }
    
    // Check if user already has an active session
    const existingSession = getSessionSubtopics(userId);
    
    // If session exists and has subtopics, and not forcing new session
    // Return existing session (limit to 6 flashcards is enforced in frontend)
    if (!forceNew && existingSession && existingSession.length > 0) {
      return res.json({
        sessionSubtopics: existingSession,
        isNewSession: false
      });
    }
    
    // Use batch composition algorithm to create session with 6 flashcards
    // Priority 1: Incorrectly answered flashcards that are due
    // Priority 2: Random flashcards to fill remaining slots
    let batch;
    try {
      batch = composeBatch(userId, 6);
    } catch (batchErr) {
      console.error('Error in composeBatch:', batchErr);
      // Fall back to random selection if batch composition fails
      const allSubtopics = getAllUniqueSubtopics();
      if (allSubtopics.length === 0) {
        return res.status(404).json({ error: 'No subtopics available' });
      }
      batch = { flashcardIds: [], subtopics: pickRandomSubtopics(6) };
    }
    
    if (batch.subtopics.length === 0) {
      // If no subtopics from batch composition, fall back to random selection
      const allSubtopics = getAllUniqueSubtopics();
      if (allSubtopics.length === 0) {
        return res.status(404).json({ error: 'No subtopics available' });
      }
      
      // Pick 6 random subtopics
      batch.subtopics = pickRandomSubtopics(6);
    }
    
    // Store batch IDs if available, but filter out flashcards already shown today
    if (batch.flashcardIds && batch.flashcardIds.length > 0) {
      // Get flashcards already shown today
      const dailyShownFlashcardIds = getDailyShownFlashcards(userId);
      const dailyShownSet = new Set(dailyShownFlashcardIds);
      
      // Build set of normalized texts of already shown flashcards today
      const data = loadQuestions();
      const allQuestionsWithFlashcards = data.questions.filter(
        q => q.flashcard && q.flashcard.trim() !== ''
      );
      const dailyShownFlashcardTexts = new Set();
      for (const q of allQuestionsWithFlashcards) {
        if (dailyShownSet.has(q.id) && q.flashcard) {
          const normalizedText = q.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
          dailyShownFlashcardTexts.add(normalizedText);
        }
      }
      
      // Filter batch to exclude flashcards already shown today
      const filteredBatchIds = batch.flashcardIds.filter(flashcardId => {
        const question = data.questions.find(q => q.id === flashcardId);
        if (!question || !question.flashcard) return false;
        
        // Skip if already shown today by ID
        if (dailyShownSet.has(flashcardId)) return false;
        
        // Skip if already shown today by text
        const normalizedText = question.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
        if (dailyShownFlashcardTexts.has(normalizedText)) return false;
        
        return true;
      });
      
      // Only store batch if we have valid flashcards
      if (filteredBatchIds.length > 0) {
        setCurrentBatchFlashcards(userId, filteredBatchIds);
      } else {
        // All flashcards in batch were already shown today - clear batch
        clearCurrentBatch(userId);
      }
    }
    
    // Store session in user's reviewData (this also resets shownFlashcards)
    const success = startNewSession(userId, batch.subtopics);
    
    if (!success) {
      console.error(`Failed to start session for user ${userId}`);
      return res.status(500).json({ 
        error: 'Failed to start session',
        message: 'Unable to save session data. Please try again.'
      });
    }
    
    return res.json({
      sessionSubtopics: batch.subtopics,
      isNewSession: true
    });
  } catch (err) {
    console.error('Error starting session:', err);
    return res.status(500).json({ 
      error: 'Failed to start session',
      message: err instanceof Error ? err.message : 'Unknown error occurred'
    });
  }
}

/**
 * POST /flashcards/reset-shown
 * Resets the shown flashcards list for the current session
 * Used when continuing after completing a batch of flashcards
 * Requires JWT authentication
 */
export async function resetShownFlashcards(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const users = loadUsers();
    
    // Initialize user data if it doesn't exist
    if (!users[userId]) {
      users[userId] = { reviewData: {} };
    }
    
    if (!users[userId].reviewData) {
      users[userId].reviewData = {};
    }
    
    // Reset shown flashcards
    users[userId].reviewData.shownFlashcards = [];
    saveUsers(users);
    
    return res.json({ success: true, message: 'Shown flashcards reset' });
  } catch (err) {
    console.error('Error resetting shown flashcards:', err);
    return res.status(500).json({ error: 'Failed to reset shown flashcards' });
  }
}

/**
 * GET /flashcard/random-json
 * Returns a random flashcard from topics_until_percentages.csv
 * Prioritizes due reviews, then shows flashcards from session's subtopics
 * Excludes completed subtopics unless they are due for review
 * Supports authenticated users for per-user tracking
 */
export async function getRandomFlashcardJson(req, res) {
  try {
    const userId = req.userId; // Set by optionalAuth middleware
    
    if (!userId) {
      // For non-authenticated users, return random flashcard
      const flashcard = getRandomFlashcardFromJson(userId);
      if (!flashcard) {
        return res.status(404).json({ error: 'No flashcards available' });
      }
      return res.json(flashcard);
    }
    
    // Priority 0: Check if there's an active batch and serve from it
    const currentBatchFlashcards = getCurrentBatchFlashcards(userId);
    const currentBatchIndex = getCurrentBatchIndex(userId);
    
    if (currentBatchFlashcards && currentBatchFlashcards.length > 0) {
      // Check if we've exhausted the batch
      if (currentBatchIndex >= currentBatchFlashcards.length) {
        // Batch exhausted
        return res.json({ allCompleted: true, message: 'Batch completed', sessionSubtopics: [] });
      }
      
      // Get flashcards already shown in this session and today to prevent duplicates
      const shownFlashcardIds = getShownFlashcards(userId);
      const dailyShownFlashcardIds = getDailyShownFlashcards(userId);
      const shownSet = new Set([...shownFlashcardIds, ...dailyShownFlashcardIds]);
      
      // Build set of normalized texts of already shown flashcards (session + daily)
      const data = loadQuestions();
      const allQuestionsWithFlashcards = data.questions.filter(
        q => q.flashcard && q.flashcard.trim() !== ''
      );
      const shownFlashcardTexts = new Set();
      for (const q of allQuestionsWithFlashcards) {
        if (shownSet.has(q.id) && q.flashcard) {
          const normalizedText = q.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
          shownFlashcardTexts.add(normalizedText);
        }
      }
      
      // Build set of flashcard texts already served from THIS batch (prevent duplicates within batch)
      const batchServedTexts = new Set();
      for (let i = 0; i < currentBatchIndex; i++) {
        const servedId = currentBatchFlashcards[i];
        const servedQuestion = data.questions.find(q => q.id === servedId);
        if (servedQuestion && servedQuestion.flashcard) {
          const normalizedText = servedQuestion.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
          batchServedTexts.add(normalizedText);
        }
      }
      
      // Find next flashcard in batch that hasn't been shown in session/today AND hasn't been served from this batch
      let flashcardData = null;
      let nextIndex = currentBatchIndex;
      
      while (nextIndex < currentBatchFlashcards.length) {
        const flashcardId = currentBatchFlashcards[nextIndex];
        const question = data.questions.find(q => q.id === flashcardId);
        
        if (question && question.flashcard && question.flashcard.trim() !== '') {
          // Check if already shown in session or today by ID
          if (shownSet.has(flashcardId)) {
            nextIndex++;
            continue; // Skip this one, try next
          }
          
          // Check if already shown in session or today by text (normalized)
          const normalizedText = question.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
          if (shownFlashcardTexts.has(normalizedText)) {
            nextIndex++;
            continue; // Skip this one, try next
          }
          
          // Check if this flashcard text was already served from THIS batch
          if (batchServedTexts.has(normalizedText)) {
            nextIndex++;
            continue; // Skip this one, try next (duplicate within batch)
          }
          
          // This flashcard is valid - use it
          const topic = data.topics.find(t => t.id === question.topicId);
          flashcardData = {
            questionId: question.id,
            flashcard: question.flashcard,
            flashcardAnswer: question.flashcardAnswer || '',
            topic: topic ? topic.name : question.topicId,
            subTopic: question.subTopic || topic?.name || question.topicId,
            topicId: question.topicId,
            hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
          };
          break;
        }
        
        nextIndex++;
      }
      
      // If we found a valid flashcard, serve it
      if (flashcardData) {
        // Update batch index to skip over any duplicates we found
        // Set index to nextIndex + 1 so next call will check the next flashcard
        const users = loadUsers();
        if (users[userId] && users[userId].reviewData) {
          users[userId].reviewData.currentBatchIndex = nextIndex + 1;
          saveUsers(users);
        }
        
        // Mark as shown
        markFlashcardAsShown(userId, flashcardData.questionId);
        markFlashcardAsShownToday(userId, flashcardData.questionId);
        
        return res.json(flashcardData);
      } else {
        // All flashcards in batch were already shown today - clear batch and fall through to other priorities
        clearCurrentBatch(userId);
        // Fall through to Priority 1 (due reviews) or Priority 2 (new flashcards)
      }
    }
    
    // Priority 1: Check for due spaced repetition questions
    const dueQuestionIds = getAllDueQuestions(userId);
    if (dueQuestionIds.length > 0) {
      const data = loadQuestions();
      
      // Get flashcards already shown in this session and today
      const shownFlashcardIds = getShownFlashcards(userId);
      const dailyShownFlashcardIds = getDailyShownFlashcards(userId);
      const shownSet = new Set([...shownFlashcardIds, ...dailyShownFlashcardIds]);
      
      // Build set of normalized texts of already shown flashcards
      const shownFlashcardTexts = new Set();
      const allQuestionsWithFlashcards = data.questions.filter(
        q => q.flashcard && q.flashcard.trim() !== ''
      );
      for (const q of allQuestionsWithFlashcards) {
        if (shownSet.has(q.id) && q.flashcard) {
          const normalizedText = q.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
          shownFlashcardTexts.add(normalizedText);
        }
      }
      
      // Filter due flashcards, excluding already shown ones
      let questionsWithFlashcards = data.questions.filter(q => {
        if (!q.flashcard || q.flashcard.trim() === '') return false;
        if (!dueQuestionIds.includes(q.id)) return false;
        
        // Skip if already shown by ID
        if (shownSet.has(q.id)) return false;
        
        // Skip if already shown by text (normalized)
        const normalizedText = q.flashcard.trim().toLowerCase().replace(/\s+/g, ' ');
        if (shownFlashcardTexts.has(normalizedText)) return false;
        
        return true;
      });
      
      if (questionsWithFlashcards.length > 0) {
        const randomIndex = Math.floor(Math.random() * questionsWithFlashcards.length);
        const question = questionsWithFlashcards[randomIndex];
        const topic = data.topics.find(t => t.id === question.topicId);
        
        const flashcardData = {
          questionId: question.id,
          flashcard: question.flashcard,
          flashcardAnswer: question.flashcardAnswer,
          topic: topic ? topic.name : question.topicId,
          subTopic: question.subTopic || topic?.name || question.topicId,
          topicId: question.topicId,
          isDueReview: true,
          hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
        };
        
        // Mark this flashcard as shown in the current session and today to avoid repetition
        markFlashcardAsShown(userId, flashcardData.questionId);
        markFlashcardAsShownToday(userId, flashcardData.questionId);
        
        return res.json(flashcardData);
      }
    }
    
    // Check cooldown before Priority 2 (session subtopics)
    // Priority 1 (due reviews) bypasses cooldown as they're part of spaced repetition
    const batchCompletionTime = getBatchCompletionTime(userId);
    if (batchCompletionTime !== null) {
      const now = Date.now();
      const elapsed = now - batchCompletionTime;
      const cooldownMs = 5 * 60 * 1000; // 5 minutes
      
      if (elapsed < cooldownMs) {
        // Cooldown is still active - return error with cooldown info
        const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const remainingTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        return res.status(429).json({
          error: 'Cooldown active',
          message: 'Please wait for the cooldown timer to expire before loading new flashcards',
          canStart: false,
          remainingSeconds,
          remainingTime
        });
      }
    }
    
    // Priority 2: Check for due flashcard subtopics
    const dueSubtopics = getDueFlashcardSubtopics(userId);
    const sessionSubtopics = getSessionSubtopics(userId);
    const completedSubtopics = getCompletedSubtopics(userId);
    
    // If no session exists, return error (user should start session first)
    if (!sessionSubtopics || sessionSubtopics.length === 0) {
      return res.status(400).json({ 
        error: 'No active session. Please start a session first.',
        requiresSession: true
      });
    }
    
    // Check if this is a fresh session (no flashcards shown yet)
    const shownFlashcardIds = getShownFlashcards(userId);
    const isFreshSession = shownFlashcardIds.length === 0;
    
    // Filter session subtopics: include due ones and exclude completed ones only if they have no unshown flashcards
    const eligibleSubtopics = sessionSubtopics.filter(subtopic => {
      // Always include if due for review (maintains spaced repetition algorithm)
      if (dueSubtopics.includes(subtopic)) {
        return true;
      }
      // For fresh sessions, include all subtopics (since none have been shown yet)
      if (isFreshSession) {
        return true;
      }
      // For completed subtopics that are NOT due, check if they have unshown flashcards
      if (completedSubtopics.includes(subtopic) && !dueSubtopics.includes(subtopic)) {
        // Only exclude if there are no unshown flashcards in this subtopic
        return hasUnshownFlashcardsInSubtopic(subtopic, userId);
      }
      // Always include if not completed (existing behavior)
      return true;
    });
    
    // If no eligible subtopics but session has subtopics, check if we should include all
    // This handles the case where a new session starts but all subtopics are marked as completed
    // We should still allow access if there are flashcards available
    let finalEligibleSubtopics = eligibleSubtopics;
    if (eligibleSubtopics.length === 0 && sessionSubtopics.length > 0) {
      const data = loadQuestions();
      const allQuestionsWithFlashcards = data.questions.filter(
        q => q.flashcard && q.flashcard.trim() !== ''
      );
      const questionsInSessionSubtopics = allQuestionsWithFlashcards.filter(
        q => q.subTopic && sessionSubtopics.some(st => 
          q.subTopic.trim().toLowerCase() === st.trim().toLowerCase()
        )
      );
      // If there are flashcards in session subtopics, use all session subtopics
      if (questionsInSessionSubtopics.length > 0) {
        finalEligibleSubtopics = sessionSubtopics;
      }
    }
    
    // Select from entire database - getRandomFlashcardFromService already implements spaced repetition:
    // Priority 1: Due questions (bypasses filters, from entire database)
    // Priority 2: New flashcards (not in reviewData, from entire database)
    // Priority 3: All available flashcards (from entire database)
    let flashcard = getRandomFlashcardFromService(userId, null);
    
    // If still no flashcard found, check if all flashcards have been shown and reset if needed
    if (!flashcard) {
      const shownFlashcardIds = getShownFlashcards(userId);
      const data = loadQuestions();
      const allQuestionsWithFlashcards = data.questions.filter(
        q => q.flashcard && q.flashcard.trim() !== ''
      );
      
      // If there are flashcards but all have been shown, reset shownFlashcards
      if (allQuestionsWithFlashcards.length > 0 && shownFlashcardIds.length > 0) {
        // Check if all flashcards have been shown
        const allShown = allQuestionsWithFlashcards.every(q => shownFlashcardIds.includes(q.id));
        if (allShown) {
          // Reset shown flashcards to allow cycling through again
          const users = loadUsers();
          if (users[userId] && users[userId].reviewData) {
            users[userId].reviewData.shownFlashcards = [];
            saveUsers(users);
          }
          // Try again after reset - from entire CSV
          flashcard = getRandomFlashcardFromService(userId, null);
        }
      }
    }
    
    // Never return allCompleted - always try to return a flashcard
    // If no flashcard found after all attempts, reset shownFlashcards and try again
    if (!flashcard) {
      const data = loadQuestions();
      const allQuestionsWithFlashcards = data.questions.filter(
        q => q.flashcard && q.flashcard.trim() !== ''
      );
      
      // If there are no flashcards at all in the CSV, return error
      if (allQuestionsWithFlashcards.length === 0) {
        return res.status(404).json({ error: 'No flashcards available in the system' });
      }
      
      // Reset shown flashcards and try again from entire CSV
      const users = loadUsers();
      if (users[userId] && users[userId].reviewData) {
        users[userId].reviewData.shownFlashcards = [];
        saveUsers(users);
      }
      
      // Try one more time from entire CSV
      flashcard = getRandomFlashcardFromService(userId, null);
      
      // If still no flashcard, return a random one from CSV (bypass all filters)
      if (!flashcard && allQuestionsWithFlashcards.length > 0) {
        const randomIndex = Math.floor(Math.random() * allQuestionsWithFlashcards.length);
        const question = allQuestionsWithFlashcards[randomIndex];
        const topic = data.topics.find(t => t.id === question.topicId);
        
        flashcard = {
          questionId: question.id,
          flashcard: question.flashcard,
          flashcardAnswer: question.flashcardAnswer,
          topic: topic ? topic.name : question.topicId,
          subTopic: question.subTopic || topic?.name || question.topicId,
          topicId: question.topicId,
          hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
        };
      }
      
      // If we still don't have a flashcard, something is seriously wrong
      if (!flashcard) {
        return res.status(500).json({ error: 'Failed to fetch flashcard' });
      }
    }
    
    // Mark this flashcard as shown in the current session and today to avoid repetition
    markFlashcardAsShown(userId, flashcard.questionId);
    markFlashcardAsShownToday(userId, flashcard.questionId);
    
    return res.json(flashcard);
  } catch (err) {
    console.error('Error fetching random flashcard:', err);
    return res.status(500).json({ error: 'Failed to fetch flashcard' });
  }
}

/**
 * POST /flashcard/rate
 * Body: { questionId: string, difficulty: number (1-5) }
 * Updates per-user spaced repetition schedule based on difficulty rating
 * Returns: { difficulty: "Easy"|"Medium"|"Hard" }
 * @deprecated Use submitRating instead (requires JWT)
 */
export async function rateFlashcard(req, res) {
  try {
    const { questionId, difficulty } = req.body;
    const userId = req.userId; // Set by optionalAuth middleware
    
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }
    
    if (!difficulty || typeof difficulty !== 'number' || difficulty < 1 || difficulty > 5) {
      return res.status(400).json({ error: 'Invalid difficulty. Must be a number between 1 and 5.' });
    }
    
    const difficultyLevel = mapRatingToDifficulty(difficulty);
    
    // Update user's review data if authenticated
    if (userId) {
      const existingReview = getUserReviewData(userId)[questionId];
      
      updateUserReviewData(userId, questionId, {
        difficulty: difficultyLevel.toLowerCase(),
        lastAnswerCorrect: null, // Not applicable for rating
        nextReviewDate: null, // Will be set after follow-up answer
        timesReviewed: existingReview ? existingReview.timesReviewed : 1
      });
    } else {
      // Fallback to global review schedule if not authenticated
      updateReviewSchedule(questionId, difficultyLevel, true);
    }
    
    return res.json({ difficulty: difficultyLevel });
  } catch (err) {
    console.error('Error rating flashcard:', err);
    return res.status(500).json({ error: 'Failed to rate flashcard' });
  }
}

/**
 * POST /flashcard/submit-rating
 * Body: { questionId: string, rating: number (1-5) }
 * Requires JWT authentication
 * Stores flashcard rating in user's reviewData
 * Returns: { difficulty: "Easy"|"Medium"|"Hard" }
 */
export async function submitRating(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { questionId, rating } = req.body;
    
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }
    
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating. Must be a number between 1 and 5.' });
    }
    
    // Map rating to difficulty
    const difficultyLevel = mapRatingToDifficulty(rating);
    
    // Get existing review data
    const existingReview = getUserReviewData(userId)[questionId];
    
    // Calculate nextReviewDate based on rating (Easy→15min, Medium→25min, Hard→35min)
    // This assumes the answer will be correct - if incorrect, it will be overridden in submitAnswer
    const nextReviewDate = calculateNextReviewDate(true, difficultyLevel.toLowerCase());
    
    // Store rating in reviewData with nextReviewDate set based on rating
    // Don't increment timesReviewed yet - only after follow-up answer
    updateUserReviewData(userId, questionId, {
      difficulty: difficultyLevel.toLowerCase(),
      lastAnswerCorrect: null, // Not applicable for rating
      nextReviewDate: nextReviewDate.toISOString(), // Set based on rating (will be overridden if answer is incorrect)
      timesReviewed: existingReview ? existingReview.timesReviewed : 0 // Set to 0 for rating, will be set to 1 after answer
    });
    
    return res.json({ difficulty: difficultyLevel });
  } catch (err) {
    console.error('Error submitting rating:', err);
    return res.status(500).json({ error: 'Failed to submit rating' });
  }
}

/**
 * GET /question/followup/:topic/:difficulty
 * Returns a follow-up question based on topic and difficulty
 * Respects per-user spaced repetition scheduling
 * Implements fallback logic to find questions when exact match fails
 * Query params: ?subTopic=... (optional), ?flashcardQuestionId=... (optional)
 */
export async function getFollowUpQuestionJson(req, res) {
  try {
    const { topic, difficulty } = req.params;
    const subTopic = req.query.subTopic || null;
    const flashcardQuestionId = req.query.flashcardQuestionId || null;
    const userId = req.userId; // Set by optionalAuth middleware
    
    if (!topic || !difficulty) {
      return res.status(400).json({ error: 'Missing topic or difficulty parameter' });
    }
    
    // Validate difficulty
    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty. Must be Easy, Medium, or Hard.' });
    }
    
    // Try to get follow-up question with fallback logic
    const question = getFollowUpQuestionFromJson(topic, difficulty, userId, subTopic, flashcardQuestionId);
    
    if (!question) {
      // With fallback logic, this should be very rare - only if no questions exist for the topic at all
      return res.status(404).json({ 
        error: 'No follow-up questions available for this topic and difficulty',
        message: 'No questions found for this topic after trying all fallback strategies'
      });
    }
    
    return res.json(question);
  } catch (err) {
    console.error('Error fetching follow-up question:', err);
    return res.status(500).json({ 
      error: 'Failed to fetch follow-up question',
      message: err instanceof Error ? err.message : 'Unknown error occurred'
    });
  }
}

/**
 * POST /question/submit
 * Body: { questionId: string, selectedOption: string, flashcardQuestionId?: string, flashcardSubTopic?: string }
 * Returns: { correct: boolean, correctAnswer: string, explanation: string }
 * Updates per-user spaced repetition schedule
 * Also marks flashcard subtopic as completed and sets next review date
 * Requires JWT authentication
 */
export async function submitAnswer(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { questionId, selectedOption, flashcardQuestionId, flashcardSubTopic } = req.body;
    
    if (!questionId || !selectedOption) {
      return res.status(400).json({ error: 'Missing questionId or selectedOption' });
    }
    
    const result = validateAnswerFromJson(questionId, selectedOption);
    
    if (result.error) {
      return res.status(404).json(result);
    }
    
    // Get the actual question to determine its real difficulty (for fallback)
    const question = getQuestionById(questionId);
    let actualDifficulty = 'medium'; // default (lowercase for storage)
    
    if (question) {
      actualDifficulty = question.difficulty; // Already lowercase
    }
    
    // Get the difficulty from the flashcard rating (stored when rating was submitted)
    // This is the user's self-assessed difficulty, which should be used for spaced repetition
    let ratingDifficulty = null;
    if (flashcardQuestionId) {
      const flashcardReview = getUserReviewData(userId)[flashcardQuestionId];
      ratingDifficulty = flashcardReview?.difficulty || null;
    }
    
    // Use rating difficulty if available, otherwise fall back to question's difficulty
    // Normalize to lowercase for consistency
    const difficultyForReview = ratingDifficulty 
      ? String(ratingDifficulty).toLowerCase() 
      : actualDifficulty;
    
    // Calculate next review date using spaced repetition service
    // If answer is incorrect → nextReview = now + 5 minutes (overrides rating-based schedule)
    // If answer is correct → nextReview = now + (15/25/35 minutes based on rating difficulty)
    // This overrides the nextReviewDate that was set in submitRating if the answer is incorrect
    const nextReviewDate = calculateNextReviewDate(result.correct, difficultyForReview);
    
    // Get existing review data
    const existingReview = getUserReviewData(userId)[questionId];
    
    // Calculate timesReviewed - increment if exists, otherwise set to 1
    const timesReviewed = existingReview && existingReview.timesReviewed 
      ? existingReview.timesReviewed + 1 
      : 1;
    
    // Update user's reviewData (immediate persistence)
    // Store the difficulty that was used for the review calculation
    updateUserReviewData(userId, questionId, {
      difficulty: difficultyForReview,
      lastAnswerCorrect: result.correct,
      nextReviewDate: nextReviewDate.toISOString(),
      timesReviewed
    });
    
    // Also store review data for the flashcard question ID if provided
    // This ensures incorrectly answered flashcards appear as due after the day shift
    if (flashcardQuestionId && flashcardQuestionId.trim() !== '') {
      // Get existing review data for flashcard
      const flashcardExistingReview = getUserReviewData(userId)[flashcardQuestionId];
      
      // Calculate timesReviewed for flashcard - increment if exists, otherwise set to 1
      const flashcardTimesReviewed = flashcardExistingReview && flashcardExistingReview.timesReviewed 
        ? flashcardExistingReview.timesReviewed + 1 
        : 1;
      
      // Preserve existing difficulty if it exists, otherwise use difficultyForReview
      // This ensures difficulty consistency - only update if user explicitly rates again
      const flashcardDifficulty = flashcardExistingReview?.difficulty || difficultyForReview;
      
      // Store review data for the flashcard with the same nextReviewDate
      // This ensures the flashcard will appear as due when the review date arrives
      updateUserReviewData(userId, flashcardQuestionId, {
        difficulty: flashcardDifficulty,
        lastAnswerCorrect: result.correct,
        nextReviewDate: nextReviewDate.toISOString(),
        timesReviewed: flashcardTimesReviewed
      });
    }
    
    // If this is a follow-up question from a flashcard, mark the flashcard subtopic as completed
    if (flashcardSubTopic && flashcardSubTopic.trim() !== '') {
      // Use the same rating difficulty for subtopic calculation
      const subtopicRatingDifficulty = ratingDifficulty || 'medium';
      
      // Calculate next review date for subtopic based on follow-up answer correctness and rating difficulty
      const subtopicNextReviewDate = calculateSubtopicNextReviewDate(result.correct, subtopicRatingDifficulty);
      
      // Mark subtopic as completed and set next review date
      markSubtopicCompleted(userId, flashcardSubTopic, subtopicNextReviewDate.toISOString());
    }
    
    return res.json(result);
  } catch (err) {
    console.error('Error submitting answer:', err);
    return res.status(500).json({ error: 'Failed to submit answer' });
  }
}

/**
 * GET /flashcards/next-question
 * Returns the next question for logged-in user (prioritizes due reviews)
 * Requires JWT authentication
 */
export async function getNextQuestion(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get all due questions for user
    const dueQuestionIds = getAllDueQuestions(userId);
    
    if (dueQuestionIds.length === 0) {
      // No due questions - return empty (continue with flashcard flow)
      return res.status(204).send(); // 204 No Content
    }
    
    // Load all questions
    const data = loadQuestions();
    
    // Find questions that are due
    const dueQuestions = data.questions.filter(q => dueQuestionIds.includes(q.id));
    
    if (dueQuestions.length === 0) {
      return res.status(204).send(); // 204 No Content
    }
    
    // Pick random due question
    const randomIndex = Math.floor(Math.random() * dueQuestions.length);
    const question = dueQuestions[randomIndex];
    
    // Format as flashcard if it has flashcard field, otherwise format as question
    if (question.flashcard) {
      const topic = data.topics.find(t => t.id === question.topicId);
      const flashcardData = {
        questionId: question.id,
        flashcard: question.flashcard,
        flashcardAnswer: question.flashcardAnswer,
        topic: topic ? topic.name : question.topicId,
        subTopic: question.subTopic || topic?.name || question.topicId,
        topicId: question.topicId,
        isDueReview: true
      };
      
      // Mark this flashcard as shown in the current session and today to avoid repetition
      markFlashcardAsShown(userId, flashcardData.questionId);
      markFlashcardAsShownToday(userId, flashcardData.questionId);
      
      return res.json(flashcardData);
    } else {
      // Format as question
      const options = {};
      const optionLabels = ['A', 'B', 'C', 'D'];
      question.options.forEach((opt, idx) => {
        if (idx < optionLabels.length) {
          options[optionLabels[idx]] = opt;
        }
      });
      
      return res.json({
        questionId: question.id,
        question: question.question,
        options,
        key: optionLabels[question.answerIndex] || 'A',
        explanation: question.explanation,
        difficulty: question.difficulty,
        topic: question.topicId,
        isDueReview: true
      });
    }
  } catch (err) {
    console.error('Error fetching next question:', err);
    return res.status(500).json({ error: 'Failed to fetch next question' });
  }
}

/**
 * GET /flashcards/due-reviews
 * Returns all questions due for review for authenticated user
 * Requires JWT authentication
 */
export async function getDueReviews(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get all due questions for user
    const dueQuestionIds = getAllDueQuestions(userId);
    
    if (dueQuestionIds.length === 0) {
      return res.json({ dueQuestions: [], count: 0 });
    }
    
    // Load all questions and review data
    const data = loadQuestions();
    const reviewData = getUserReviewData(userId);
    
    // Build response with question details and review metadata
    const dueQuestions = dueQuestionIds.map(questionId => {
      const question = data.questions.find(q => q.id === questionId);
      const review = reviewData[questionId];
      
      if (!question) {
        return null;
      }
      
      return {
        questionId: question.id,
        question: question.question,
        topicId: question.topicId,
        difficulty: review?.difficulty || question.difficulty,
        timesReviewed: review?.timesReviewed || 0,
        lastAnswerCorrect: review?.lastAnswerCorrect,
        nextReviewDate: review?.nextReviewDate
      };
    }).filter(q => q !== null);
    
    return res.json({
      dueQuestions,
      count: dueQuestions.length
    });
  } catch (err) {
    console.error('Error fetching due reviews:', err);
    return res.status(500).json({ error: 'Failed to fetch due reviews' });
  }
}

/**
 * GET /flashcards/concepts
 * Returns all flashcards/concepts from CSV file grouped by topic
 * Used for conceptual learning flow
 */
export async function getConcepts(req, res) {
  try {
    console.log('Fetching concepts from CSV file...');
    const data = loadQuestions();
    
    if (!data || !data.questions || data.questions.length === 0) {
      console.error('No questions loaded from CSV file');
      return res.status(404).json({ error: 'No questions found in CSV file' });
    }
    
    console.log(`Loaded ${data.questions.length} questions from CSV`);
    
    // Filter questions that have flashcard data
    const questionsWithFlashcards = data.questions.filter(
      q => q.flashcard && q.flashcard.trim() !== '' && q.flashcardAnswer && q.flashcardAnswer.trim() !== ''
    );
    
    console.log(`Found ${questionsWithFlashcards.length} questions with flashcard data`);
    
    if (questionsWithFlashcards.length === 0) {
      return res.status(404).json({ error: 'No concepts available in CSV file. Ensure the CSV has Flashcard and Answer columns filled.' });
    }
    
    // Group by topic and create concept objects
    const conceptsByTopic = new Map();
    
    for (const question of questionsWithFlashcards) {
      const topicId = question.topicId;
      
      if (!conceptsByTopic.has(topicId)) {
        const topic = data.topics.find(t => t.id === topicId);
        conceptsByTopic.set(topicId, {
          topicId,
          topicName: topic ? topic.name : topicId,
          concepts: []
        });
      }
      
      const concept = {
        id: question.id,
        question: question.flashcard,
        answer: question.flashcardAnswer,
        explanation: question.explanation || '',
        topicId: question.topicId,
        subTopic: question.subTopic || '',
        difficulty: question.difficulty
      };
      
      conceptsByTopic.get(topicId).concepts.push(concept);
    }
    
    // Convert to array and flatten concepts
    const allConcepts = Array.from(conceptsByTopic.values())
      .flatMap(topicGroup => topicGroup.concepts.map(concept => ({
        ...concept,
        topicName: topicGroup.topicName
      })));
    
    console.log(`Returning ${allConcepts.length} concepts from CSV`);
    return res.json({ concepts: allConcepts });
  } catch (err) {
    console.error('Error fetching concepts from CSV:', err);
    return res.status(500).json({ error: `Failed to fetch concepts: ${err.message}` });
  }
}

/**
 * GET /flashcards/check-new-batch
 * Checks if a new batch is available after day shift completion
 * Requires JWT authentication
 * Returns: { available: boolean, message?: string }
 */
export async function checkNewBatch(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const dayShiftCompleted = isDayShiftCompleted(userId);
    
    return res.json({
      available: dayShiftCompleted,
      message: dayShiftCompleted 
        ? 'New batch available! Start a new session to review incorrectly answered flashcards.' 
        : 'No new batch available yet. Complete your current session first.'
    });
  } catch (err) {
    console.error('Error checking new batch:', err);
    return res.status(500).json({ error: 'Failed to check new batch availability' });
  }
}

/**
 * POST /flashcards/complete-batch
 * Stores the batch completion time when a batch of 6 flashcards is completed
 * Moves current batch to previous batches
 * Requires JWT authentication
 * Body: { timestamp: number } - timestamp in milliseconds since epoch
 * Returns: { success: boolean, message?: string }
 */
export async function completeBatch(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { timestamp } = req.body;
    
    if (!timestamp || typeof timestamp !== 'number') {
      return res.status(400).json({ error: 'timestamp is required and must be a number' });
    }
    
    // STRICT VALIDATION: Check if there's already an active cooldown
    const existingCompletionTime = getBatchCompletionTime(userId);
    if (existingCompletionTime !== null) {
      const now = Date.now();
      const elapsed = now - existingCompletionTime;
      const cooldownMs = 5 * 60 * 1000; // 5 minutes
      
      if (elapsed < cooldownMs) {
        // Cooldown is still active - reject this request to prevent manipulation
        const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const remainingTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        return res.status(429).json({
          error: 'Cooldown already active',
          message: 'You cannot complete another batch while cooldown is active',
          canStart: false,
          remainingSeconds,
          remainingTime
        });
      }
    }
    
    // Validate timestamp is not in the future (prevent manipulation)
    const now = Date.now();
    if (timestamp > now + 1000) { // Allow 1 second tolerance for clock skew
      return res.status(400).json({ 
        error: 'Invalid timestamp',
        message: 'Timestamp cannot be in the future'
      });
    }
    
    // Validate timestamp is not too old (prevent replay attacks)
    const maxAge = 60 * 1000; // 60 seconds
    if (now - timestamp > maxAge) {
      return res.status(400).json({
        error: 'Invalid timestamp',
        message: 'Timestamp is too old. Please complete batch immediately after finishing.'
      });
    }
    
    // Get current batch flashcard IDs
    const currentBatchFlashcards = getCurrentBatchFlashcards(userId);
    
    // Move current batch to previous batches if it exists
    if (currentBatchFlashcards && currentBatchFlashcards.length > 0) {
      const addSuccess = addToPreviousBatches(userId, currentBatchFlashcards);
      if (!addSuccess) {
        console.error('Failed to add current batch to previous batches');
      }
      
      // Clear current batch
      const clearSuccess = clearCurrentBatch(userId);
      if (!clearSuccess) {
        console.error('Failed to clear current batch');
      }
    }
    
    // Store batch completion time
    const success = setBatchCompletionTime(userId, timestamp);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to store batch completion time' });
    }
    
    return res.json({
      success: true,
      message: 'Batch completion time stored successfully',
      cooldownSeconds: 300 // 5 minutes
    });
  } catch (err) {
    console.error('Error storing batch completion time:', err);
    return res.status(500).json({ error: 'Failed to store batch completion time' });
  }
}

/**
 * POST /flashcards/create-new-batch
 * Creates a new batch after day shift completion
 * Uses batch composition algorithm: incorrect flashcards first, then random (total 6)
 * Requires JWT authentication
 * Returns: { sessionSubtopics: string[], isNewSession: boolean }
 */
export async function createNewBatch(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Use batch composition algorithm to create session with 6 flashcards
    // This will prioritize incorrectly answered flashcards if day shift has completed,
    // otherwise it will use random flashcards
    const batch = composeBatch(userId, 6);
    
    if (batch.subtopics.length === 0) {
      // If no subtopics from batch composition, fall back to random selection
      const allSubtopics = getAllUniqueSubtopics();
      if (allSubtopics.length === 0) {
        return res.status(404).json({ error: 'No subtopics available' });
      }
      
      // Pick 6 random subtopics
      batch.subtopics = pickRandomSubtopics(6);
    }
    
    // Store session in user's reviewData (this also resets shownFlashcards)
    const success = startNewSession(userId, batch.subtopics);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to create new batch' });
    }
    
    return res.json({
      sessionSubtopics: batch.subtopics,
      isNewSession: true,
      message: 'New batch created successfully!'
    });
  } catch (err) {
    console.error('Error creating new batch:', err);
    return res.status(500).json({ error: 'Failed to create new batch' });
  }
}

/**
 * GET /flashcards/get-batch
 * Gets a new batch of exactly 6 flashcards
 * Checks cooldown before generating batch
 * Requires JWT authentication
 * Returns: { flashcards: FlashcardData[], batchSize: number } or error with cooldown info
 */
export async function getBatch(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check cooldown
    const batchCompletionTime = getBatchCompletionTime(userId);
    if (batchCompletionTime !== null) {
      const now = Date.now();
      const elapsed = now - batchCompletionTime;
      const cooldownMs = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (elapsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const remainingTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        return res.status(429).json({
          error: 'Cooldown active',
          canStart: false,
          remainingSeconds,
          remainingTime
        });
      }
    }
    
    // Cooldown expired or no completion time - generate new batch
    const batch = composeBatch(userId, 6);
    
    if (!batch.flashcardIds || batch.flashcardIds.length === 0) {
      return res.status(404).json({ error: 'No flashcards available for batch' });
    }
    
    // Load full flashcard data for each ID
    const data = loadQuestions();
    const flashcards = [];
    
    for (const flashcardId of batch.flashcardIds) {
      const question = data.questions.find(q => q.id === flashcardId);
      if (question && question.flashcard && question.flashcard.trim() !== '') {
        const topic = data.topics.find(t => t.id === question.topicId);
        flashcards.push({
          questionId: question.id,
          flashcard: question.flashcard,
          flashcardAnswer: question.flashcardAnswer || '',
          topic: topic ? topic.name : question.topicId,
          subTopic: question.subTopic || topic?.name || question.topicId,
          topicId: question.topicId,
          hint: topic?.hint || `Learn fundamental concepts and applications of ${topic ? topic.name : question.topicId}.`
        });
      }
    }
    
    // Store batch IDs in user data and reset batch index to 0
    // setCurrentBatchFlashcards also resets currentBatchIndex to 0
    const success = setCurrentBatchFlashcards(userId, batch.flashcardIds);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to store batch data' });
    }
    
    // IMPORTANT: Clear batchCompletionTime since cooldown has expired and new batch is starting
    // This prevents the timer from showing old completion time
    setBatchCompletionTime(userId, null);
    
    return res.json({
      flashcards,
      batchSize: flashcards.length
    });
  } catch (err) {
    console.error('Error getting batch:', err);
    return res.status(500).json({ error: 'Failed to get batch' });
  }
}

/**
 * GET /flashcards/get-cooldown
 * Gets the current cooldown status for the user
 * Requires JWT authentication
 * Returns: { canStart: boolean, remainingSeconds: number, remainingTime: string }
 */
export async function getUserCooldown(req, res) {
  try {
    const userId = req.userId; // Set by authenticateUser middleware (required)
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const batchCompletionTime = getBatchCompletionTime(userId);
    
    // If no completion time, user can start immediately
    if (batchCompletionTime === null) {
      return res.json({
        canStart: true,
        remainingSeconds: 0,
        remainingTime: '00:00'
      });
    }
    
    // Calculate elapsed time
    const now = Date.now();
    const elapsed = now - batchCompletionTime;
    const cooldownMs = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (elapsed >= cooldownMs) {
      // Cooldown expired
      return res.json({
        canStart: true,
        remainingSeconds: 0,
        remainingTime: '00:00'
      });
    } else {
      // Cooldown still active
      const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      const remainingTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      return res.json({
        canStart: false,
        remainingSeconds,
        remainingTime
      });
    }
  } catch (err) {
    console.error('Error getting cooldown:', err);
    return res.status(500).json({ error: 'Failed to get cooldown status' });
  }
}

