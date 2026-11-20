// Tutor service (issue #52): asks tutorAgent a typed question, reads its "STEPS USED:" line and saves the answer.
// The tutor's tool is built around this request's uid and session, so it can only read this student's material.
import { runAgent } from '../agents/runAgent.js';
import { createGetSessionNotesTool } from '../agents/tools/getSessionNotes.js';
import { createTutorAgent } from '../agents/tutorAgent.js';
import { HttpError } from '../middleware/errorHandler.js';
import { writeLog } from './logCall.js';
import { addQuestion, getSession } from './sessionStore.js';

const maxQuestionLength = 500; // characters
// The tutor's last line, such as "STEPS USED: 2, 3". The i flag also matches "Steps used:", and [\s*_]* skips
// Markdown bold or italics around the label, such as "**STEPS USED:** 2, 3".
const stepsUsedPattern = /^[\s*_]*STEPS USED:[\s*_]*(.*)$/i;
const emptyAnswerMessage = 'The tutor did not return an answer. Try again.';

/**
 * Splits the tutor's reply into the answer and the board steps it used.
 * @param {string} text The tutor's final reply.
 * @param {number[]} validStepNumbers The session's step numbers; any other number in the line is ignored.
 * @returns {{ answer: string, stepsUsed: number[], covered: boolean }} stepsUsed is deduplicated and ascending;
 *   covered is true when at least one valid step was used.
 */
export function parseTutorAnswer(text, validStepNumbers) {
  const lines = text.split(/\r?\n/);
  // Search from the end: only the last STEPS USED line counts.
  let stepsLineIndex = -1;
  let listedText = '';
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(stepsUsedPattern);
    if (match) {
      stepsLineIndex = index;
      listedText = match[1]; // what follows "STEPS USED:"
      break;
    }
  }
  // No STEPS USED line: the whole reply is the answer, and it cites no steps.
  if (stepsLineIndex === -1) {
    return { answer: answerOrMessage(text.trim()), stepsUsed: [], covered: false };
  }
  const numberTexts = listedText.match(/\d+/g) || []; // every whole number in the line; "none" has none
  const stepsUsed = [];
  for (const numberText of numberTexts) {
    const stepNumber = Number(numberText);
    if (validStepNumbers.includes(stepNumber) && !stepsUsed.includes(stepNumber)) {
      stepsUsed.push(stepNumber);
    }
  }
  stepsUsed.sort((first, second) => first - second);
  lines.splice(stepsLineIndex, 1); // the answer is the reply without its STEPS USED line
  const answer = lines.join('\n').trim();
  return { answer: answerOrMessage(answer), stepsUsed, covered: stepsUsed.length > 0 };
}

/**
 * Asks the tutor one question about the session and saves the question with its answer.
 * @param {{ uid: string, sessionId: string, gaClientId: string|null }} ctx Request context from the route.
 * @param {unknown} questionText body.question from the request.
 * @returns {Promise<object>} The saved Question: { id, question, answer, stepsUsed, covered, askedAt }.
 * @throws {HttpError} 400 for a question that is not 1-500 characters; 409 before notes exist; 404 for a missing
 *   session; 429, 502 or 503 from runAgent.
 */
export async function askTutor(ctx, questionText) {
  if (typeof questionText !== 'string') {
    throw new HttpError(400, 'Type a question of 1 to 500 characters.');
  }
  const question = questionText.trim();
  if (question.length === 0 || question.length > maxQuestionLength) {
    throw new HttpError(400, 'Type a question of 1 to 500 characters.');
  }
  const session = await getSession(ctx.uid, ctx.sessionId);
  // The tutor answers from the notes and flashcards, so a build must come first.
  if (!Array.isArray(session.notes) || session.notes.length === 0) {
    throw new HttpError(409, 'Make notes and flashcards first.');
  }
  const result = await runAgent({
    agent: createTutorAgent(createGetSessionNotesTool(ctx)),
    ctx,
    operation: 'adk.tutorAgent',
    message: question,
    maxLlmCalls: 4, // one call that asks for the tool, one answer, and room for two more
  });
  // ADK cannot force a tool call first, so a skipped call is logged instead of failing the answer.
  if (!result.toolCalls.includes('getSessionNotes')) {
    writeLog('WARNING', 'tutor answered without getSessionNotes', {
      operation: 'adk.tutorAgent',
      uid: ctx.uid,
      sessionId: ctx.sessionId,
    });
  }
  // The notes hold one entry per board step, so their step numbers are the steps the tutor may cite.
  const stepNumbers = session.notes.map((note) => note.stepNumber);
  const parsed = parseTutorAnswer(result.finalText, stepNumbers);
  return addQuestion(ctx.uid, ctx.sessionId, {
    question,
    answer: parsed.answer,
    stepsUsed: parsed.stepsUsed,
    covered: parsed.covered,
  });
}

/**
 * @param {string} answer The tutor's answer without its STEPS USED line.
 * @returns {string} The answer, or a try-again message when it is empty.
 */
function answerOrMessage(answer) {
  if (answer === '') {
    return emptyAnswerMessage;
  }
  return answer;
}