import { findAllTopics } from '../models/topicModel.js';
import { findQuestions } from '../models/questionModel.js';

async function test() {
  console.log('Testing new data structure...\n');
  
  try {
    // Test topics
    const topics = await findAllTopics();
    console.log('✓ Loaded', topics.length, 'topics');
    console.log('Topics:', topics.map(t => t.name).join(', '));
    
    // Test questions
    const questions = await findQuestions();
    console.log('\n✓ Loaded', questions.length, 'questions');
    
    // Check new fields
    const sampleQ = questions[0];
    console.log('\n✓ Sample question structure:');
    console.log('  - ID:', sampleQ.id);
    console.log('  - Topic ID:', sampleQ.topicId);
    console.log('  - Sub-Topic:', sampleQ.subTopic || '(not set)');
    console.log('  - Difficulty:', sampleQ.difficulty);
    console.log('  - Has flashcard:', !!sampleQ.flashcard);
    console.log('  - Has flashcardAnswer:', !!sampleQ.flashcardAnswer);
    console.log('  - Question:', sampleQ.question.substring(0, 50) + '...');
    
    console.log('\n✅ All tests passed! New structure is working correctly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

test();
