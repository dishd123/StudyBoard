import { createCardsFixture } from './cardsAgent.js';

// Reuse aligned Issue #74/#75 sources; add distinct cards for build boundaries.
export function createBuildFixture(count = 5) {
  const { notesInput, notesResult, cardsResult } = createCardsFixture(10);
  const extra = [
    { question: 'How does a smaller learning rate affect a weight update?', answer: 'It makes the weight update smaller.', step: 9 },
    { question: 'Which concept did the speaker emphasize about update size?', answer: 'The learning rate.', step: 9 },
    { question: 'Which value was written for sigma before the correction?', answer: '1.4 was written before the correction to 2.', step: 4 }
  ];
  const cards = [...cardsResult.cards, ...extra].slice(0, count);
  return {
    session: {
      id: 'session-one', owner: 'alice', course: notesInput.course,
      photo: { ...notesInput.photo, thumbnail: 'PRIVATE_THUMBNAIL' },
      audio: notesInput.audio, status: 'ready', summary: 'Old summary',
      notes: [{ step: 4, boardText: 'Old' }], cardCount: 2,
      updatedAt: '2026-01-01T00:00:00.000Z', privateMetadata: 'PRIVATE_METADATA'
    },
    notesInput,
    result: { notesResult, cardsResult: { cards } },
    oldCards: [
      { id: 'old-one', question: 'Old?', answer: 'Old', step: 4, known: true },
      { id: 'old-two', question: 'Older?', answer: 'Older', step: 9, known: false }
    ]
  };
}
