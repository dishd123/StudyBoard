// Per-user rate limits (issue #149) for the routes that call the model and for browser log entries.
// Counts live in this server's memory, so each Cloud Run instance keeps its own counts and a restart clears them.
import { writeLog } from '../services/logCall.js';

const oneHourMs = 60 * 60 * 1000; // length of the rolling window, in milliseconds

/**
 * Builds middleware that lets each signed-in user make at most maxPerHour requests in any rolling hour.
 * Mount it after requireUser, which sets req.uid.
 * @param {{ name: string, maxPerHour: number, message: string }} options name labels the log line;
 *   message is the text sent with the 429 reply.
 * @returns {import('express').RequestHandler} Middleware that calls next() or answers 429 { error }.
 */
export function createRateLimit({ name, maxPerHour, message }) {
  const callTimesByUser = new Map(); // uid -> times of that user's calls in the last hour, in milliseconds
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const previousTimes = callTimesByUser.get(req.uid) || [];
    // Calls older than one hour no longer count against the limit.
    const recentTimes = previousTimes.filter((time) => now - time < oneHourMs);
    if (recentTimes.length >= maxPerHour) {
      callTimesByUser.set(req.uid, recentTimes);
      writeLog('WARNING', 'rate limit reached', { limit: name, uid: req.uid });
      res.status(429).json({ error: message });
      return;
    }
    recentTimes.push(now);
    callTimesByUser.set(req.uid, recentTimes);
    next();
  };
}

let modelCallsPerHour = 30; // default when MODEL_CALLS_PER_HOUR is unset or not a whole number above zero
const configuredModelCalls = Number(process.env.MODEL_CALLS_PER_HOUR);
if (Number.isInteger(configuredModelCalls) && configuredModelCalls > 0) {
  modelCallsPerHour = configuredModelCalls;
}

/** Limits Gemini and ADK requests: MODEL_CALLS_PER_HOUR per user per hour (default 30). */
export const limitModelCalls = createRateLimit({
  name: 'model',
  maxPerHour: modelCallsPerHour,
  message: 'You have reached the hourly limit for AI requests. Try again later.',
});

/** Limits browser log entries: 120 per user per hour. */
export const limitClientLogs = createRateLimit({
  name: 'clientLogs',
  maxPerHour: 120,
  message: 'Too many log entries were sent. Try again later.',
});