import { loadQuestionsFromCSV } from '../services/csvQuestionService.js';

function loadTopicsFromFile() {
  // Use CSV service - single source of truth
  const data = loadQuestionsFromCSV();
  return data.topics || [];
}

export async function findAllTopics() {
  // Use CSV-based data only - fast and reliable
  return loadTopicsFromFile();
}


