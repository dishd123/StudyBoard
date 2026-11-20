// Tests for validateStudySet (issue #76): the sigma correction, step checks, card limits and JSON-text outputs.
// Run with `npm test`. Only validateStudySet runs, on the steps of scripts/fixtures/edgeDetection.json: no model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../scripts/fixtures/edgeDetection.json' with { type: 'json' };
import { validateStudySet } from '../services/buildService.js';

const steps = fixture.photo.steps; // five Canny steps; step 2 is "blur G(5x5), s=1.4"

/**
 * Builds a notesAgent-style output: one note per step, with the spoken sigma correction on step 2.
 * @returns {{ summary: string, notes: object[] }} A new object each call, so tests can change it freely.
 */
function makeNotesOutput() {
  const notes = [];
  for (const step of steps) {
    const explanation = `Why step ${step.number} matters.`;
    notes.push({ stepNumber: step.number, boardText: step.text, explanation, correction: null });
  }
  notes[1].correction = 'sigma 2, not 1.4 as written'; // notes[1] is step 2
  return {
    summary: 'Canny edge detection finds edges in five steps. Blurring first keeps noise from looking like edges.',
    notes,
  };
}

/**
 * Builds a cardsAgent-style output with valid cards that cycle through steps 1-5.
 * @param {number} count How many cards to write.
 * @returns {{ cards: object[] }}
 */
function makeCardsOutput(count) {
  const cards = [];
  for (let index = 0; index < count; index += 1) {
    const stepNumber = (index % steps.length) + 1; // 1, 2, 3, 4, 5, 1, ...
    const question = `Why does step ${stepNumber} come here (${index + 1})?`;
    cards.push({ question, answer: `Reason ${index + 1}.`, stepNumber });
  }
  return { cards };
}

test('the sigma correction keeps both values: the board text and the spoken correction', () => {
  const notesOutput = makeNotesOutput();
  notesOutput.notes[1].boardText = 'blur G(5x5), s=2'; // the model "fixed" the board text; it must not stick

  const result = validateStudySet(steps, notesOutput, makeCardsOutput(5));

  const stepTwo = result.notes.find((note) => note.stepNumber === 2);
  assert.equal(stepTwo.boardText, 'blur G(5x5), s=1.4'); // always the photo's text
  assert.equal(stepTwo.correction, 'sigma 2, not 1.4 as written');
  assert.match(stepTwo.correction, /2/);
  assert.match(stepTwo.correction, /1\.4/);
});

test('a note or card for a step that is not on the photo is dropped', () => {
  const notesOutput = makeNotesOutput();
  notesOutput.notes.push({ stepNumber: 9, boardText: 'invented step', explanation: 'Made up.', correction: null });
  const cardsOutput = makeCardsOutput(5);
  cardsOutput.cards.push({ question: 'About step 9?', answer: 'Made up.', stepNumber: 9 });

  const result = validateStudySet(steps, notesOutput, cardsOutput);

  assert.deepEqual(result.notes.map((note) => note.stepNumber), [1, 2, 3, 4, 5]);
  assert.equal(result.cards.length, 5);
  assert.ok(result.cards.every((card) => card.stepNumber !== 9));
});

test('a step the model skipped is filled from the photo with no explanation or correction', () => {
  const notesOutput = makeNotesOutput();
  notesOutput.notes.splice(3, 1); // remove step 4's note

  const result = validateStudySet(steps, notesOutput, makeCardsOutput(5));

  assert.equal(result.notes.length, 5);
  assert.deepEqual(result.notes[3], {
    stepNumber: 4,
    boardText: 'non-max suppression (thin edges)',
    explanation: null,
    correction: null,
  });
});

test('the first note per step is kept and the notes come back in step order', () => {
  const notesOutput = makeNotesOutput();
  notesOutput.notes.reverse();
  notesOutput.notes.push({ stepNumber: 1, boardText: 'grayscale I', explanation: 'A second note.', correction: null });

  const result = validateStudySet(steps, notesOutput, makeCardsOutput(5));

  assert.deepEqual(result.notes.map((note) => note.stepNumber), [1, 2, 3, 4, 5]);
  assert.equal(result.notes[0].explanation, 'Why step 1 matters.');
});

test('strings are trimmed and an empty string becomes null', () => {
  const notesOutput = makeNotesOutput();
  notesOutput.notes[0].explanation = '   ';
  notesOutput.notes[2].explanation = '  Sobel finds the gradient.  ';

  const result = validateStudySet(steps, notesOutput, makeCardsOutput(5));

  assert.equal(result.notes[0].explanation, null);
  assert.equal(result.notes[2].explanation, 'Sobel finds the gradient.');
});

test('fewer than 3 usable cards fails, and cards with an empty question or answer do not count', () => {
  const cardsOutput = makeCardsOutput(3);
  cardsOutput.cards[2].answer = '  ';

  assert.throws(() => validateStudySet(steps, makeNotesOutput(), cardsOutput), /at least 3/);
  assert.throws(() => validateStudySet(steps, makeNotesOutput(), makeCardsOutput(2)), /at least 3/);
});

test('more than 12 cards are cut to the first 12', () => {
  const cardsOutput = makeCardsOutput(15);

  const result = validateStudySet(steps, makeNotesOutput(), cardsOutput);

  assert.equal(result.cards.length, 12);
  assert.deepEqual(result.cards, cardsOutput.cards.slice(0, 12));
});

test('outputs given as JSON text are accepted like objects', () => {
  const notesOutput = makeNotesOutput();
  const cardsOutput = makeCardsOutput(5);

  const fromText = validateStudySet(steps, JSON.stringify(notesOutput), JSON.stringify(cardsOutput));
  const fromObjects = validateStudySet(steps, notesOutput, cardsOutput);

  assert.deepEqual(fromText, fromObjects);
});

test('text that is not JSON fails with a fixed message that does not quote it', () => {
  const brokenText = 'Here are your notes: grayscale';

  assert.throws(() => validateStudySet(steps, brokenText, makeCardsOutput(5)), (error) => {
    assert.equal(error.message, 'The notes output is not valid JSON.');
    return true;
  });
});

test('a missing summary or a missing output fails', () => {
  const notesOutput = makeNotesOutput();
  notesOutput.summary = ' ';

  assert.throws(() => validateStudySet(steps, notesOutput, makeCardsOutput(5)), /no summary/);
  assert.throws(() => validateStudySet(steps, makeNotesOutput(), undefined), /cards output is missing/);
});