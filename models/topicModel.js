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
    const topicsFromDb = await db.collection('topics').find({}).toArray();
    // If DB is empty or unavailable for any reason, ensure we always have topics
    if (!Array.isArray(topicsFromDb) || topicsFromDb.length === 0) {
      console.log('Database topics collection is empty, loading from file...');
      return loadTopicsFromFile();
    }
    // Ensure we have all required topics (si, ci, profit-loss, si-ci)
    const requiredTopicIds = ['si', 'ci', 'profit-loss', 'si-ci'];
    const existingIds = topicsFromDb.map(t => t.id);
    const missingIds = requiredTopicIds.filter(id => !existingIds.includes(id));
    
    if (missingIds.length > 0) {
      console.log(`Missing topics in database: ${missingIds.join(', ')}. Loading from file to ensure all topics are available.`);
      const topicsFromFile = loadTopicsFromFile();
      // Merge: use DB topics, but fill in missing ones from file
      const fileTopicMap = new Map(topicsFromFile.map(t => [t.id, t]));
      const merged = [...topicsFromDb];
      missingIds.forEach(id => {
        const topicFromFile = fileTopicMap.get(id);
        if (topicFromFile) {
          merged.push(topicFromFile);
        }
      });
      return merged;
    }
    return topicsFromDb;
  } catch (err) {
    // Fallback to local file if database fails
    console.warn('Database unavailable, falling back to local data:', err.message);
    return loadTopicsFromFile();
  }
}


