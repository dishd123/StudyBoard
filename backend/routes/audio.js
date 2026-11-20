// Recording upload API (issue #45), mounted at /api/sessions after requireUser.
// POST /:sid/audio takes the raw recording, has Gemini transcribe it, and saves the text; the audio is never stored.
import express from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { limitModelCalls } from '../middleware/rateLimit.js';
import { readRecording, toGeminiAudioType } from '../services/geminiAudioService.js';
import { getSession, saveAudioResult } from '../services/sessionStore.js';

const router = express.Router();
const maxDurationSeconds = 180; // the recorder stops itself at 3:00
// Reads the body as raw bytes on this route only, for audio types only; a body over 10 MB gets 413.
const readAudioBody = express.raw({ type: 'audio/*', limit: '10mb' });

/**
 * Reads the recording length the browser measured.
 * @param {unknown} value req.query.durationSeconds
 * @returns {number} Whole seconds from 0 to 180; a missing or non-numeric value counts as 0.
 */
function readDurationSeconds(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  if (seconds > maxDurationSeconds) {
    return maxDurationSeconds;
  }
  return seconds;
}

// POST /api/sessions/:sid/audio?durationSeconds=N, body = the recording -> { session } with the transcript.
router.post('/:sid/audio', limitModelCalls, readAudioBody, async (req, res) => {
  // Check the type first: express.raw reads only audio/* bodies, so a text/plain upload would look empty.
  const contentType = req.get('Content-Type');
  if (toGeminiAudioType(contentType) === null) {
    throw new HttpError(415, 'This audio format is not supported. Try Chrome, Edge or Safari.');
  }
  // req.body is a Buffer only when express.raw read an audio body.
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new HttpError(400, 'The recording is empty.');
  }
  const ctx = { uid: req.uid, sessionId: req.params.sid, gaClientId: req.gaClientId };
  // 404 before the model is called when the session is not this user's.
  await getSession(ctx.uid, ctx.sessionId);
  const recording = await readRecording(ctx, req.body, contentType);
  if (recording.transcript === '') {
    throw new HttpError(422, 'We could not hear any speech. Record again closer to the microphone.');
  }
  const session = await saveAudioResult(ctx.uid, ctx.sessionId, {
    transcript: recording.transcript,
    points: recording.points,
    durationSeconds: readDurationSeconds(req.query.durationSeconds),
  });
  res.json({ session });
});

export default router;