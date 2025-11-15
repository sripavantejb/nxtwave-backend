import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Complete dataset - paste your entire spreadsheet data here between the backticks
const completeDataset = `your complete TSV data here`;

function generateTopicId(topicName) {
  return topicName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9-]/g, '');
}

function getAnswerIndex(key) {
  const match = key.match(/Option ([A-D])/i);
  if (!match) return 0;
  return match[1].charCodeAt(0) - 'A'.charCodeAt(0);
}

function cleanQuotes(text) {
  if (!text) return '';
  // Remove surrounding quotes if present
  return text.trim().replace(/^["']|["']$/g, '');
}

function parseTSVLine(line) {
  // Handle TSV with quoted fields containing tabs and newlines
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === '\t' && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField); // Add last field
  
  return fields.map(f => f.trim());
}

function processCompleteData(tsvData) {
  const lines = tsvData.split('\n');
  const headers = parseTSVLine(lines[0]);
  
  const topicsMap = new Map();
  const questions = [];
  const counters = {}; // Track question numbers per topic-difficulty
  
  console.log(`Processing ${lines.length - 1} rows...`);
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const fields = parseTSVLine(line);
    if (fields.length < 12) {
      console.warn(`Skipping line ${i + 1}: insufficient fields`);
      continue;
    }
    
    const [topic, subTopic, flashcard, answer, question, difficulty, 
           optionA, optionB, optionC, optionD, key, explanation] = fields;
    
    if (!topic || !question) {
      console.warn(`Skipping line ${i + 1}: missing required fields`);
      continue;
    }
    
    const topicId = generateTopicId(topic);
    const diff = difficulty.toLowerCase();
    
    // Add topic if new
    if (!topicsMap.has(topicId)) {
      topicsMap.set(topicId, {
        id: topicId,
        name: topic,
        description: `Master ${topic} concepts including various problem-solving techniques.`,
        hint: `Learn fundamental concepts and applications of ${topic}.`
      });
    }
    
    // Track question counter
    const counterKey = `${topicId}-${diff}`;
    if (!counters[counterKey]) counters[counterKey] = 0;
    counters[counterKey]++;
    
    // Generate question ID
    const questionId = `${topicId.substring(0, 3)}-${diff.charAt(0)}-${counters[counterKey]}`;
    
    // Add question
    questions.push({
      id: questionId,
      topicId: topicId,
      subTopic: subTopic || topic,
      difficulty: diff,
      flashcard: cleanQuotes(flashcard),
      flashcardAnswer: cleanQuotes(answer),
      question: cleanQuotes(question),
      options: [
        cleanQuotes(optionA),
        cleanQuotes(optionB),
        cleanQuotes(optionC),
        cleanQuotes(optionD)
      ],
      answerIndex: getAnswerIndex(key),
      explanation: cleanQuotes(explanation)
    });
    
    if ((i % 50) === 0) {
      console.log(`Processed ${i} lines...`);
    }
  }
  
  return {
    topics: Array.from(topicsMap.values()),
    questions: questions
  };
}

// Main execution
try {
  console.log('Starting data transformation...\n');
  
  // Read the complete dataset from your message or a file
  // For now, read from questions_new.json to preserve structure
  const dataPath = path.join(__dirname, '../data/questions_new.json');
  const existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  console.log('INSTRUCTIONS:');
  console.log('=============');
  console.log('1. Copy your ENTIRE spreadsheet data (all rows)');
  console.log('2. Save it to: backend/data/raw_spreadsheet.tsv');
  console.log('3. Run this script again\n');
  console.log('The file should be tab-separated with these columns:');
  console.log('Topic, Sub-Topic, Flashcard, Answer, Question, Difficulty level,');
  console.log('Option A, Option B, Option C, Option D, Key, Explanation\n');
  
  // Check if raw data file exists
  const rawDataPath = path.join(__dirname, '../data/raw_spreadsheet.tsv');
  if (fs.existsSync(rawDataPath)) {
    console.log('Found raw_spreadsheet.tsv! Processing...\n');
    const rawData = fs.readFileSync(rawDataPath, 'utf-8');
    const processedData = processCompleteData(rawData);
    
    console.log(`\n✓ Processed ${processedData.topics.length} topics`);
    console.log(`✓ Processed ${processedData.questions.length} questions`);
    
    // Write output
    const outputPath = path.join(__dirname, '../data/questions.json');
    fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
    console.log(`✓ Successfully wrote to ${outputPath}`);
  } else {
    console.log('Raw data file not found. Please create it first.');
    console.log(`Expected location: ${rawDataPath}`);
  }
  
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
