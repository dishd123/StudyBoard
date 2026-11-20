// Google Photos Picker calls (issue #38): start a Picker session, read the picked item, download it, end the session.
// Every call uses the user's Photos access token from the X-Photos-Token header; the token is never stored or logged.
import { HttpError } from '../middleware/errorHandler.js';
import { logCall, writeLog } from './logCall.js';

const pickerApi = 'https://photospicker.googleapis.com/v1';
const deniedMessage = 'Google Photos access was not allowed or has expired. Click "Choose a photo" again.';
const noLibraryMessage = 'This Google account has no Google Photos library yet.';
const unavailableMessage = 'Google Photos did not respond. Try again.';

/**
 * Picks the message the user sees when Google answers with an error status.
 * @param {string} operation The call that failed, for example 'photos.createSession'.
 * @param {Response} response Google's reply.
 * @returns {Promise<HttpError>} 401, 400 or 502.
 */
async function errorFromPhotosReply(operation, response) {
  // 401: the token expired or was revoked. 403: the Photos box was left unticked on Google's consent screen,
  // or access to this Picker session has expired.
  if (response.status === 401 || response.status === 403) {
    return new HttpError(401, deniedMessage);
  }
  // Creating a session fails with 400 FAILED_PRECONDITION when the account has never used Google Photos.
  if (operation === 'photos.createSession' && response.status === 400) {
    const errorText = await response.text(); // Google's error JSON names the reason in its "status" field
    if (errorText.includes('FAILED_PRECONDITION')) {
      return new HttpError(400, noLibraryMessage);
    }
  }
  return new HttpError(502, unavailableMessage);
}

/**
 * Sends one request to Google Photos with the user's token, inside logCall, and checks the reply.
 * @param {{ uid: string, sessionId: string }} ctx Request context, for the log line.
 * @param {string} photosToken The user's Google Photos access token.
 * @param {object} request
 * @param {string} request.operation Log name, for example 'photos.getSession'.
 * @param {string} request.url Full request URL.
 * @param {string} request.method HTTP method.
 * @param {object} [request.headers] Extra headers; the Authorization header is added here.
 * @param {string} [request.body] Request body.
 * @param {(response: Response) => Promise<any>} request.readBody Reads a successful reply: JSON, or the photo's bytes.
 * @returns {Promise<any>} What readBody returned.
 * @throws {HttpError} 401 when Google refused the token, 400 when the account has no Photos library, 502 otherwise.
 */
async function callGoogle(ctx, photosToken, request) {
  try {
    return await logCall({ operation: request.operation, uid: ctx.uid, sessionId: ctx.sessionId }, async (extra) => {
      const headers = { ...request.headers, Authorization: `Bearer ${photosToken}` };
      const response = await fetch(request.url, { method: request.method, headers, body: request.body });
      extra.httpStatus = response.status; // Google's status goes into the log line
      if (!response.ok) {
        const httpError = await errorFromPhotosReply(request.operation, response);
        throw httpError;
      }
      return request.readBody(response);
    });
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    // No reply at all, or a reply that could not be read. logCall has already logged the cause.
    throw new HttpError(502, unavailableMessage);
  }
}

/**
 * Reads a Picker API reply.
 * @param {Response} response A successful reply.
 * @returns {Promise<object>} The JSON body.
 */
function readJson(response) {
  return response.json();
}

/**
 * Reads a downloaded photo.
 * @param {Response} response A successful reply from the photo's base URL.
 * @returns {Promise<{ bytes: Buffer, mimeType: string }>} The image bytes and their type, for example image/jpeg.
 */
async function readImage(response) {
  const contentType = response.headers.get('content-type') || '';
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType.split(';')[0].trim(), // drops any parameters, so the type also works in a data URL
  };
}

/**
 * Builds the URL of one Picker session.
 * @param {string} pickerSessionId The Picker session id.
 * @returns {string} https://photospicker.googleapis.com/v1/sessions/{id}
 */
function pickerSessionUrl(pickerSessionId) {
  // encodeURIComponent stops any character in the id from changing the path.
  return `${pickerApi}/sessions/${encodeURIComponent(pickerSessionId)}`;
}

/**
 * Starts a Google Photos Picker session in which the user can pick one photo.
 * @param {{ uid: string, sessionId: string }} ctx Request context, for the log line.
 * @param {string} photosToken The user's Google Photos access token.
 * @returns {Promise<{ id: string, pickerUri: string }>} The Picker session id, which stays on the server,
 *   and the link the user opens in Google Photos.
 * @throws {HttpError} 401 when Google refused the token, 400 when the account has no Photos library, 502 otherwise.
 */
export async function createPickerSession(ctx, photosToken) {
  const pickerSession = await callGoogle(ctx, photosToken, {
    operation: 'photos.createSession',
    url: `${pickerApi}/sessions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // maxItemCount is a 64-bit number, which Google's JSON writes as a string. One board photo per import.
    body: JSON.stringify({ pickingConfig: { maxItemCount: '1' } }),
    readBody: readJson,
  });
  return { id: pickerSession.id, pickerUri: pickerSession.pickerUri };
}

/**
 * Returns the item the user picked, once they have pressed Done in Google Photos.
 * @param {{ uid: string, sessionId: string }} ctx Request context, for the log lines.
 * @param {string} photosToken The user's Google Photos access token.
 * @param {string} pickerSessionId The id from createPickerSession, read back from the session document.
 * @returns {Promise<object|null>} The picked item ({ id, type, mediaFile: { baseUrl, mimeType, ... } }),
 *   or null while picking is not finished.
 * @throws {HttpError} 401 when Google refused the token, 502 otherwise.
 */
export async function getPickedItem(ctx, photosToken, pickerSessionId) {
  const pickerSession = await callGoogle(ctx, photosToken, {
    operation: 'photos.getSession',
    url: pickerSessionUrl(pickerSessionId),
    method: 'GET',
    readBody: readJson,
  });
  // mediaItemsSet turns true when the user presses Done; listing fails before that.
  if (pickerSession.mediaItemsSet !== true) {
    return null;
  }
  const page = await callGoogle(ctx, photosToken, {
    operation: 'photos.listMedia',
    url: `${pickerApi}/mediaItems?sessionId=${encodeURIComponent(pickerSessionId)}`,
    method: 'GET',
    readBody: readJson,
  });
  if (!Array.isArray(page.mediaItems) || page.mediaItems.length === 0) {
    return null;
  }
  // maxItemCount is 1, so the first item is the picked photo.
  return page.mediaItems[0];
}

/**
 * Downloads a copy of a picked photo that fits inside a square of maxPixels.
 * @param {{ uid: string, sessionId: string }} ctx Request context, for the log line.
 * @param {string} photosToken The user's Google Photos access token; Picker base URLs require it.
 * @param {string} baseUrl item.mediaFile.baseUrl from getPickedItem (it works for 60 minutes).
 * @param {number} maxPixels Longest side of the copy, for example 1600.
 * @returns {Promise<{ bytes: Buffer, mimeType: string }>} The image bytes and their type.
 * @throws {HttpError} 401 when Google refused the token, 502 otherwise.
 */
export async function downloadPhoto(ctx, photosToken, baseUrl, maxPixels) {
  return callGoogle(ctx, photosToken, {
    operation: 'photos.download',
    // "=w1600-h1600" asks Google to shrink the photo to fit inside 1600 x 1600, keeping its shape.
    url: `${baseUrl}=w${maxPixels}-h${maxPixels}`,
    method: 'GET',
    readBody: readImage,
  });
}

/**
 * Deletes a Picker session after its photo is saved, so the user stays under Google's per-user session limit.
 * @param {{ uid: string, sessionId: string }} ctx Request context, for the log lines.
 * @param {string} photosToken The user's Google Photos access token.
 * @param {string} pickerSessionId The Picker session to delete.
 * @returns {Promise<void>} Never throws: a failure is only logged, because the photo is already saved.
 */
export async function deletePickerSession(ctx, photosToken, pickerSessionId) {
  try {
    await callGoogle(ctx, photosToken, {
      operation: 'photos.deleteSession',
      url: pickerSessionUrl(pickerSessionId),
      method: 'DELETE',
      readBody: readJson,
    });
  } catch (error) {
    // A Picker session also expires on its own, so the import still counts as done.
    writeLog('WARNING', 'photos session not deleted', {
      uid: ctx.uid,
      sessionId: ctx.sessionId,
      errorMessage: error.message,
    });
  }
}