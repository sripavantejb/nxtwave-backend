import { findQuestions } from '../models/questionModel.js';
import { findAllTopics } from '../models/topicModel.js';
import {
  pickRandomQuestion,
  pickFollowUpQuestion,
  toFlashcardPayload
} from '../services/flashcardService.js';

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

    const picked = pickRandomQuestion(questions);
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


