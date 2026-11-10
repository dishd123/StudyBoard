import { Router } from 'express';
import multer from 'multer';
import {
  analyzeAudio as analyzeGeminiAudio,
  AudioProcessingError,
  validateAudioResult
} from '../services/geminiAudioService.js';

const maxAudioBytes = 10 * 1024 * 1024;
const supportedMimeTypes = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg',
  'audio/aac', 'audio/flac', 'audio/mp3', 'audio/m4a', 'audio/aiff'
]);

class AudioRouteError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeMimeType(mimeType) {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  return type === 'audio/x-wav' ? 'audio/wav' : type;
}

function discardUpload(req) {
  req.file?.buffer?.fill(0);
  delete req.file;
}

function readDuration(body) {
  if (Object.keys(body).some((key) => key !== 'durationSeconds')) {
    throw new AudioRouteError(400, 'INVALID_UPLOAD', 'Only audio and optional durationSeconds fields are accepted.');
  }
  if (body.durationSeconds === undefined) return undefined;
  const value = body.durationSeconds;
  const duration = typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(duration) || duration < 0 || duration > 180) {
    throw new AudioRouteError(400, 'INVALID_DURATION', 'durationSeconds must be a number from 0 to 180.');
  }
  return duration;
}

function processingError(error) {
  if (error instanceof AudioProcessingError && error.code === 'MISSING_API_KEY') {
    return new AudioRouteError(503, 'AUDIO_SERVICE_UNAVAILABLE', 'Audio processing is not configured. Please try again later.');
  }
  if (error instanceof AudioProcessingError && ['MISSING_MODEL_RESPONSE', 'MALFORMED_MODEL_JSON', 'INVALID_AUDIO_RESULT'].includes(error.code)) {
    return new AudioRouteError(502, 'INVALID_AUDIO_RESULT', 'Audio processing returned an invalid result. Please try again.');
  }
  return new AudioRouteError(502, 'AUDIO_PROCESSING_FAILED', 'Audio processing could not complete. Please try again.');
}

function uploadError(error) {
  if (error instanceof AudioRouteError) return error;
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return new AudioRouteError(413, 'AUDIO_TOO_LARGE', 'The recording must be no larger than 10 MB (10,485,760 bytes).');
  }
  return new AudioRouteError(400, 'INVALID_UPLOAD', 'Send one audio file and at most one durationSeconds field in a valid multipart form.');
}

/**
 * Mount at the application root, after middleware that verifies Firebase tokens
 * and sets req.user.uid. Both persistence helpers are required; no fallback store.
 *
 * getOwnedSession({ uid, sid }) -> owned session with id === sid, or null.
 * saveAudioResult({ uid, sid, sessionUpdate, invalidateGeneratedMaterial }) ->
 * true only after an atomic commit; false if the session is no longer accessible.
 * The save must recheck ownership and invalidate stored cards with the update.
 */
export function createAudioRouter({
  analyzeAudio = analyzeGeminiAudio,
  getOwnedSession,
  saveAudioResult
} = {}) {
  if ([analyzeAudio, getOwnedSession, saveAudioResult].some((helper) => typeof helper !== 'function')) {
    throw new TypeError('Audio router requires analyzeAudio, getOwnedSession, and saveAudioResult functions.');
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxAudioBytes,
      files: 1,
      fields: 1,
      parts: 2,
      fieldSize: 64,
      fieldNameSize: 32,
      fieldNestingDepth: 0
    },
    fileFilter(_req, file, callback) {
      if (!supportedMimeTypes.has(normalizeMimeType(file.mimetype))) {
        return callback(new AudioRouteError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The recording must use a supported audio MIME type.'));
      }
      callback(null, true);
    }
  }).single('audio');
  const router = Router();

  router.post('/api/sessions/:sid/audio', async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (typeof uid !== 'string' || !uid.trim()) {
        throw new AudioRouteError(401, 'UNAUTHENTICATED', 'Sign in to add a recording.');
      }
      const sid = req.params.sid;
      if (!sid.trim() || sid === '.' || sid === '..' || /[/\\]/.test(sid)) {
        throw new AudioRouteError(400, 'INVALID_SESSION_ID', 'Provide a valid session ID.');
      }

      let session;
      try {
        session = await getOwnedSession({ uid, sid });
      } catch {
        throw new AudioRouteError(500, 'SESSION_LOOKUP_FAILED', 'The session could not be checked. Please try again.');
      }
      if (!session || session.id !== sid) {
        throw new AudioRouteError(404, 'SESSION_NOT_FOUND', 'The session could not be found or is not accessible.');
      }
      if (!req.is('multipart/form-data')) {
        throw new AudioRouteError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the recording using multipart/form-data.');
      }
      try {
        await new Promise((resolve, reject) => upload(req, res, (error) => error ? reject(error) : resolve()));
      } catch (error) {
        throw uploadError(error);
      }
      if (!req.file) {
        throw new AudioRouteError(400, 'MISSING_AUDIO', 'Add one recording using the audio field.');
      }
      if (!req.file.buffer?.length) {
        throw new AudioRouteError(400, 'EMPTY_AUDIO', 'The recording is empty. Record an explanation and try again.');
      }
      const durationSeconds = readDuration(req.body);

      let audio;
      try {
        audio = await analyzeAudio({
          audioBuffer: req.file.buffer,
          mimeType: normalizeMimeType(req.file.mimetype),
          durationSeconds
        });
        validateAudioResult(audio);
      } catch (error) {
        throw processingError(error);
      } finally {
        // Release raw media before persistence; only validated structured data is saved.
        discardUpload(req);
      }

      const sessionUpdate = {
        audio,
        status: 'draft',
        errorMessage: null,
        summary: '',
        notes: [],
        cardCount: 0,
        updatedAt: new Date().toISOString()
      };
      let saved;
      try {
        saved = await saveAudioResult({ uid, sid, sessionUpdate, invalidateGeneratedMaterial: true });
      } catch {
        throw new AudioRouteError(500, 'PERSISTENCE_FAILED', 'The recording result could not be saved. Please try again.');
      }
      if (saved === false) {
        throw new AudioRouteError(404, 'SESSION_NOT_FOUND', 'The session could not be found or is not accessible.');
      }
      if (saved !== true) {
        throw new AudioRouteError(500, 'PERSISTENCE_FAILED', 'The recording result could not be saved. Please try again.');
      }
      return res.status(200).json({ session: { id: sid, ...sessionUpdate }, rebuildRequired: true });
    } catch (error) {
      const safeError = error instanceof AudioRouteError ? error
        : new AudioRouteError(500, 'AUDIO_UPLOAD_FAILED', 'The recording could not be accepted. Please try again.');
      if (!res.headersSent && !res.destroyed) {
        res.status(safeError.status).json({ error: { code: safeError.code, message: safeError.message } });
      }
    } finally {
      discardUpload(req);
    }
  });

  return router;
}
