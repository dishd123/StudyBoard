// Error handling for the API (issue #148): HttpError for expected failures, notFound, and the final errorHandler.
// Every failure reaches the browser as { error: "<message safe to show>" }.
import { writeLog } from '../services/logCall.js';

/**
 * An expected failure whose message is safe to show the user, for example a missing session.
 * @param {number} status HTTP status code to send, for example 404.
 * @param {string} message Plain sentence the browser shows.
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Answers any /api request that no router handled.
 * @param {import('express').Request} req The request.
 * @param {import('express').Response} res Receives 404 { error }.
 * @returns {void}
 */
export function notFound(req, res) {
  res.status(404).json({ error: 'That API route does not exist.' });
}

/**
 * Turns any error from a route or middleware into a JSON reply.
 * Express treats a function with four parameters as an error handler, so next stays in the list.
 * @param {Error} err The error that was thrown or passed to next().
 * @param {import('express').Request} req The request.
 * @param {import('express').Response} res Receives the status and { error }.
 * @param {import('express').NextFunction} next Used only when the reply has already started.
 * @returns {void}
 */
export function errorHandler(err, req, res, next) {
  // A reply that has started cannot be changed; Express's built-in handler then closes the connection.
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // express.json() and express.raw() label their own failures with err.type.
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'That file is too large.' });
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request was not valid JSON.' });
    return;
  }
  // Express rejects a malformed escape in a route id, such as %E0, before sessionRef can check the id.
  if (err instanceof URIError) {
    res.status(400).json({ error: 'That link is not valid.' });
    return;
  }
  // Anything else is a bug or an outage: log it for the developer, show the user a plain message.
  writeLog('ERROR', 'unhandled error', {
    path: req.path, // no query string, which can hold user text
    errorMessage: String(err.message).slice(0, 200), // same 200-character cap as logCall
  });
  res.status(500).json({ error: 'Something went wrong. Try again.' });
}