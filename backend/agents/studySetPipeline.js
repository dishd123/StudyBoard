import { randomUUID } from 'node:crypto';
import { InMemoryRunner, SequentialAgent } from '@google/adk';
import { createNotesAgent } from './notesAgent.js';
import { createCardsAgent } from './cardsAgent.js';
import {
  NotesAgentError, notesInputKey, notesOutputKey, prepareNotesInput, validateNotesResult
} from './notesContract.js';
import { CardsAgentError, cardsOutputKey, validateCardsResult } from './cardsContract.js';

const appName = 'StudyBoardStudySet';
const localUserId = 'study-set-build';
const errorMessages = {
  INVALID_NOTES_INPUT: 'Provide valid saved board and audio text results before building a study set.',
  NOTES_AGENT_FAILED: 'Study notes could not be generated. Please try again.',
  MISSING_NOTES_RESULT: 'The study-set pipeline returned no notes result.',
  INVALID_NOTES_RESULT: 'The study-set pipeline returned invalid notes.',
  CARDS_AGENT_FAILED: 'Flashcards could not be generated. Please try again.',
  MISSING_CARDS_RESULT: 'The study-set pipeline returned no flashcard result.',
  INVALID_CARDS_RESULT: 'The study-set pipeline returned invalid flashcards.',
  ADK_EXECUTION_FAILED: 'The study-set pipeline could not complete. Please try again.',
  ADK_SESSION_CLEANUP_FAILED: 'The temporary study-set session could not be discarded.'
};

export class StudySetPipelineError extends Error {
  constructor(code) {
    super(errorMessages[code]);
    this.name = 'StudySetPipelineError';
    this.code = code;
  }
}

/** Fresh child instances avoid assigning an agent to more than one ADK parent. */
export function createStudySetPipeline({ notesModel, cardsModel } = {}) {
  return new SequentialAgent({
    name: 'studySetPipeline',
    description: 'Generate aligned notes, then flashcards from the saved notesResult.',
    subAgents: [
      createNotesAgent({ model: notesModel }),
      createCardsAgent({ model: cardsModel })
    ]
  });
}

function executionError(error) {
  if (error instanceof StudySetPipelineError) return error;
  if (error instanceof NotesAgentError) return new StudySetPipelineError('NOTES_AGENT_FAILED');
  if (error instanceof CardsAgentError) return new StudySetPipelineError('CARDS_AGENT_FAILED');
  return new StudySetPipelineError('ADK_EXECUTION_FAILED');
}

function validateStateResults(state, input) {
  const notesResult = state[notesOutputKey];
  if (notesResult === undefined || notesResult === null) {
    throw new StudySetPipelineError('MISSING_NOTES_RESULT');
  }
  try {
    validateNotesResult(notesResult, input);
  } catch {
    throw new StudySetPipelineError('INVALID_NOTES_RESULT');
  }
  const cardsResult = state[cardsOutputKey];
  if (cardsResult === undefined || cardsResult === null) {
    throw new StudySetPipelineError('MISSING_CARDS_RESULT');
  }
  try {
    validateCardsResult(cardsResult, notesResult);
  } catch {
    throw new StudySetPipelineError('INVALID_CARDS_RESULT');
  }
  return structuredClone({ notesResult, cardsResult });
}

/** Factory hooks allow offline ADK checks without changing the production agents. */
export function createStudySetExecutor({
  createPipeline = createStudySetPipeline,
  createRunner = (agent) => new InMemoryRunner({ agent, appName })
} = {}) {
  if (typeof createPipeline !== 'function' || typeof createRunner !== 'function') {
    throw new TypeError('Study-set execution requires pipeline and runner factories.');
  }
  return async function runStudySetPipeline(input) {
    let notesInput;
    try {
      notesInput = prepareNotesInput(input);
    } catch {
      throw new StudySetPipelineError('INVALID_NOTES_INPUT');
    }

    let runner;
    let address;
    let result;
    let failure;
    try {
      runner = createRunner(createPipeline());
      address = { appName: runner.appName, userId: localUserId, sessionId: randomUUID() };
      await runner.sessionService.createSession({
        ...address,
        state: { [notesInputKey]: structuredClone(notesInput) }
      });
      for await (const event of runner.runAsync({
        userId: address.userId,
        sessionId: address.sessionId,
        newMessage: { role: 'user', parts: [{ text: 'Build a study set using the saved structured input.' }] },
        runConfig: { streamingMode: 'none', saveInputBlobsAsArtifacts: false }
      })) {
        if (event.errorCode) {
          const code = event.author === 'notesAgent' ? 'NOTES_AGENT_FAILED'
            : event.author === 'cardsAgent' ? 'CARDS_AGENT_FAILED' : 'ADK_EXECUTION_FAILED';
          throw new StudySetPipelineError(code);
        }
      }
      const session = await runner.sessionService.getSession(address);
      if (!session?.state || typeof session.state !== 'object' || Array.isArray(session.state)) {
        throw new StudySetPipelineError('ADK_EXECUTION_FAILED');
      }
      result = validateStateResults(session.state, notesInput);
    } catch (error) {
      failure = executionError(error);
    } finally {
      // Also attempt deletion if session creation only partially completed.
      if (runner && address) {
        try {
          await runner.sessionService.deleteSession(address);
        } catch {
          failure ??= new StudySetPipelineError('ADK_SESSION_CLEANUP_FAILED');
        }
      }
    }
    if (failure) throw failure;
    return result;
  };
}

export const studySetPipeline = createStudySetPipeline();
export const runStudySetPipeline = createStudySetExecutor();
