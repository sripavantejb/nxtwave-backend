import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Raw data from spreadsheet
const rawData = `Topic	Sub-Topic	Flashcard	Answer	Question	Difficulty level	Option A	Option B	Option C	Option D	Key	Explanation
Number Systems	Number Systems	Do you know the divisibility rules in Number Systems?	"Divisible by 2 → If the number ends with 0, 2, 4, 6, or 8 (i.e., even).
Divisible by 3 → If the sum of its digits is divisible by 3.
Divisible by 5 → If the number ends with 0 or 5.
Divisible by 9 → If the sum of digits is divisible by 9.
Divisible by 11 → If the difference between sum of digits at odd and even positions is divisible by 11."	When 10082 is divided by 3, what is the remainder?	Easy	0	1	2	3	Option C	"To find the remainder when 10082 is divided by 3, you can use the divisibility rule for 3, which states that the remainder of a number divided by 3 is the same as the remainder of the sum of its digits divided by 3.  
  
Sum the digits of 10082:1+0+0+8+2=11  
Divide the sum (11) by 3:$\\dfrac{11}{3}$ = remainder 2  
  
The remainder when 10082 is divided by 3 is 2."
Number Systems	Number Systems	Do you know the divisibility rules in Number Systems?	"Divisible by 2 → If the number ends with 0, 2, 4, 6, or 8 (i.e., even).
Divisible by 3 → If the sum of its digits is divisible by 3.
Divisible by 5 → If the number ends with 0 or 5.
Divisible by 9 → If the sum of digits is divisible by 9.
Divisible by 11 → If the difference between sum of digits at odd and even positions is divisible by 11."	Which of the following numbers is divisible by 7?	Medium	1112	1342	1435	1263	Option C	"Divisibility rule of 7:

Take the last digit of the number. Double it.
Subtract this doubled value from the remaining part of the number (the number without its last digit).
If the result is 0 or divisible by 7, then the original number is divisible by 7.
If it's still large, repeat the process.

Let's apply this rule to the given numbers,  
Option-A: 1112  
Last digit: 2  
Remaining part: 111  
2 × 2 = 4  
111 - 4 = 107  
107 is not divisible by 7, so 1112 is not divisible by 7.  
  
Option-B: 1342  
Last digit: 2  
Remaining part: 134  
2 × 2 = 4  
134 - 4 = 130  
130 is not divisible by 7, so 1342 is not divisible by 7.  
  
Option-C: 1435  
Last digit: 5  
Remaining part: 143  
2 × 5 = 10  
143 - 10 = 133  
133 is divisible by 7, so 1435 is divisible by 7.  
  
Option-D: 1263  
Last digit: 3  
Remaining part: 126  
2 × 3 = 6  
126 - 6 = 120  
120 is not divisible by 7, so 1263 is not divisible by 7.  
Therefore, out of the given numbers, 1435 is the one that is divisible by 7."`;

// Parse the TSV data
function parseTSV(tsv) {
  const lines = tsv.split('\n');
  const headers = lines[0].split('\t');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split('\t');
    const row = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || '';
    });
    
    data.push(row);
  }
  
  return data;
}

// Generate topic ID from topic name
function generateTopicId(topicName) {
  return topicName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9-]/g, '');
}

// Generate question ID
function generateQuestionId(topic, subTopic, difficulty, index) {
  const topicPrefix = topic.split(' ')[0].toLowerCase().substring(0, 3);
  const diffPrefix = difficulty.charAt(0).toLowerCase();
  return `${topicPrefix}-${diffPrefix}-${index}`;
}

// Extract answer index from key (e.g., "Option C" -> 2)
function getAnswerIndex(key) {
  const match = key.match(/Option ([A-D])/i);
  if (!match) return 0;
  return match[1].charCodeAt(0) - 'A'.charCodeAt(0);
}

// Process data
function processData() {
  const rows = parseTSV(rawData);
  
  // Extract unique topics with their metadata
  const topicsMap = new Map();
  const questions = [];
  
  rows.forEach((row, index) => {
    const topicName = row['Topic'];
    const subTopic = row['Sub-Topic'];
    const topicId = generateTopicId(topicName);
    
    // Add topic if not exists
    if (!topicsMap.has(topicId)) {
      topicsMap.set(topicId, {
        id: topicId,
        name: topicName,
        description: `Learn ${subTopic} and related concepts in ${topicName}.`,
        hint: `Master the fundamental concepts of ${topicName}.`
      });
    }
    
    // Add question
    const difficulty = row['Difficulty level'].toLowerCase();
    const questionId = generateQuestionId(topicName, subTopic, difficulty, index + 1);
    
    questions.push({
      id: questionId,
      topicId: topicId,
      subTopic: subTopic,
      difficulty: difficulty,
      flashcard: row['Flashcard'],
      flashcardAnswer: row['Answer'].replace(/^"|"$/g, ''), // Remove surrounding quotes
      question: row['Question'],
      options: [
        row['Option A'],
        row['Option B'],
        row['Option C'],
        row['Option D']
      ],
      answerIndex: getAnswerIndex(row['Key']),
      explanation: row['Explanation'].replace(/^"|"$/g, '') // Remove surrounding quotes
    });
  });
  
  return {
    topics: Array.from(topicsMap.values()),
    questions: questions
  };
}

// Main execution
try {
  console.log('Processing data...');
  const data = processData();
  
  console.log(`Generated ${data.topics.length} topics`);
  console.log(`Generated ${data.questions.length} questions`);
  
  // Write to file
  const outputPath = path.join(__dirname, '../data/questions.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  console.log(`✓ Successfully wrote data to ${outputPath}`);
} catch (error) {
  console.error('Error processing data:', error);
  process.exit(1);
}
