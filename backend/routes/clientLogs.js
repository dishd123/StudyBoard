// POST /api/client-logs (issue #150): writes the browser's log entries to Cloud Logging with source "frontend".
// The browser has no Cloud Logging access of its own, so its logger posts small entries here.
import express from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { limitClientLogs } from '../middleware/rateLimit.js';
import { writeLog } from '../services/logCall.js';

const router = express.Router();
const allowedLevels = ['INFO', 'WARNING', 'ERROR'];
const eventPattern = /^[A-Za-z0-9_]{1,60}$/; // event names such as "api_error": letters, digits and "_"
const maxMessageLength = 500; // characters
const maxDetailsLength = 2000; // characters of JSON, so one entry stays one short log line
const invalidEntryMessage = 'That log entry is not valid.';

/**
 * @param {unknown} details body.details from the browser.
 * @returns {boolean} True for a plain object whose JSON text has at most 2,000 characters.
 */
function isSmallObject(details) {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) {
    return false;
  }
  return JSON.stringify(details).length <= maxDetailsLength;
}

// POST /api/client-logs { level, event, message?, details? } -> { ok: true }; at most 120 per user per hour.
router.post('/', limitClientLogs, (req, res) => {
  const body = req.body || {}; // req.body is undefined when the request carried no JSON
  if (!allowedLevels.includes(body.level)) {
    throw new HttpError(400, invalidEntryMessage);
  }
  if (typeof body.event !== 'string' || !eventPattern.test(body.event)) {
    throw new HttpError(400, invalidEntryMessage);
  }
  // message is optional; when it is there, it must be text of at most 500 characters.
  if (body.message !== undefined && typeof body.message !== 'string') {
    throw new HttpError(400, invalidEntryMessage);
  }
  if (typeof body.message === 'string' && body.message.length > maxMessageLength) {
    throw new HttpError(400, invalidEntryMessage);
  }
  if (body.details !== undefined && !isSmallObject(body.details)) {
    throw new HttpError(400, invalidEntryMessage);
  }
  // The event name becomes the log message; clientMessage keeps the browser's text apart from the server's fields.
  writeLog(body.level, body.event, {
    source: 'frontend',
    uid: req.uid,
    clientMessage: body.message,
    details: body.details,
  });
  res.json({ ok: true });
});

export default router;