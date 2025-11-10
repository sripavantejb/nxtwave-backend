import { getDb } from '../config/db.js';

export async function findAllTopics() {
  const db = getDb();
  return db.collection('topics').find({}).toArray();
}


