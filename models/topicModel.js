import { getDb, connectToDatabase } from '../config/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedTopics = null;

function loadTopicsFromFile() {
  if (cachedTopics) return cachedTopics;
  
  try {
    const dataPath = join(__dirname, '../data/questions.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf8'));
    cachedTopics = data.topics || [];
    return cachedTopics;
  } catch (err) {
    console.error('Error loading topics from file:', err.message);
    return [];
  }
}

export async function findAllTopics() {
  try {
    // Try to get existing connection, or reconnect if needed
    let db;
    try {
      db = getDb();
    } catch (err) {
      // If db is not initialized, try to connect
      db = await connectToDatabase();
    }
    return await db.collection('topics').find({}).toArray();
  } catch (err) {
    // Fallback to local file if database fails
    console.warn('Database unavailable, falling back to local data:', err.message);
    return loadTopicsFromFile();
  }
}


