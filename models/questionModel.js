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

  // Use file-based data first for maximum speed (100x faster than DB)
  const allQuestions = loadQuestionsFromFile();
  const fileResults = filterLocalQuestions(allQuestions, normalized);
  if (fileResults.length > 0) {
    return fileResults;
  }

  // Only try database if file-based data has no matches
  try {
    let db;
    try {
      db = getDb();
    } catch (_err) {
      // Skip DB connection if it fails - use file data instead
      return fileResults;
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

    // Use Promise.race to timeout DB query quickly
    const dbQuery = db.collection('questions').find(query).toArray();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DB timeout')), 1000)
    );
    
    const results = await Promise.race([dbQuery, timeoutPromise]);
    if (results && results.length > 0) {
      return results;
    }

    return fileResults;
  } catch (err) {
    // Always fall back to fast file-based data
    return fileResults;
  }
}

export async function findQuestionsByTopic(topicId) {
  const topicIds = topicId === 'si-ci' ? ['si', 'ci'] : [topicId];
  return findQuestions({ topicIds });
}

