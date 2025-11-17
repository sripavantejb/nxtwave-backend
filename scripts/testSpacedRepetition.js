import { 
  calculateNextReviewDate, 
  isQuestionDue,
  calculateSubtopicNextReviewDate,
  getDueQuestionIds,
  getAllDueQuestions
} from '../services/spacedRepService.js';
import { 
  getUserReviewData, 
  updateUserReviewData,
  createUser,
  loadUsers,
  saveUsers
} from '../services/userService.js';

async function runTests() {
console.log('🧪 Testing Spaced Repetition Algorithm\n');
console.log('='.repeat(70));

// ============================================================================
// TEST 1: Algorithm Function Tests (Unit Tests)
// ============================================================================
console.log('\n📅 TEST 1: Algorithm Function Tests');
console.log('-'.repeat(70));

const now = new Date();
console.log(`Current time: ${now.toLocaleString()}\n`);

let passedTests = 0;
let failedTests = 0;

// Test Easy + Correct
const easyCorrect = calculateNextReviewDate(true, 'easy');
const easyMinutes = Math.round((easyCorrect - now) / (1000 * 60));
const test1 = easyMinutes === 15;
console.log(`✓ Easy + Correct: ${easyMinutes} minutes`);
console.log(`  Expected: 15 | Got: ${easyMinutes} | ${test1 ? '✅ PASS' : '❌ FAIL'}`);
if (test1) passedTests++; else failedTests++;

// Test Medium + Correct
const mediumCorrect = calculateNextReviewDate(true, 'medium');
const mediumMinutes = Math.round((mediumCorrect - now) / (1000 * 60));
const test2 = mediumMinutes === 25;
console.log(`✓ Medium + Correct: ${mediumMinutes} minutes`);
console.log(`  Expected: 25 | Got: ${mediumMinutes} | ${test2 ? '✅ PASS' : '❌ FAIL'}`);
if (test2) passedTests++; else failedTests++;

// Test Hard + Correct
const hardCorrect = calculateNextReviewDate(true, 'hard');
const hardMinutes = Math.round((hardCorrect - now) / (1000 * 60));
const test3 = hardMinutes === 35;
console.log(`✓ Hard + Correct: ${hardMinutes} minutes`);
console.log(`  Expected: 35 | Got: ${hardMinutes} | ${test3 ? '✅ PASS' : '❌ FAIL'}`);
if (test3) passedTests++; else failedTests++;

// Test Wrong Answer
const wrongAnswer = calculateNextReviewDate(false, 'hard');
const wrongMinutes = Math.round((wrongAnswer - now) / (1000 * 60));
const test4 = wrongMinutes === 5;
console.log(`✓ Wrong Answer (any difficulty): ${wrongMinutes} minutes`);
console.log(`  Expected: 5 | Got: ${wrongMinutes} | ${test4 ? '✅ PASS' : '❌ FAIL'}`);
if (test4) passedTests++; else failedTests++;

// Test Case Insensitivity
const easyUpper = calculateNextReviewDate(true, 'Easy');
const easyUpperMinutes = Math.round((easyUpper - now) / (1000 * 60));
const test5 = easyUpperMinutes === 15;
console.log(`✓ Case Insensitivity (Easy): ${easyUpperMinutes} minutes`);
console.log(`  Expected: 15 | Got: ${easyUpperMinutes} | ${test5 ? '✅ PASS' : '❌ FAIL'}`);
if (test5) passedTests++; else failedTests++;

// Test Default/Unknown
const defaultTest = calculateNextReviewDate(true, 'unknown');
const defaultMinutes = Math.round((defaultTest - now) / (1000 * 60));
const test6 = defaultMinutes === 25;
console.log(`✓ Unknown Difficulty (defaults to medium): ${defaultMinutes} minutes`);
console.log(`  Expected: 25 | Got: ${defaultMinutes} | ${test6 ? '✅ PASS' : '❌ FAIL'}`);
if (test6) passedTests++; else failedTests++;

// ============================================================================
// TEST 2: Integration Test with User Data
// ============================================================================
console.log('\n\n🔗 TEST 2: Integration Test with User Data');
console.log('-'.repeat(70));

// Create a test user (createUser generates its own userId)
let testUserId;
try {
  const createdUser = createUser({ 
    name: 'testuser', 
    passwordHash: 'testpass',
    email: 'test' + Date.now() + '@example.com'
  });
  testUserId = createdUser.userId;
  console.log(`Creating test user: ${testUserId}`);
  console.log('✅ Test user created\n');
} catch (err) {
  console.log('⚠️  Error creating user:', err.message);
  // Fallback: use a test userId and manually create structure
  testUserId = 'test-user-' + Date.now();
  const users = loadUsers();
  users[testUserId] = {
    name: 'testuser',
    email: 'test@example.com',
    reviewData: {}
  };
  saveUsers(users);
  console.log(`Using fallback test user: ${testUserId}\n`);
}

// Test: Question with no review data (should be due)
const noReviewDue = isQuestionDue(testUserId, 'question-new-1');
const test7 = noReviewDue === true;
console.log(`✓ New question (no review data): ${noReviewDue ? 'Due' : 'Not Due'}`);
console.log(`  Expected: Due (true) | Got: ${noReviewDue} | ${test7 ? '✅ PASS' : '❌ FAIL'}`);
if (test7) passedTests++; else failedTests++;

// Test: Schedule a question for future (should NOT be due)
const futureDate = new Date();
futureDate.setMinutes(futureDate.getMinutes() + 30);
const futureDateISO = futureDate.toISOString();
updateUserReviewData(testUserId, 'question-future-1', {
  nextReviewDate: futureDateISO,
  lastAnswerCorrect: true,
  difficulty: 'medium',
  timesReviewed: 1
});

// Verify the data was saved
const savedReview = getUserReviewData(testUserId)['question-future-1'];
if (!savedReview) {
  console.log('⚠️  Warning: Review data not found after saving. Retrying...');
  // Small delay to ensure file write completes
  await new Promise(resolve => setTimeout(resolve, 100));
}

const futureDue = isQuestionDue(testUserId, 'question-future-1');
const test8 = futureDue === false;
console.log(`✓ Question scheduled for future: ${futureDue ? 'Due' : 'Not Due'}`);
console.log(`  Scheduled for: ${new Date(futureDateISO).toLocaleString()}`);
console.log(`  Current time: ${new Date().toLocaleString()}`);
console.log(`  Expected: Not Due (false) | Got: ${futureDue} | ${test8 ? '✅ PASS' : '❌ FAIL'}`);
if (test8) passedTests++; else failedTests++;

// Test: Schedule a question for past (should be due)
const pastDate = new Date();
pastDate.setMinutes(pastDate.getMinutes() - 10);
updateUserReviewData(testUserId, 'question-past-1', {
  nextReviewDate: pastDate.toISOString(),
  lastAnswerCorrect: true,
  difficulty: 'easy',
  timesReviewed: 1
});

const pastDue = isQuestionDue(testUserId, 'question-past-1');
const test9 = pastDue === true;
console.log(`✓ Question scheduled for past: ${pastDue ? 'Due' : 'Not Due'}`);
console.log(`  Expected: Due (true) | Got: ${pastDue} | ${test9 ? '✅ PASS' : '❌ FAIL'}`);
if (test9) passedTests++; else failedTests++;

// ============================================================================
// TEST 3: Full Flow Simulation
// ============================================================================
console.log('\n\n🔄 TEST 3: Full Flow Simulation');
console.log('-'.repeat(70));

// Simulate: User answers a question correctly (Easy difficulty)
console.log('\n📝 Simulating: User answers question correctly (Easy difficulty)');
const questionId1 = 'sim-question-1';
const nextReview1 = calculateNextReviewDate(true, 'easy');
updateUserReviewData(testUserId, questionId1, {
  difficulty: 'easy',
  lastAnswerCorrect: true,
  nextReviewDate: nextReview1.toISOString(),
  timesReviewed: 1
});

// Small delay to ensure data is saved
await new Promise(resolve => setTimeout(resolve, 100));

const reviewData1 = getUserReviewData(testUserId)[questionId1];
if (!reviewData1) {
  console.log(`  ❌ FAIL - Review data not found for ${questionId1}`);
  failedTests++;
} else {
  console.log(`  ✓ Question ID: ${questionId1}`);
  console.log(`  ✓ Next Review Date: ${new Date(reviewData1.nextReviewDate).toLocaleString()}`);
  console.log(`  ✓ Minutes until review: ${Math.round((nextReview1 - now) / (1000 * 60))}`);
  console.log(`  ✓ Is Due Now: ${isQuestionDue(testUserId, questionId1) ? 'Yes' : 'No'}`);
  const test10 = !isQuestionDue(testUserId, questionId1);
  console.log(`  ${test10 ? '✅ PASS' : '❌ FAIL'} - Should NOT be due immediately`);
  if (test10) passedTests++; else failedTests++;
}

// Simulate: User answers incorrectly
console.log('\n📝 Simulating: User answers question incorrectly');
const questionId2 = 'sim-question-2';
const nextReview2 = calculateNextReviewDate(false, 'hard');
updateUserReviewData(testUserId, questionId2, {
  difficulty: 'hard',
  lastAnswerCorrect: false,
  nextReviewDate: nextReview2.toISOString(),
  timesReviewed: 1
});

// Small delay to ensure data is saved
await new Promise(resolve => setTimeout(resolve, 100));

const reviewData2 = getUserReviewData(testUserId)[questionId2];
if (!reviewData2) {
  console.log(`  ❌ FAIL - Review data not found for ${questionId2}`);
  failedTests++;
} else {
  console.log(`  ✓ Question ID: ${questionId2}`);
  console.log(`  ✓ Next Review Date: ${new Date(reviewData2.nextReviewDate).toLocaleString()}`);
  console.log(`  ✓ Minutes until review: ${Math.round((nextReview2 - now) / (1000 * 60))}`);
  console.log(`  ✓ Is Due Now: ${isQuestionDue(testUserId, questionId2) ? 'Yes' : 'No'}`);
  const test11 = !isQuestionDue(testUserId, questionId2);
  console.log(`  ${test11 ? '✅ PASS' : '❌ FAIL'} - Should NOT be due immediately`);
  if (test11) passedTests++; else failedTests++;
}

// Test: getDueQuestionIds filtering
console.log('\n📋 Testing: getDueQuestionIds filtering');
const allQuestionIds = ['question-new-1', 'question-future-1', 'question-past-1', 'sim-question-1', 'sim-question-2'];
const dueIds = getDueQuestionIds(testUserId, allQuestionIds);
console.log(`  ✓ All Question IDs: ${allQuestionIds.join(', ')}`);
console.log(`  ✓ Due Question IDs: ${dueIds.join(', ')}`);
const expectedDue = ['question-new-1', 'question-past-1'];
const test12 = JSON.stringify(dueIds.sort()) === JSON.stringify(expectedDue.sort());
console.log(`  Expected: ${expectedDue.join(', ')}`);
console.log(`  ${test12 ? '✅ PASS' : '❌ FAIL'} - Correct filtering`);
if (test12) passedTests++; else failedTests++;

// Test: getAllDueQuestions
// Note: getAllDueQuestions only returns questions that have been reviewed before (have nextReviewDate)
// New questions without review data are not included, but they're still "due" via isQuestionDue
console.log('\n📋 Testing: getAllDueQuestions');
const allDue = getAllDueQuestions(testUserId);
console.log(`  ✓ All Due Questions: ${allDue.length} found`);
console.log(`  ✓ Due IDs: ${allDue.join(', ')}`);
// Should find at least 'question-past-1' (which has review data and is due)
// 'question-new-1' won't be in getAllDueQuestions because it has no review data yet
const test13 = allDue.length >= 1 && allDue.includes('question-past-1');
console.log(`  Note: getAllDueQuestions only returns questions with review data`);
console.log(`  ${test13 ? '✅ PASS' : '❌ FAIL'} - Found due questions with review data`);
if (test13) passedTests++; else failedTests++;

// ============================================================================
// TEST 4: Subtopic Review Date Calculation
// ============================================================================
console.log('\n\n📚 TEST 4: Subtopic Review Date Calculation');
console.log('-'.repeat(70));

const subtopicEasy = calculateSubtopicNextReviewDate(true, 'easy');
const subtopicEasyMinutes = Math.round((subtopicEasy - now) / (1000 * 60));
const test14 = subtopicEasyMinutes === 15;
console.log(`✓ Subtopic Easy + Correct: ${subtopicEasyMinutes} minutes`);
console.log(`  Expected: 15 | Got: ${subtopicEasyMinutes} | ${test14 ? '✅ PASS' : '❌ FAIL'}`);
if (test14) passedTests++; else failedTests++;

const subtopicWrong = calculateSubtopicNextReviewDate(false, 'hard');
const subtopicWrongMinutes = Math.round((subtopicWrong - now) / (1000 * 60));
const test15 = subtopicWrongMinutes === 5;
console.log(`✓ Subtopic Wrong Answer: ${subtopicWrongMinutes} minutes`);
console.log(`  Expected: 5 | Got: ${subtopicWrongMinutes} | ${test15 ? '✅ PASS' : '❌ FAIL'}`);
if (test15) passedTests++; else failedTests++;

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n\n' + '='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`📈 Total: ${passedTests + failedTests}`);
console.log(`🎯 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);

if (failedTests === 0) {
  console.log('\n🎉 All tests passed! The spaced repetition algorithm is working correctly.');
} else {
  console.log('\n⚠️  Some tests failed. Please review the output above.');
}

console.log('\n💡 Next Steps:');
console.log('   1. Test with actual API endpoints (start server and make requests)');
console.log('   2. Test time-based due logic (wait for intervals to pass)');
console.log('   3. Test with real user data from your application');

process.exit(failedTests === 0 ? 0 : 1);
}

runTests().catch(err => {
  console.error('❌ Test script error:', err);
  process.exit(1);
});

