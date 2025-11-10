import shuffle from 'lodash.shuffle';

export function getMixAndOrder(rating) {
  if (rating <= 2) {
    return {
      mix: { easy: 4, medium: 1, hard: 1 },
      order: ['easy', 'medium', 'hard']
    };
  }
  if (rating === 3) {
    return {
      mix: { easy: 2, medium: 2, hard: 2 },
      order: ['medium', 'hard', 'easy']
    };
  }
  return {
    mix: { easy: 1, medium: 2, hard: 3 },
    order: ['hard', 'medium', 'easy']
  };
}

export function sampleByDifficulty(all, difficulty, count) {
  const pool = all.filter(q => q.difficulty === difficulty);
  if (pool.length === 0) return [];
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function fillShortage(all, picked, targetCount) {
  const pickedIds = new Set(picked.map(q => q.id));
  const remaining = all.filter(q => !pickedIds.has(q.id));
  const shuffled = shuffle(remaining);
  while (picked.length < targetCount && shuffled.length > 0) {
    picked.push(shuffled.shift());
  }
  return picked;
}

export function buildQuiz(allForTopic, rating) {
  const { mix, order } = getMixAndOrder(rating);

  const easyPicked = sampleByDifficulty(allForTopic, 'easy', mix.easy);
  const medPicked = sampleByDifficulty(allForTopic, 'medium', mix.medium);
  const hardPicked = sampleByDifficulty(allForTopic, 'hard', mix.hard);

  const byDiff = { easy: easyPicked, medium: medPicked, hard: hardPicked };

  let ordered = [];
  for (const d of order) {
    ordered = ordered.concat(byDiff[d] || []);
  }

  ordered = ordered.slice(0, 6);
  ordered = fillShortage(allForTopic, ordered, 6);

  while (ordered.length < 6 && allForTopic.length > 0) {
    ordered.push(allForTopic[ordered.length % allForTopic.length]);
  }

  return ordered.map(q => ({
    id: q.id,
    difficulty: q.difficulty,
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    explanation: q.explanation
  }));
}


