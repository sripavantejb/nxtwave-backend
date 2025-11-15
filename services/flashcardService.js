import shuffle from 'lodash.shuffle';

export function pickRandomQuestion(questions = []) {
  if (!questions || questions.length === 0) {
    return null;
  }
  return shuffle(questions)[0];
}

export function pickFollowUpQuestion(questions = [], mode = 'challenge') {
  if (!questions || questions.length === 0) {
    return null;
  }

  const priorityOrder = mode === 'remedial'
    ? ['easy', 'medium', 'hard']
    : ['hard', 'medium', 'easy'];

  for (const difficulty of priorityOrder) {
    const matches = questions.filter(q => q.difficulty === difficulty);
    if (matches.length > 0) {
      return pickRandomQuestion(matches);
    }
  }

  return pickRandomQuestion(questions);
}

export function toFlashcardPayload(question, topicMeta) {
  if (!question) return null;

  const options = Array.isArray(question.options) ? question.options : [];
  const answerIndex = typeof question.answerIndex === 'number' ? question.answerIndex : -1;
  const answerText = answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : '';

  return {
    id: question.id,
    topicId: question.topicId,
    topicName: topicMeta?.name ?? question.topicId,
    difficulty: question.difficulty,
    question: question.question,
    options,
    answerIndex,
    answerText,
    explanation: question.explanation,
    subTopic: question.subTopic || '',
    flashcard: question.flashcard || '',
    flashcardAnswer: question.flashcardAnswer || ''
  };
}


