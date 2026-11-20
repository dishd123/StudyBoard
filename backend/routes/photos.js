// Google Photos import API (issue #41), mounted at /api/sessions after requireUser.
// POST /:sid/picker starts a Picker session; POST /:sid/photo reads the picked photo with Gemini and saves the result.
import express from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import { limitModelCalls } from '../middleware/rateLimit.js';
import { readBoardPhoto } from '../services/geminiPhotoService.js';
import { createPickerSession, deletePickerSession, downloadPhoto, getPickedItem } from '../services/photosService.js';
import { getPickerSessionId, getSession, savePhotoResult, savePickerSession } from '../services/sessionStore.js';

const router = express.Router();
const geminiPixels = 1600; // longest side of the copy Gemini reads; board writing stays legible
const thumbnailPixels = 600; // longest side of the preview stored in Firestore
const smallThumbnailPixels = 400; // second try when the 600 px preview is too big
const iconPixels = 160; // longest side of the session card icon
const maxThumbnailBytes = 600000; // keeps the session document under Firestore's 1 MiB limit

/**
 * Reads the Google Photos access token. It is used for this request only: never stored, logged or sent to Gemini.
 * @param {import('express').Request} req The request.
 * @returns {string} The token from the X-Photos-Token header.
 * @throws {HttpError} 400 when the header is missing.
 */
function readPhotosToken(req) {
  const photosToken = req.get('X-Photos-Token');
  if (!photosToken) {
    throw new HttpError(400, 'Google Photos access is missing. Click "Choose a photo" again.');
  }
  return photosToken;
}

/**
 * Builds the request context from the verified user and the session id in the URL.
 * @param {import('express').Request} req A request that passed requireUser.
 * @returns {{ uid: string, sessionId: string, gaClientId: string|null }} The context the services log with.
 */
function requestContext(req) {
  return { uid: req.uid, sessionId: req.params.sid, gaClientId: req.gaClientId };
}

/**
 * Downloads the preview copy that Firestore stores, small enough for the session document.
 * @param {object} ctx Request context.
 * @param {string} photosToken The user's Google Photos access token.
 * @param {string} baseUrl The picked photo's base URL.
 * @returns {Promise<{ bytes: Buffer|null, mimeType: string|null }>} The preview, or nulls when even 400 px is too big.
 */
async function downloadThumbnail(ctx, photosToken, baseUrl) {
  const thumbnail = await downloadPhoto(ctx, photosToken, baseUrl, thumbnailPixels);
  if (thumbnail.bytes.length <= maxThumbnailBytes) {
    return thumbnail;
  }
  const smallThumbnail = await downloadPhoto(ctx, photosToken, baseUrl, smallThumbnailPixels);
  if (smallThumbnail.bytes.length <= maxThumbnailBytes) {
    return smallThumbnail;
  }
  // The session still works without a preview.
  return { bytes: null, mimeType: null };
}

// POST /api/sessions/:sid/picker, header X-Photos-Token -> { pickerUri }, the Google Photos link to open.
router.post('/:sid/picker', async (req, res) => {
  const photosToken = readPhotosToken(req);
  const ctx = requestContext(req);
  // 404 before Google is called when the session is not this user's.
  await getSession(ctx.uid, ctx.sessionId);
  const pickerSession = await createPickerSession(ctx, photosToken);
  // The server keeps the Picker session id, so the import step never takes one from the browser.
  await savePickerSession(ctx.uid, ctx.sessionId, pickerSession.id);
  res.json({ pickerUri: pickerSession.pickerUri });
});

// POST /api/sessions/:sid/photo, header X-Photos-Token -> { session } with the board steps Gemini read.
router.post('/:sid/photo', limitModelCalls, async (req, res) => {
  const photosToken = readPhotosToken(req);
  const ctx = requestContext(req);
  const pickerSessionId = await getPickerSessionId(ctx.uid, ctx.sessionId);
  if (pickerSessionId === null) {
    throw new HttpError(400, 'Choose a photo in Google Photos first.');
  }
  const item = await getPickedItem(ctx, photosToken, pickerSessionId);
  // Picking is not finished. The Picker session is kept, so the same link still works.
  if (item === null) {
    throw new HttpError(409, 'Finish picking in the Google Photos tab first.');
  }
  // The Picker cannot hide videos, so check the type here.
  if (item.type !== 'PHOTO') {
    throw new HttpError(422, 'Pick a photo, not a video.');
  }
  const baseUrl = item.mediaFile.baseUrl;
  // The large copy is only sent to Gemini; Firestore keeps the small preview and the icon.
  const geminiCopy = await downloadPhoto(ctx, photosToken, baseUrl, geminiPixels);
  const thumbnail = await downloadThumbnail(ctx, photosToken, baseUrl);
  const icon = await downloadPhoto(ctx, photosToken, baseUrl, iconPixels);
  const board = await readBoardPhoto(ctx, geminiCopy.bytes, geminiCopy.mimeType);
  if (board.steps.length === 0) {
    throw new HttpError(422, 'We could not find handwriting or board writing in this photo. Try another photo.');
  }
  const session = await savePhotoResult(ctx.uid, ctx.sessionId, {
    thumbnail: thumbnail.bytes,
    thumbnailType: thumbnail.mimeType,
    icon: icon.bytes,
    iconType: icon.mimeType,
    title: board.title,
    steps: board.steps,
    unreadable: board.unreadable,
  });
  // The photo is saved, so this Picker session is used up.
  await deletePickerSession(ctx, photosToken, pickerSessionId);
  res.json({ session });
});

export default router;