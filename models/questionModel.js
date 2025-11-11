import { getDb, connectToDatabase } from '../config/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedQuestions = null;

function loadQuestionsFromFile() {
  if (cachedQuestions) return cachedQuestions;

  try {
    const dataPath = join(__dirname, '../data/questions.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf8'));
    cachedQuestions = data.questions || [];
    return cachedQuestions;
  } catch (err) {
    console.error('Error loading questions from file:', err.message);
    return [];
  }
}

function filterLocalQuestions(questions, { topicIds, difficulties, excludeIds }) {
  let filtered = questions;
  if (topicIds?.length) {
    const topicsSet = new Set(topicIds);
    filtered = filtered.filter(q => topicsSet.has(q.topicId));
  }
  if (difficulties?.length) {
    const diffSet = new Set(difficulties);
    filtered = filtered.filter(q => diffSet.has(q.difficulty));
  }
  if (excludeIds?.length) {
    const excludeSet = new Set(excludeIds);
    filtered = filtered.filter(q => !excludeSet.has(q.id));
  }
  return filtered;
}

function normalizeFilters(filters = {}) {
  const topicIds = filters.topicIds?.filter(Boolean) ?? [];
  const difficulties = filters.difficulties?.filter(Boolean) ?? [];
  const excludeIds = filters.excludeIds?.filter(Boolean) ?? [];
  return { topicIds, difficulties, excludeIds };
}

export async function findQuestions(filters = {}) {
  const normalized = normalizeFilters(filters);

  try {
    let db;
    try {
      db = getDb();
    } catch (_err) {
      db = await connectToDatabase();
    }

    const query = {};
    if (normalized.topicIds.length === 1) {
      query.topicId = normalized.topicIds[0];
    } else if (normalized.topicIds.length > 1) {
      query.topicId = { $in: normalized.topicIds };
    }

    if (normalized.difficulties.length === 1) {
      query.difficulty = normalized.difficulties[0];
    } else if (normalized.difficulties.length > 1) {
      query.difficulty = { $in: normalized.difficulties };
    }

    if (normalized.excludeIds.length === 1) {
      query.id = { $ne: normalized.excludeIds[0] };
    } else if (normalized.excludeIds.length > 1) {
      query.id = { $nin: normalized.excludeIds };
    }

    const results = await db.collection('questions').find(query).toArray();
    if (results.length > 0) {
      return results;
    }

    // Fall back to local data if database query returned no matches
    const allQuestions = loadQuestionsFromFile();
    const fallback = filterLocalQuestions(allQuestions, normalized);
    if (fallback.length > 0) {
      return fallback;
    }

    return results;
  } catch (err) {
    console.warn('Database unavailable, falling back to local data for questions:', err.message);
    const allQuestions = loadQuestionsFromFile();
    return filterLocalQuestions(allQuestions, normalized);
  }
}

export async function findQuestionsByTopic(topicId) {
  const topicIds = topicId === 'si-ci' ? ['si', 'ci'] : [topicId];
  return findQuestions({ topicIds });
}

