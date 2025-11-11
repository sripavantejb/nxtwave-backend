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

  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not set in environment variables');
  }

  // Minimal connection options to work around Node.js v22 SSL/TLS issues
  client = new MongoClient(MONGO_URI, {
    // Connection timeout
    connectTimeoutMS: 30000,
    serverSelectionTimeoutMS: 30000,
    // Retry options
    retryWrites: true,
    retryReads: true
    // Don't explicitly set TLS - let driver and URI handle it
  });

  try {
    await client.connect();
    // Test the connection
    await client.db('admin').command({ ping: 1 });
    db = client.db(DB_NAME);
    return db;
  } catch (error) {
    // Close the client if connection fails
    if (client) {
      await client.close().catch(() => {});
      client = null;
    }
    throw error;
  }
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
