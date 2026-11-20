// Live agent check (issue #164): runs studySetPipeline and then tutorAgent on scripts/fixtures/edgeDetection.json.
// Usage: npm run test:agents (reads GEMINI_API_KEY from backend/.env). It calls Gemini; it never touches Firestore.
import fixture from './fixtures/edgeDetection.json' with { type: 'json' };
import { runAgent } from '../agents/runAgent.js';
import { createStudySetPipeline } from '../agents/studySetPipeline.js';
import { createGetSessionNotesTool } from '../agents/tools/getSessionNotes.js';
import { createTutorAgent } from '../agents/tutorAgent.js';
import { validateStudySet } from '../services/buildService.js';
import { parseTutorAnswer } from '../services/tutorService.js';

// A stand-in request context. Nothing is read from or written to Firestore, so these ids only label the log lines.
const ctx = { uid: 'test-agents-user', sessionId: 'edge-detection-fixture', gaClientId: null };

/**
 * Runs the pipeline on the fixture, as buildStudySet does, and prints what each agent produced.
 * @returns {Promise<{ summary: string, notes: object[], cards: object[] }>} The validated study set.
 * @throws {HttpError|Error} From runAgent, or from validateStudySet when the output cannot be used.
 */
async function buildFixtureStudySet() {
  const startState = { photo: fixture.photo, audio: fixture.audio };
  const result = await runAgent({
    agent: createStudySetPipeline(),
    ctx,
    operation: 'adk.studySetPipeline',
    message: 'Build the study set for this session.',
    state: startState,
    maxLlmCalls: 4, // the same limit buildStudySet uses
  });
  console.log(`Event authors, in order: ${result.authors.join(', ')}`);
  // Keys that were not in the starting state are the ones the agents wrote with outputKey.
  const writtenKeys = Object.keys(result.state).filter((key) => !(key in startState));
  console.log(`State keys written: ${writtenKeys.join(', ')}`);
  const studySet = validateStudySet(fixture.photo.steps, result.state.notes, result.state.cards);
  printStudySet(studySet);
  return studySet;
}

/**
 * Prints the validated summary, notes (with any correction) and flashcards.
 * @param {{ summary: string, notes: object[], cards: object[] }} studySet The output of validateStudySet.
 * @returns {void}
 */
function printStudySet(studySet) {
  console.log(`\nSummary: ${studySet.summary}`);
  console.log('\nValidated notes:');
  for (const note of studySet.notes) {
    console.log(`  Step ${note.stepNumber}. On the board: ${note.boardText}`);
    console.log(`    What was said: ${note.explanation ?? '-'}`);
    console.log(`    Correction: ${note.correction ?? '-'}`);
  }
  console.log(`\nFlashcards (${studySet.cards.length}):`);
  for (const card of studySet.cards) {
    console.log(`  Step ${card.stepNumber}. Q: ${card.question}`);
    console.log(`    A: ${card.answer}`);
  }
}

/**
 * Builds an in-memory stand-in for getTutorMaterial with the same shape, from the fixture and the new study set.
 * @param {{ summary: string, notes: object[], cards: object[] }} studySet The validated study set.
 * @returns {() => Promise<object>} A reader for the getSessionNotes tool to call instead of Firestore.
 */
function createFixtureMaterialReader(studySet) {
  const material = {
    title: fixture.title,
    course: fixture.course,
    steps: fixture.photo.steps,
    unreadable: fixture.photo.unreadable,
    transcript: fixture.audio.transcript,
    points: fixture.audio.points,
    summary: studySet.summary,
    notes: studySet.notes,
    cards: studySet.cards, // already only { question, answer, stepNumber }, like getTutorMaterial's cards
  };
  return async () => {
    return material;
  };
}

/**
 * Asks the tutor one question, as askTutor does but without saving it, and prints the parsed answer.
 * @param {() => Promise<object>} readMaterial The in-memory material reader.
 * @param {string} question The question to ask.
 * @returns {Promise<void>}
 * @throws {HttpError} From runAgent.
 */
async function askFixtureTutor(readMaterial, question) {
  const result = await runAgent({
    agent: createTutorAgent(createGetSessionNotesTool(ctx, readMaterial)),
    ctx,
    operation: 'adk.tutorAgent',
    message: question,
    maxLlmCalls: 4, // the same limit askTutor uses
  });
  const stepNumbers = fixture.photo.steps.map((step) => step.number);
  const parsed = parseTutorAnswer(result.finalText, stepNumbers);
  console.log(`\nQuestion: ${question}`);
  console.log(`  getSessionNotes called: ${result.toolCalls.includes('getSessionNotes')}`);
  console.log(`  Answer: ${parsed.answer}`);
  console.log(`  Steps used: [${parsed.stepsUsed.join(', ')}], covered: ${parsed.covered}`);
}

/**
 * Checks the key, then runs the pipeline and the two tutor questions.
 * @returns {Promise<void>}
 */
async function main() {
  // runAgent would answer 503 without the key; say here how to fix it.
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env, add your Gemini API key,');
    console.error('and run npm run test:agents again.');
    process.exitCode = 1;
    return;
  }
  console.log(`Model: ${process.env.GEMINI_MODEL || 'gemini-3.8-flash'}`);
  console.log('\n1. studySetPipeline on the edge detection fixture');
  const studySet = await buildFixtureStudySet();
  console.log('\n2. tutorAgent: one covered and one uncovered question');
  const readMaterial = createFixtureMaterialReader(studySet);
  await askFixtureTutor(readMaterial, fixture.questions.covered);
  await askFixtureTutor(readMaterial, fixture.questions.uncovered);
}

main().catch((error) => {
  // runAgent's HttpError and validateStudySet's Error both carry a plain message.
  console.error(`Agent test failed: ${error.message}`);
  process.exitCode = 1;
});