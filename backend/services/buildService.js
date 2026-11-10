import { randomUUID } from 'node:crypto';
import { runStudySetPipeline, StudySetPipelineError } from '../agents/studySetPipeline.js';
import { prepareNotesInput, validateNotesResult } from '../agents/notesContract.js';
import { validateBuildCardsResult } from '../agents/cardsContract.js';

const messages = {
  UNAUTHENTICATED: 'Sign in before building a study set.',
  INVALID_SESSION_ID: 'Provide a valid session ID.',
  SESSION_NOT_FOUND: 'The session could not be found or is not accessible.',
  SESSION_LOOKUP_FAILED: 'The saved session could not be loaded. Please try again.',
  INVALID_SESSION_STATE: 'The saved session has no valid update timestamp.',
  MISSING_PHOTO: 'Add a processed photo before building a study set.',
  MISSING_AUDIO: 'Add a processed recording before building a study set.',
  INVALID_NOTES_INPUT: 'The saved material must contain readable board steps and valid processed audio.',
  PIPELINE_FAILED: 'The study set could not be generated. Check the saved material and server configuration.',
  INVALID_NOTES_RESULT: 'Generated notes did not match the saved source material.',
  INVALID_CARDS_RESULT: 'Generated flashcards did not meet the required count, content, or source-step rules.',
  BUILD_RETRY_EXHAUSTED: 'The study set could not be generated after two attempts. Please try again.',
  BUILD_CONFLICT: 'The session changed during this build. Reload it before building again.',
  PERSISTENCE_FAILED: 'The build state could not be saved. Please try again.'
};
const invalidResultCodes = new Set(['INVALID_NOTES_RESULT', 'INVALID_CARDS_RESULT']);

export class BuildServiceError extends Error {
  constructor(code, { attempts = 0, failureCode } = {}) {
    super(messages[code]);
    this.name = 'BuildServiceError';
    this.code = code;
    this.attempts = attempts;
    this.failureStored = false;
    if (failureCode) this.failureCode = failureCode;
  }
}

function validateGeneratedResult(result, input) {
  try {
    if (!result || typeof result !== 'object' || Array.isArray(result)
        || Object.keys(result).length !== 2 || !Object.hasOwn(result, 'notesResult') || !Object.hasOwn(result, 'cardsResult')) {
      throw new Error();
    }
    validateNotesResult(result.notesResult, input);
  } catch {
    throw new BuildServiceError('INVALID_NOTES_RESULT');
  }
  try {
    validateBuildCardsResult(result.cardsResult, result.notesResult);
  } catch {
    throw new BuildServiceError('INVALID_CARDS_RESULT');
  }
  return structuredClone(result);
}

async function generateBuild(input, runPipeline) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await runPipeline(structuredClone(input));
      return { ...validateGeneratedResult(result, input), attempts: attempt };
    } catch (error) {
      const invalidResult = error instanceof BuildServiceError && invalidResultCodes.has(error.code);
      const code = invalidResult ? error.code : 'PIPELINE_FAILED';
      const retryable = invalidResult || (error instanceof StudySetPipelineError && error.retryable);
      if (retryable && attempt === 1) continue;
      throw new BuildServiceError(retryable ? 'BUILD_RETRY_EXHAUSTED' : code, {
        attempts: attempt,
        failureCode: retryable ? code : undefined
      });
    }
  }
}

/**
 * Required owned-session persistence boundary; no fallback database or store.
 * saveBuildState atomically compares expectedUpdatedAt, patches the session,
 * and replaces ALL card documents. It returns true, false (inaccessible), or
 * 'conflict' (session changed). Both ready and failed commits use this boundary.
 */
export function createBuildService({ getOwnedSession, saveBuildState, runPipeline = runStudySetPipeline } = {}) {
  if ([getOwnedSession, saveBuildState, runPipeline].some((helper) => typeof helper !== 'function')) {
    throw new TypeError('Build service requires getOwnedSession, saveBuildState, and runPipeline functions.');
  }
  return async function buildStudySet(context = {}) {
    const uid = context?.uid;
    const sid = context?.sid;
    if (typeof uid !== 'string' || !uid.trim()) throw new BuildServiceError('UNAUTHENTICATED');
    if (typeof sid !== 'string' || !sid.trim() || sid === '.' || sid === '..' || /[/\\]/.test(sid)) {
      throw new BuildServiceError('INVALID_SESSION_ID');
    }
    let session;
    try {
      session = await getOwnedSession({ uid, sid });
    } catch {
      throw new BuildServiceError('SESSION_LOOKUP_FAILED');
    }
    if (!session || session.id !== sid) throw new BuildServiceError('SESSION_NOT_FOUND');
    if (!session.photo) throw new BuildServiceError('MISSING_PHOTO');
    if (!session.audio) throw new BuildServiceError('MISSING_AUDIO');
    let notesInput;
    try {
      notesInput = prepareNotesInput(session);
      if (!notesInput.photo.steps.length) throw new Error();
    } catch {
      throw new BuildServiceError('INVALID_NOTES_INPUT');
    }
    const expectedUpdatedAt = session.updatedAt;
    const previousTime = typeof expectedUpdatedAt === 'string' ? Date.parse(expectedUpdatedAt) : NaN;
    if (!Number.isFinite(previousTime)) throw new BuildServiceError('INVALID_SESSION_STATE');
    // Advance even when a fast rebuild commits in the same millisecond as the source version.
    const updatedAt = () => new Date(Math.max(Date.now(), previousTime + 1)).toISOString();

    async function persist(sessionUpdate, cards, attempts) {
      let saved;
      try {
        saved = await saveBuildState({
          uid, sid, expectedUpdatedAt,
          sessionUpdate: structuredClone(sessionUpdate),
          cards: structuredClone(cards),
          replaceCards: true
        });
      } catch {
        throw new BuildServiceError('PERSISTENCE_FAILED', { attempts });
      }
      if (saved === false) throw new BuildServiceError('SESSION_NOT_FOUND', { attempts });
      if (saved === 'conflict') throw new BuildServiceError('BUILD_CONFLICT', { attempts });
      if (saved !== true) throw new BuildServiceError('PERSISTENCE_FAILED', { attempts });
    }

    async function failBuild(error) {
      const sessionUpdate = {
        status: 'failed', errorMessage: error.message,
        summary: '', notes: [], cardCount: 0, updatedAt: updatedAt()
      };
      try {
        await persist(sessionUpdate, [], error.attempts);
      } catch (saveError) {
        saveError.failureCode = error.code;
        throw saveError;
      }
      error.failureStored = true;
      throw error;
    }

    let generated;
    try {
      generated = await generateBuild(notesInput, runPipeline);
    } catch (error) {
      return failBuild(error);
    }
    const { notesResult, cardsResult, attempts } = generated;
    const cards = cardsResult.cards.map(({ question, answer, step }) => ({
      id: randomUUID(), question, answer, step, known: false
    }));
    const sessionUpdate = {
      summary: notesResult.summary,
      notes: notesResult.notes.map(({ step, boardText, explanation, correction }) => ({
        step, boardText, explanation, correction
      })),
      cardCount: cards.length,
      status: 'ready',
      errorMessage: null,
      updatedAt: updatedAt()
    };
    try {
      await persist(sessionUpdate, cards, attempts);
    } catch (error) {
      if (error.code === 'SESSION_NOT_FOUND' || error.code === 'BUILD_CONFLICT') throw error;
      return failBuild(error);
    }
    return structuredClone({ session: { id: sid, ...sessionUpdate }, notesResult, cardsResult, cards });
  };
}
