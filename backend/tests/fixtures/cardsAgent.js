import { createCompleteNotesFixture } from './notesAgent.js';

// Each extra card has its own supported board fact and spoken explanation.
// Extend Issue #74's aligned sources rather than padding the ten-card boundary.
const additionalSources = [
  {
    step: 12, boardText: 'A gradient measures change in loss',
    explanation: 'The gradient tells us how loss changes when weights change.',
    question: 'Why is a gradient useful when adjusting weights?',
    answer: 'It tells us how loss changes when weights change.'
  },
  {
    step: 20, boardText: 'Momentum uses previous updates',
    explanation: 'Momentum incorporates previous updates into the next weight change.',
    question: 'How does momentum influence the next weight change?',
    answer: 'It incorporates previous updates into that change.'
  },
  {
    step: 30, boardText: 'Regularization discourages large weights',
    explanation: 'Regularization adds a penalty that discourages large weights.',
    question: 'How does regularization discourage large weights?',
    answer: 'It adds a penalty for large weights.'
  },
  {
    step: 40, boardText: 'An epoch traverses the training dataset',
    explanation: 'One training epoch completes a pass through the training dataset.',
    question: 'What does completing one training epoch mean?',
    answer: 'Completing a pass through the training dataset.'
  },
  {
    step: 50, boardText: 'Compare predictions with targets',
    explanation: 'A prediction is compared with its target to evaluate prediction error.',
    question: 'Why compare a prediction with its target?',
    answer: 'To evaluate prediction error.'
  },
  {
    step: 60, boardText: 'Loss quantifies prediction error',
    explanation: 'Loss supplies a numerical measure of prediction error.',
    question: 'What does loss quantify?',
    answer: 'Prediction error as a numerical measure.'
  },
  {
    step: 70, boardText: 'Validation estimates generalization',
    explanation: 'Validation uses held-out examples to estimate generalization.',
    question: 'How does validation estimate generalization?',
    answer: 'By using held-out examples.'
  }
];

export function createCardsFixture(count = 5) {
  if (count !== 5 && count !== 10) throw new TypeError('Use a five- or ten-card fixture.');
  const { input: notesInput, output: notesResult } = createCompleteNotesFixture();
  const cards = [
    {
      question: 'Why is the learning rate important in gradient descent?',
      answer: 'It determines how large each gradient step is.', step: 9
    },
    {
      question: 'Which corrected sigma value should be used?',
      answer: '2, following the explicit spoken correction rather than the original board value.', step: 4
    },
    { question: 'What batch size is written on the board?', answer: '32.', step: 2 }
  ];
  for (const { step, boardText, explanation, question, answer } of additionalSources) {
    const pointIndex = notesInput.audio.points.length;
    notesInput.photo.steps.push({ step, text: boardText });
    notesInput.audio.points.push({ text: explanation, kind: 'explanation' });
    notesResult.notes.push({
      step, boardText, explanation, correction: null, emphasis: [], sourcePointIndexes: [pointIndex]
    });
    cards.push({ question, answer, step });
  }
  notesInput.audio.transcript += ` ${additionalSources.map(source => source.explanation).join(' ')}`;
  return { notesInput, notesResult, cardsResult: { cards: cards.slice(0, count) } };
}

export function createInvalidStepCardsFixture() {
  const fixture = createCardsFixture();
  fixture.cardsResult.cards[0].step = 999;
  return fixture;
}

export function createEmptyContentCardsFixture() {
  const fixture = createCardsFixture();
  fixture.cardsResult.cards[0].answer = '  ';
  return fixture;
}
