// Shared ADK runner (issue #163): runs any agent or pipeline once for one request, with InMemoryRunner.
// Returns the final reply text, the session state the agents wrote, the tools the model called and each event's author.
import { InMemoryRunner, getFunctionCalls, isFinalResponse, setLogger, stringifyContent } from '@google/adk';
import { HttpError } from '../middleware/errorHandler.js';
import { sendServerEvent } from '../services/ga4Service.js';
import { logCall } from '../services/logCall.js';

const appName = 'studyboard'; // ADK groups its sessions by app name
const busyErrorCodes = ['429', 'RESOURCE_EXHAUSTED']; // the codes Gemini uses for "too many requests"
const busyMessage = 'The AI service is busy. Wait a minute and try again.';
const failedMessage = 'The AI service could not process this. Try again.';

// ADK's own logger can print part of a model reply that is not JSON; logCall below logs every agent run instead.
setLogger(null);

/**
 * Runs one agent once, in a new in-memory ADK session that is deleted afterwards.
 * @param {object} options
 * @param {import('@google/adk').BaseAgent} options.agent An agent built for this request.
 * @param {{ uid: string, sessionId?: string, gaClientId: string|null }} options.ctx Request context from the route.
 * @param {string} options.operation Name for logs and analytics, for example 'adk.tutorAgent'.
 * @param {string} options.message The user turn the agent receives.
 * @param {object} [options.state] Starting session state; instructions read it through {placeholders}.
 * @param {number} options.maxLlmCalls The most model calls this run may make.
 * @returns {Promise<{ finalText: string, state: object, toolCalls: string[], authors: string[] }>}
 *   finalText is the last final reply ('' when there is none), state is the session state after the run,
 *   toolCalls names each tool the model called, authors names who wrote each event, in order.
 * @throws {HttpError} 503 when GEMINI_API_KEY is not set, 429 when Gemini is over its quota, 502 for any other failure.
 */
export async function runAgent({ agent, ctx, operation, message, state, maxLlmCalls }) {
  const startedAt = Date.now();
  try {
    const result = await logCall({ operation, uid: ctx.uid, sessionId: ctx.sessionId }, async (extra) => {
      // ADK reads the key only at its first model call; checking here gives a clear 503 and a log line.
      if (!process.env.GEMINI_API_KEY) {
        throw new HttpError(503, 'The AI service is not set up yet.');
      }
      return runInNewSession({ agent, ctx, message, state, maxLlmCalls, extra });
    });
    // GA4 parameter names are snake_case, such as latency_ms.
    sendServerEvent(ctx, 'agent_run', { agent: operation, success: 1, latency_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    sendServerEvent(ctx, 'agent_run', { agent: operation, success: 0, latency_ms: Date.now() - startedAt });
    // Expected failures keep their status; any other ADK or Gemini failure reaches the user as one plain 502.
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(502, failedMessage);
  }
}

/**
 * Creates the runner and its session, reads every event of the run, then deletes the session.
 * @param {object} options agent, ctx, message, state and maxLlmCalls as in runAgent, and extra, logCall's log fields.
 * @returns {Promise<{ finalText: string, state: object, toolCalls: string[], authors: string[] }>} As in runAgent.
 * @throws {HttpError} 429 when Gemini is over its quota.
 * @throws {Error} For any other model error or ADK failure.
 */
async function runInNewSession({ agent, ctx, message, state, maxLlmCalls, extra }) {
  // A new runner per request, so its in-memory session can never outlive this request.
  const runner = new InMemoryRunner({ agent, appName });
  const session = await runner.sessionService.createSession({ appName, userId: ctx.uid, state });
  const sessionKey = { appName, userId: ctx.uid, sessionId: session.id };
  try {
    let finalText = '';
    const toolCalls = [];
    const authors = [];
    const events = runner.runAsync({
      userId: ctx.uid,
      sessionId: session.id,
      newMessage: { role: 'user', parts: [{ text: message }] },
      runConfig: { maxLlmCalls },
    });
    for await (const event of events) {
      // Gemini errors (quota, bad request, outage) arrive as events with errorCode, not as exceptions.
      if (event.errorCode) {
        if (busyErrorCodes.includes(String(event.errorCode))) {
          throw new HttpError(429, busyMessage);
        }
        throw new Error(`${event.author}: ${event.errorCode} ${event.errorMessage}`);
      }
      authors.push(event.author);
      for (const functionCall of getFunctionCalls(event)) {
        toolCalls.push(functionCall.name);
      }
      extra.toolCalls = toolCalls.length; // logCall logs it on success and on failure
      if (isFinalResponse(event)) {
        const text = stringifyContent(event); // the text parts, without thinking text
        // An event with no text, such as a usage-only report, must not erase the answer.
        if (text !== '') {
          finalText = text;
        }
      }
    }
    // The state now also holds what the agents saved with outputKey, such as notes and cards.
    const finishedSession = await runner.sessionService.getSession(sessionKey);
    return { finalText, state: finishedSession.state, toolCalls, authors };
  } finally {
    await runner.sessionService.deleteSession(sessionKey);
  }
}