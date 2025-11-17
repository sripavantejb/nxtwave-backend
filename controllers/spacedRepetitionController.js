import { loadQuestions } from '../services/flashcardJsonService.js';
import { getUserReviewSchedule, updateUserReviewSchedule } from '../services/userService.js';

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function pickRandom(items = []) {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function getTopicName(topics, topicId) {
  const topic = topics.find(t => t.id === topicId);
  return topic ? topic.name : topicId;
}

function mapRatingToDifficultySlug(rating) {
  if (rating <= 2) return 'easy';
  if (rating <= 4) return 'medium';
  return 'hard';
}

function formatOptions(options = []) {
  const formatted = {};
  options.forEach((option, idx) => {
    if (idx < OPTION_KEYS.length) {
      formatted[OPTION_KEYS[idx]] = option;
    }
  });
  return formatted;
}

function answerIndexToKey(answerIndex = 0) {
  return OPTION_KEYS[answerIndex] || 'A';
}

function normalizeSelectedOption(selectedOption) {
  if (typeof selectedOption !== 'string') {
    return '';
  }
  const trimmed = selectedOption.trim().toUpperCase();
  if (!trimmed) {
    return '';
  }
  const optionMatch = trimmed.match(/^OPTION\s+([A-Z])$/);
  if (optionMatch) {
    return optionMatch[1];
  }
  return trimmed[0];
}

function addMinutes(minutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function getNextReviewDateFromAnswer(difficultySlug, isCorrect) {
  if (!isCorrect) {
    // Wrong answer → 1 day = 5 minutes
    return addMinutes(5);
  }
  switch (difficultySlug) {
    case 'easy':
      // Easy → 3 days = 15 minutes
      return addMinutes(15);
    case 'medium':
      // Medium → 5 days = 25 minutes
      return addMinutes(25);
    case 'hard':
      // Hard → 7 days = 35 minutes
      return addMinutes(35);
    default:
      // Default to easy → 3 days = 15 minutes
      return addMinutes(15);
  }
}

function getNextReviewDateFromRating(rating) {
  if (rating <= 2) {
    // Rating ≤ 2 → 1 day = 5 minutes
    return addMinutes(5);
  }
  if (rating <= 4) {
    // Rating ≤ 4 → 3 days = 15 minutes
    return addMinutes(15);
  }
  // Rating > 4 → 7 days = 35 minutes
  return addMinutes(35);
}

function buildTimesReviewed(existingReview) {
  return (existingReview?.timesReviewed || 0) + 1;
}

function handleMissingQuestion(res) {
  return res.status(404).json({ error: 'Question not found' });
}

export function getNextFlashcardForUser(req, res) {
  const data = loadQuestions();
  const flashcards = data.questions.filter(q => q.flashcard && q.flashcard.trim() !== '');

  if (flashcards.length === 0) {
    return res.status(404).json({ error: 'No flashcards available' });
  }

  const selected = pickRandom(flashcards);
  const topicName = getTopicName(data.topics, selected.topicId);

  return res.json({
    questionId: selected.id,
    flashcard: selected.flashcard,
    answer: selected.flashcardAnswer || '',
    topic: topicName,
    subTopic: selected.subTopic || topicName
  });
}

export function rateFlashcardForUser(req, res) {
  const userId = req.userId;
  const { questionId, difficulty } = req.body;
  const numericDifficulty = Number(difficulty);

  if (!questionId) {
    return res.status(400).json({ error: 'questionId is required' });
  }
  if (!Number.isFinite(numericDifficulty) || numericDifficulty < 1 || numericDifficulty > 5) {
    return res.status(400).json({ error: 'difficulty must be a number between 1 and 5' });
  }

  const data = loadQuestions();
  const question = data.questions.find(q => q.id === questionId);

  if (!question) {
    return handleMissingQuestion(res);
  }

  const reviewSchedule = getUserReviewSchedule(userId);
  const existingReview = reviewSchedule[questionId];
  const nextReviewDate = getNextReviewDateFromRating(numericDifficulty);

  updateUserReviewSchedule(userId, questionId, {
    nextReviewDate,
    lastAnswerCorrect: existingReview?.lastAnswerCorrect ?? null,
    timesReviewed: buildTimesReviewed(existingReview),
    lastDifficulty: numericDifficulty
  });

  return res.json({ success: true, nextReviewDate });
}

export function getNextQuestionForUser(req, res) {
  const { questionId, difficulty } = req.body;
  const numericDifficulty = Number(difficulty);

  if (!questionId) {
    return res.status(400).json({ error: 'questionId is required' });
  }
  if (!Number.isFinite(numericDifficulty) || numericDifficulty < 1 || numericDifficulty > 5) {
    return res.status(400).json({ error: 'difficulty must be a number between 1 and 5' });
  }

  const data = loadQuestions();
  const baseQuestion = data.questions.find(q => q.id === questionId);

  if (!baseQuestion) {
    return handleMissingQuestion(res);
  }

  const targetDifficulty = mapRatingToDifficultySlug(numericDifficulty);
  let candidates = data.questions.filter(
    q => q.id !== baseQuestion.id &&
      q.topicId === baseQuestion.topicId &&
      q.difficulty === targetDifficulty
  );

  if (baseQuestion.subTopic) {
    const subTopicMatches = candidates.filter(q => q.subTopic === baseQuestion.subTopic);
    if (subTopicMatches.length > 0) {
      candidates = subTopicMatches;
    }
  }

  if (candidates.length === 0) {
    return res.status(404).json({ error: 'No follow-up questions available' });
  }

  const nextQuestion = pickRandom(candidates);

  return res.json({
    questionId: nextQuestion.id,
    question: nextQuestion.question,
    options: formatOptions(nextQuestion.options),
    correctKey: answerIndexToKey(nextQuestion.answerIndex),
    explanation: nextQuestion.explanation || 'Explanation not available.'
  });
}

export function submitSpacedAnswer(req, res) {
  const userId = req.userId;
  const { questionId, selectedOption } = req.body;

  if (!questionId || !selectedOption) {
    return res.status(400).json({ error: 'questionId and selectedOption are required' });
  }

  const normalizedOption = normalizeSelectedOption(selectedOption);
  if (!normalizedOption) {
    return res.status(400).json({ error: 'selectedOption must identify a choice (e.g., "A" or "Option A")' });
  }

  const data = loadQuestions();
  const question = data.questions.find(q => q.id === questionId);

  if (!question) {
    return handleMissingQuestion(res);
  }

  const correctKey = answerIndexToKey(question.answerIndex);
  const isCorrect = normalizedOption === correctKey;
  const reviewSchedule = getUserReviewSchedule(userId);
  const existingReview = reviewSchedule[questionId];
  const nextReviewDate = getNextReviewDateFromAnswer(question.difficulty, isCorrect);

  updateUserReviewSchedule(userId, questionId, {
    nextReviewDate,
    lastAnswerCorrect: isCorrect,
    timesReviewed: buildTimesReviewed(existingReview),
    lastDifficulty: question.difficulty
  });

  return res.json({
    correct: isCorrect,
    explanation: question.explanation || 'Explanation not available.'
  });
}
