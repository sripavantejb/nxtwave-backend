import 'dotenv/config';
import { MongoClient, ServerApiVersion } from 'mongodb';
// No file-system dependencies here; seeding is handled by scripts/seed.js

const MONGO_URI = process.env.MONGO_URI || '';
const DB_NAME = process.env.DB_NAME || 'smartquiz';

let client;
let db;

export async function connectToDatabase() {
  if (db) {
    return db;
  }

  client = new MongoClient(MONGO_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    }
  });

  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connectToDatabase() first.');
  }
  return db;
}

export async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
