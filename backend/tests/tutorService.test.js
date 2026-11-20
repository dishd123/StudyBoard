// Tests for parseTutorAnswer (issue #78): the STEPS USED line, "none", numbers that are not steps, and a missing line.
// Run with `npm test`. Only the parser runs: no model or Firestore call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTutorAnswer } from '../services/tutorService.js';

const validSteps = [1, 2, 3, 4, 5]; // the session's board steps

test('a STEPS USED line gives its steps, covered true, and is removed from the answer', () => {
  const text = 'We blur first because the derivative makes noise bigger (step 2).\nSTEPS USED: 2, 3';

  const result = parseTutorAnswer(text, validSteps);

  assert.deepEqual(result, {
    answer: 'We blur first because the derivative makes noise bigger (step 2).',
    stepsUsed: [2, 3],
    covered: true,
  });
});

test('STEPS USED: none gives no steps and covered false', () => {
  const text = 'Your saved material does not cover this. Photograph the Hough transform slide next.\nSTEPS USED: none';

  const result = parseTutorAnswer(text, validSteps);

  assert.equal(result.answer, 'Your saved material does not cover this. Photograph the Hough transform slide next.');
  assert.deepEqual(result.stepsUsed, []);
  assert.equal(result.covered, false);
});

test('numbers that are not board steps are ignored; the rest are deduplicated and sorted', () => {
  const result = parseTutorAnswer('Answer.\nSTEPS USED: 9, 3, 0, 3, 2, 42', validSteps);

  assert.deepEqual(result.stepsUsed, [2, 3]);
  assert.equal(result.covered, true);
});

test('a line with only invalid numbers counts as not covered', () => {
  const result = parseTutorAnswer('Answer.\nSTEPS USED: 7, 12', validSteps);

  assert.deepEqual(result.stepsUsed, []);
  assert.equal(result.covered, false);
  assert.equal(result.answer, 'Answer.');
});

test('a missing STEPS USED line gives no steps, covered false and the whole reply as the answer', () => {
  const result = parseTutorAnswer('  Blurring removes noise before the gradient.  ', validSteps);

  assert.deepEqual(result, { answer: 'Blurring removes noise before the gradient.', stepsUsed: [], covered: false });
});

test('only the last STEPS USED line counts, in any letter case', () => {
  const text = 'STEPS USED: 1\nThe gradient comes from Sobel.\n  steps used:  4 ';

  const result = parseTutorAnswer(text, validSteps);

  assert.deepEqual(result.stepsUsed, [4]);
  assert.equal(result.answer, 'STEPS USED: 1\nThe gradient comes from Sobel.');
});

test('an empty answer becomes the try-again message', () => {
  assert.equal(parseTutorAnswer('STEPS USED: 2', validSteps).answer, 'The tutor did not return an answer. Try again.');
  assert.equal(parseTutorAnswer('', validSteps).answer, 'The tutor did not return an answer. Try again.');
});