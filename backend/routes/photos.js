// Board photo API (issue #41), mounted at /api/sessions after requireUser.
// POST /:sid/upload takes a photo from the user's device; /:sid/picker and /:sid/photo import one from Google Photos.
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
const maxPhotoBytes = 3000000; // the browser's 1600 px JPEG is far smaller; this only stops abuse
const maxIconBytes = 100000; // the browser's 160 px JPEG is about 10 KB
const noWritingMessage = 'We could not find handwriting or board writing in this photo. Try another photo.';
const brokenUploadMessage = 'The photo upload was incomplete. Choose the photo again.';
// Reads the body as raw bytes on this route only, for form uploads only; a body over 5 MB gets 413.
const readUploadBody = express.raw({ type: 'multipart/form-data', limit: '5mb' });

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

/**
 * Reads one JPEG copy from the uploaded form.
 * @param {FormData} form The parsed upload.
 * @param {string} name The form field: photo, thumbnail or icon.
 * @param {number} maxBytes The largest size allowed for this copy.
 * @returns {Promise<Buffer>} The bytes of the copy.
 * @throws {HttpError} 400 when the copy is missing or is not a JPEG; 413 when it is too large.
 */
async function readCopy(form, name, maxBytes) {
  const file = form.get(name);
  // A text field instead of a file means a broken or forged upload.
  if (!(file instanceof Blob)) {
    throw new HttpError(400, brokenUploadMessage);
  }
  if (file.size > maxBytes) {
    throw new HttpError(413, 'That file is too large.');
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // Every JPEG starts with the bytes FF D8 FF; the type the browser declares proves nothing.
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new HttpError(400, brokenUploadMessage);
  }
  return bytes;
}

// POST /api/sessions/:sid/upload, body = a form with the photo, thumbnail and icon JPEGs -> { session } with the board steps.
router.post('/:sid/upload', limitModelCalls, readUploadBody, async (req, res) => {
  // req.body is a Buffer only when express.raw read a form body.
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new HttpError(400, 'Choose a photo to upload.');
  }
  let form;
  try {
    // Node's built-in Response reads a multipart form, so the backend needs no upload package.
    form = await new Response(req.body, { headers: { 'Content-Type': req.get('Content-Type') } }).formData();
  } catch {
    throw new HttpError(400, brokenUploadMessage);
  }
  // The browser already shrank the photo: Gemini reads the 1600 px copy; Firestore keeps the preview and the icon.
  const photo = await readCopy(form, 'photo', maxPhotoBytes);
  const thumbnail = await readCopy(form, 'thumbnail', maxThumbnailBytes);
  const icon = await readCopy(form, 'icon', maxIconBytes);
  const ctx = requestContext(req);
  // 404 before the model is called when the session is not this user's.
  await getSession(ctx.uid, ctx.sessionId);
  const board = await readBoardPhoto(ctx, photo, 'image/jpeg');
  if (board.steps.length === 0) {
    throw new HttpError(422, noWritingMessage);
  }
  const session = await savePhotoResult(ctx.uid, ctx.sessionId, {
    thumbnail,
    thumbnailType: 'image/jpeg',
    icon,
    iconType: 'image/jpeg',
    title: board.title,
    steps: board.steps,
    unreadable: board.unreadable,
  });
  res.json({ session });
});

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
    throw new HttpError(422, noWritingMessage);
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