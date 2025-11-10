import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import { connectToDatabase } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

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

async function seedFromLocalJson(db) {
  const dataPath = path.join(__dirname, '..', 'data', 'questions.json');
  const raw = fs.readFileSync(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed.topics) && parsed.topics.length > 0) {
    await db.collection('topics').createIndex({ id: 1 }, { unique: true });
    for (const t of parsed.topics) {
      await db.collection('topics').updateOne({ id: t.id }, { $set: t }, { upsert: true });
    }
  }

  if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
    await db.collection('questions').createIndex({ id: 1 }, { unique: true });
    for (const q of parsed.questions) {
      await db.collection('questions').updateOne({ id: q.id }, { $set: q }, { upsert: true });
    }
  }
}

async function seedFromGoogleSheet(db) {
  const sheetUrl = process.env.SHEET_URL || '';
  if (!sheetUrl) {
    console.log('SHEET_URL not set; skipping sheet import.');
    return;
  }

  // Derive CSV export URL if a standard Google Sheets URL is provided
  let csvUrl = sheetUrl;
  const m = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = sheetUrl.match(/[?&]gid=(\d+)/);
  if (m && gidMatch) {
    const id = m[1];
    const gid = gidMatch[1];
    csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }

  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error(`Failed to download sheet CSV: ${res.status} ${res.statusText}`);
  }
  const csvText = await res.text();

  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true
  });

  if (!Array.isArray(records) || records.length === 0) {
    console.log('No records found in sheet; skipping.');
    return;
  }

  await db.collection('topics').createIndex({ id: 1 }, { unique: true });
  await db.collection('questions').createIndex({ id: 1 }, { unique: true });

  let rowIndex = 0;
  for (const row of records) {
    rowIndex += 1;
    const topicName = row['Topic'] || '';
    const subTopic = row['Sub-Topic'] || row['Sub Topic'] || '';
    const difficulty = (row['Difficulty level'] || row['Difficulty'] || 'Medium').toString().toLowerCase();
    const questionText = row['Question'] || row['Flashcard'] || '';
    const optionA = row['Option A'] || row['A'] || '';
    const optionB = row['Option B'] || row['B'] || '';
    const optionC = row['Option C'] || row['C'] || '';
    const optionD = row['Option D'] || row['D'] || '';
    const key = row['Key'] || row['Answer'] || '';
    const explanation = row['Explanation'] || '';

    if (!questionText || (!optionA && !optionB && !optionC && !optionD)) {
      continue;
    }

    const topicId = toSlug(subTopic || topicName) || 'general';
    const topicDoc = {
      id: topicId,
      name: subTopic || topicName || 'General',
      description: topicName ? `Topic: ${topicName}` : '',
      hint: ''
    };
    await db.collection('topics').updateOne({ id: topicDoc.id }, { $set: topicDoc }, { upsert: true });

    const difficultyNorm =
      difficulty.startsWith('e') ? 'easy' :
      difficulty.startsWith('m') ? 'medium' :
      difficulty.startsWith('h') ? 'hard' : 'medium';

    const answerIndex = answerKeyToIndex(key);
    const qId = `${topicId}-${difficultyNorm}-${rowIndex}`;
    const questionDoc = {
      id: qId,
      topicId,
      difficulty: difficultyNorm,
      question: String(questionText).trim(),
      options: [optionA, optionB, optionC, optionD].filter(v => v !== undefined).map(v => String(v)),
      answerIndex: answerIndex >= 0 ? answerIndex : 0,
      explanation: String(explanation || '').trim()
    };
    await db.collection('questions').updateOne({ id: qId }, { $set: questionDoc }, { upsert: true });
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in environment. Aborting.');
    process.exit(1);
  }
  const db = await connectToDatabase();
  const args = process.argv.slice(2);
  const doJson = args.length === 0 || args.includes('--from-json');
  const doSheets = args.length === 0 || args.includes('--from-sheets');

  if (doJson) {
    console.log('Seeding from local JSON...');
    await seedFromLocalJson(db);
  }
  if (doSheets) {
    console.log('Seeding from Google Sheet...');
    await seedFromGoogleSheet(db);
  }
  console.log('Seeding complete.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


