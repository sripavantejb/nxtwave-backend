import { getDb } from '../config/db.js';

export async function findQuestionsByTopic(topicId) {
  const db = getDb();
  return db.collection('questions').find({ topicId }).toArray();
}


