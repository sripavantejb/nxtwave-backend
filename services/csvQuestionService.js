import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, '../topics_until_percentages.csv');

let cachedData = null;

/**
 * Generate topic ID from topic name (slug conversion)
 * @param {string} topicName - Topic name
 * @returns {string} Topic ID (slug)
 */
function generateTopicId(topicName) {
  return String(topicName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Convert answer key to index (0-3)
 * @param {string} key - Answer key (e.g., "Option A", "Option B", "A", "B")
 * @returns {number} Answer index (0-3) or -1 if invalid
 */
function answerKeyToIndex(key) {
  const value = String(key || '').trim().toLowerCase();
  if (value.includes('option a')) return 0;
  if (value.includes('option b')) return 1;
  if (value.includes('option c')) return 2;
  if (value.includes('option d')) return 3;
  if (value === 'a') return 0;
  if (value === 'b') return 1;
  if (value === 'c') return 2;
  if (value === 'd') return 3;
  return -1;
}

/**
 * Normalize difficulty level to lowercase
 * @param {string} difficulty - Difficulty level from CSV
 * @returns {string} Normalized difficulty (easy, medium, hard)
 */
function normalizeDifficulty(difficulty) {
  const diff = String(difficulty || 'medium').toLowerCase().trim();
  if (diff.startsWith('e')) return 'easy';
  if (diff.startsWith('h')) return 'hard';
  return 'medium';
}

/**
 * Load and parse CSV file, convert to JSON structure
 * @returns {Object} Object containing topics and questions arrays
 */
export function loadQuestionsFromCSV() {
  // Return cached data if available
  if (cachedData) {
    console.log(`Using cached CSV data: ${cachedData.questions.length} questions, ${cachedData.topics.length} topics`);
    return cachedData;
  }

  try {
    console.log(`Loading questions from CSV file: ${CSV_PATH}`);
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`CSV file not found at: ${CSV_PATH}`);
      console.error(`Current working directory: ${process.cwd()}`);
      console.error(`__dirname: ${__dirname}`);
      return { topics: [], questions: [] };
    }

    console.log(`CSV file found, reading content...`);
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    
    // Parse CSV with headers
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (!Array.isArray(records) || records.length === 0) {
      console.warn('No records found in CSV file');
      return { topics: [], questions: [] };
    }

    const topicsMap = new Map();
    const questions = [];
    const questionCounters = {}; // Track counters per topic-difficulty

    for (const row of records) {
      const topicName = row['Topic']?.trim() || '';
      const subTopic = row['Sub-Topic']?.trim() || '';
      const flashcard = row['Flashcard']?.trim() || '';
      const flashcardAnswer = row['Answer']?.trim() || '';
      const questionText = row['Question']?.trim() || '';
      const difficultyRaw = row['Difficulty level']?.trim() || 'Medium';
      const optionA = row['Option A']?.trim() || '';
      const optionB = row['Option B']?.trim() || '';
      const optionC = row['Option C']?.trim() || '';
      const optionD = row['Option D']?.trim() || '';
      const key = row['Key']?.trim() || '';
      const explanation = row['Explanation']?.trim() || '';

      // Skip rows without topic or question
      if (!topicName || !questionText) {
        continue;
      }

      // Generate topic ID and add to topics map
      const topicId = generateTopicId(topicName);
      if (!topicsMap.has(topicId)) {
        topicsMap.set(topicId, {
          id: topicId,
          name: topicName,
          description: `Master ${topicName} concepts including various problem-solving techniques.`,
          hint: `Learn fundamental concepts and applications of ${topicName}.`
        });
      }

      // Normalize difficulty
      const difficulty = normalizeDifficulty(difficultyRaw);

      // Generate question ID
      const counterKey = `${topicId}-${difficulty}`;
      if (!questionCounters[counterKey]) {
        questionCounters[counterKey] = 0;
      }
      questionCounters[counterKey]++;

      const topicPrefix = topicId.substring(0, 3);
      const difficultyChar = difficulty.charAt(0);
      const questionId = `${topicPrefix}-${difficultyChar}-${questionCounters[counterKey]}`;

      // Convert answer key to index
      const answerIndex = answerKeyToIndex(key);
      const finalAnswerIndex = answerIndex >= 0 ? answerIndex : 0;

      // Build options array, filter out empty options
      const options = [optionA, optionB, optionC, optionD].filter(opt => opt && opt.trim() !== '');

      // Only add question if it has at least 2 options
      if (options.length < 2) {
        continue;
      }

      // Create question object
      const question = {
        id: questionId,
        topicId: topicId,
        subTopic: subTopic || topicName,
        difficulty: difficulty,
        question: questionText,
        options: options,
        answerIndex: finalAnswerIndex,
        explanation: explanation
      };

      // Add flashcard fields if present
      if (flashcard) {
        question.flashcard = flashcard;
      }
      if (flashcardAnswer) {
        question.flashcardAnswer = flashcardAnswer;
      }

      questions.push(question);
    }

    // Convert topics map to array
    const topics = Array.from(topicsMap.values());

    console.log(`Successfully loaded ${questions.length} questions and ${topics.length} topics from CSV file`);
    cachedData = { topics, questions };
    return cachedData;
  } catch (error) {
    console.error('Error loading CSV file:', error);
    return { topics: [], questions: [] };
  }
}

/**
 * Clear cached data (useful for testing or reloading)
 */
export function clearCache() {
  cachedData = null;
}

