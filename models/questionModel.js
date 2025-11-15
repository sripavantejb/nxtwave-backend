import { loadQuestionsFromCSV } from '../services/csvQuestionService.js';

function loadQuestionsFromFile() {
  // Use CSV service - single source of truth
  const data = loadQuestionsFromCSV();
  return data.questions || [];
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

  // Use CSV-based data only - fast and reliable
  const allQuestions = loadQuestionsFromFile();
  const fileResults = filterLocalQuestions(allQuestions, normalized);
  
  return fileResults;
}

export async function findQuestionsByTopic(topicId) {
  const topicIds = topicId === 'si-ci' ? ['si', 'ci'] : [topicId];
  return findQuestions({ topicIds });
}

