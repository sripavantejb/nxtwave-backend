import { findAllTopics } from '../models/topicModel.js';

export async function getTopics(_req, res) {
  try {
    const topics = await findAllTopics();
    res.json(topics);
  } catch (err) {
    console.error('Error fetching topics:', err);
    res.status(500).json({ 
      error: 'Failed to fetch topics',
      message: err.message || 'Database connection error'
    });
  }
}


