// Build service (issue #49): runs studySetPipeline, checks its notes and cards against the photo, and saves them.
// A bad result is retried once; after a second failure the session is marked failed with a plain message.
import { runAgent } from '../agents/runAgent.js';
import { createStudySetPipeline } from '../agents/studySetPipeline.js';
import { HttpError } from '../middleware/errorHandler.js';
import { writeLog } from './logCall.js';
import { getSession, markBuildFailed, saveStudySet } from './sessionStore.js';

const maxAttempts = 2; // the first try and one retry
const minCards = 3; // fewer usable cards than this fails the build
const maxCards = 12; // extra cards beyond this are dropped
const buildFailedMessage = 'We could not build notes from this material. Try Rebuild, or replace the photo.';

/**
 * Checks the agents' output against the photo's steps and returns only what may be saved.
 * Never trusts the model: every step number, string and count is checked here.
 * @param {{ number: number, text: string }[]} steps The board steps saved from the photo.
 * @param {object|string} notesOutput state.notes: { summary, notes }, as an object or as JSON text.
 * @param {object|string} cardsOutput state.cards: { cards }, as an object or as JSON text.
 * @returns {{ summary: string, notes: object[], cards: object[] }} One note per photo step, in step order,
 *   and 3-12 cards.
 * @throws {Error} With the reason when the output cannot be used; the caller then retries.
 */
export function validateStudySet(steps, notesOutput, cardsOutput) {
  const notesResult = readAgentOutput(notesOutput, 'notes');
  const cardsResult = readAgentOutput(cardsOutput, 'cards');
  const summary = textOrNull(notesResult.summary);
  if (summary === null) {
    throw new Error('The notes have no summary.');
  }
  if (!Array.isArray(notesResult.notes)) {
    throw new Error('The notes output has no notes list.');
  }
  if (!Array.isArray(cardsResult.cards)) {
    throw new Error('The cards output has no cards list.');
  }
  const notes = buildNotes(steps, notesResult.notes);
  const cards = buildCards(steps, cardsResult.cards);
  return { summary, notes, cards };
}

/**
 * Builds the session's notes and flashcards with the agents and saves them.
 * @param {{ uid: string, sessionId: string, gaClientId: string|null }} ctx Request context from the route.
 * @returns {Promise<{ session: object, cards: object[] }>} The ready Session and its new Cards.
 * @throws {HttpError} 409 without a photo and a recording; 502 after two failed attempts (the session is then
 *   marked failed); 429 or 503 from runAgent; 400 or 404 from the store.
 */
export async function buildStudySet(ctx) {
  const session = await getSession(ctx.uid, ctx.sessionId);
  // The agents pair board steps with what was said, so both must exist.
  const hasSteps = session.photo !== null && session.photo.steps.length > 0;
  const hasTranscript = session.audio !== null && session.audio.transcript.trim() !== '';
  if (!hasSteps || !hasTranscript) {
    throw new HttpError(409, 'Add a photo and a recording first.');
  }
  const studySet = await generateStudySet(ctx, session.photo, session.audio);
  // Two failed attempts: the failed status and message stay on the session, so the page can show them later.
  if (studySet === null) {
    await markBuildFailed(ctx.uid, ctx.sessionId, buildFailedMessage);
    throw new HttpError(502, buildFailedMessage);
  }
  return saveStudySet(ctx.uid, ctx.sessionId, studySet);
}

/**
 * Runs the pipeline up to twice and returns the first study set that passes validateStudySet.
 * @param {object} ctx Request context.
 * @param {object} photo The session's photo; only title, steps and unreadable go to the model, never the thumbnail.
 * @param {object} audio The session's recording result; only transcript and points go to the model.
 * @returns {Promise<object|null>} The validated { summary, notes, cards }, or null after two failures.
 * @throws {HttpError} 429 or 503 from runAgent; neither would improve on a retry.
 */
async function generateStudySet(ctx, photo, audio) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await runAgent({
        agent: createStudySetPipeline(), // a new pipeline per attempt: an agent can have only one parent
        ctx,
        operation: 'adk.studySetPipeline',
        message: 'Build the study set for this session.',
        state: {
          photo: { title: photo.title, steps: photo.steps, unreadable: photo.unreadable },
          audio: { transcript: audio.transcript, points: audio.points },
        },
        maxLlmCalls: 4, // the limit covers both agents; each needs one call, so two are spare
      });
      return validateStudySet(photo.steps, result.state.notes, result.state.cards);
    } catch (error) {
      // A busy (429) or unconfigured (503) AI service is not a bad result, so it is not retried.
      if (error instanceof HttpError && error.status !== 502) {
        throw error;
      }
      // The reason is a fixed sentence, never model text, so it is safe to log.
      writeLog('WARNING', 'study set attempt failed', {
        operation: 'adk.studySetPipeline',
        uid: ctx.uid,
        sessionId: ctx.sessionId,
        attempt,
        errorMessage: error.message,
      });
    }
  }
  return null;
}

/**
 * Turns an agent's saved output into an object. ADK saves the parsed object, or the raw text when it was not JSON.
 * @param {unknown} output state.notes or state.cards.
 * @param {string} name 'notes' or 'cards', for the error message.
 * @returns {object} The output as an object.
 * @throws {Error} When the output is missing, is not valid JSON, or is not a JSON object.
 */
function readAgentOutput(output, name) {
  let value = output;
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output);
    } catch {
      // A fixed message: JSON.parse's own message quotes the text, which holds the student's material.
      throw new Error(`The ${name} output is not valid JSON.`);
    }
  }
  if (!isObject(value)) {
    throw new Error(`The ${name} output is missing.`);
  }
  return value;
}

/**
 * Makes one note per photo step, in step order, from the model's notes.
 * @param {{ number: number, text: string }[]} steps The photo's board steps.
 * @param {unknown[]} modelNotes The notes list the model wrote.
 * @returns {{ stepNumber: number, boardText: string, explanation: string|null, correction: string|null }[]}
 */
function buildNotes(steps, modelNotes) {
  const stepNumbers = steps.map((step) => step.number);
  // The first note the model wrote for each photo step; notes for any other step number are dropped.
  const noteByStep = new Map();
  for (const note of modelNotes) {
    if (isObject(note) && stepNumbers.includes(note.stepNumber) && !noteByStep.has(note.stepNumber)) {
      noteByStep.set(note.stepNumber, note);
    }
  }
  // Sort a copy: sort() reorders its array in place, and steps belongs to the caller.
  const sortedSteps = [...steps].sort((first, second) => first.number - second.number);
  return sortedSteps.map((step) => {
    const modelNote = noteByStep.get(step.number) || {}; // a step the model skipped gets an empty note
    return {
      stepNumber: step.number,
      boardText: step.text, // always the photo's text, never the model's copy
      explanation: textOrNull(modelNote.explanation),
      correction: textOrNull(modelNote.correction),
    };
  });
}

/**
 * Keeps the model's usable flashcards: a photo step and a non-empty question and answer.
 * @param {{ number: number, text: string }[]} steps The photo's board steps.
 * @param {unknown[]} modelCards The cards list the model wrote.
 * @returns {{ question: string, answer: string, stepNumber: number }[]} At most 12 cards, in the model's order.
 * @throws {Error} When fewer than 3 cards are usable.
 */
function buildCards(steps, modelCards) {
  const stepNumbers = steps.map((step) => step.number);
  const cards = [];
  for (const card of modelCards) {
    if (!isObject(card) || !stepNumbers.includes(card.stepNumber)) {
      continue;
    }
    const question = textOrNull(card.question);
    const answer = textOrNull(card.answer);
    if (question === null || answer === null) {
      continue;
    }
    cards.push({ question, answer, stepNumber: card.stepNumber });
  }
  if (cards.length < minCards) {
    throw new Error(`Only ${cards.length} usable flashcards; at least ${minCards} are needed.`);
  }
  return cards.slice(0, maxCards);
}

/**
 * @param {unknown} value A field the model wrote.
 * @returns {string|null} The text without surrounding spaces, or null when it is not text or is empty.
 */
function textOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (text === '') {
    return null;
  }
  return text;
}

/**
 * @param {unknown} value Anything from the model's output.
 * @returns {boolean} True for a plain object (not null, not an array).
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}