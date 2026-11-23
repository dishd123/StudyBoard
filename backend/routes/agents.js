// Agent API routes (issue #53): the ADK smoke check, building notes and flashcards, and the tutor's questions.
// Mounted at /api after requireUser. Each handler passes the verified req.uid to a service; the work happens there.
import express from 'express';
import { runAgentCheck as defaultRunAgentCheck } from '../agents/agentCheck.js';
import { HttpError } from '../middleware/errorHandler.js';
import { limitModelCalls as defaultLimitModelCalls } from '../middleware/rateLimit.js';
import { buildStudySet as defaultBuildStudySet } from '../services/buildService.js';
import { listQuestions as defaultListQuestions } from '../services/sessionStore.js';
import { askTutor as defaultAskTutor } from '../services/tutorService.js';

const maxCheckValueLength = 40; // characters

/**
 * Builds the request context that the agents and services receive.
 * @param {import('express').Request} req A request that passed requireUser.
 * @returns {{ uid: string, sessionId: string|undefined, gaClientId: string|null }} sessionId is the :sid in the URL.
 */
function requestContext(req) {
  return { uid: req.uid, sessionId: req.params.sid, gaClientId: req.gaClientId };
}

// Production uses the defaults; tests may substitute external service boundaries.
export function createAgentsRouter({
  runAgentCheck = defaultRunAgentCheck,
  buildStudySet = defaultBuildStudySet,
  askTutor = defaultAskTutor,
  listQuestions = defaultListQuestions,
  limitModelCalls = defaultLimitModelCalls
} = {}) {
  const router = express.Router();

  // GET /api/agent-check?value=<text> -> { value, answer, toolCalled }; value is 1-40 characters, "hello" when absent.
  router.get('/agent-check', limitModelCalls, async (req, res) => {
    let value = 'hello'; // used when the query has no value (or repeats it, which arrives as an array)
    if (typeof req.query.value === 'string' && req.query.value.trim() !== '') {
      value = req.query.value.trim();
    }
    if (value.length > maxCheckValueLength) {
      throw new HttpError(400, 'Send a value of 1 to 40 characters.');
    }
    const result = await runAgentCheck(requestContext(req), value);
    res.json(result);
  });

  // POST /api/sessions/:sid/build -> { session, cards }; runs notesAgent, then cardsAgent.
  router.post('/sessions/:sid/build', limitModelCalls, async (req, res) => {
    const result = await buildStudySet(requestContext(req));
    res.json(result);
  });

  // POST /api/sessions/:sid/questions { question } -> { question }, the saved Question with the tutor's answer.
  router.post('/sessions/:sid/questions', limitModelCalls, async (req, res) => {
    const body = req.body || {}; // req.body is undefined when the request carried no JSON
    const question = await askTutor(requestContext(req), body.question);
    res.json({ question });
  });

  // GET /api/sessions/:sid/questions -> { questions }, the last 20, newest first. No model call, so no rate limit.
  router.get('/sessions/:sid/questions', async (req, res) => {
    const questions = await listQuestions(req.uid, req.params.sid);
    res.json({ questions });
  });

  return router;
}

export default createAgentsRouter();
