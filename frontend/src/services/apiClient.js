// The one place the browser calls the StudyBoard API (issue #4).
// Produces `api`, one method per route in the API contract, and ApiError for failed calls.
import { auth } from './firebase.js';
import { getAnalyticsClientId } from './analytics.js';
import { logClientEvent } from './clientLogger.js';

// clientLogger.js also imports this file. That is safe: each file only uses the other inside
// functions, which run after both files have loaded.

// Shown when the server sends no message of its own.
const fallbackMessage = 'Something went wrong. Try again.';

/**
 * An API call that failed. The message is safe to show to the user.
 */
export class ApiError extends Error {
  /**
   * @param {number} status - HTTP status code, or 0 when the server could not be reached
   * @param {string} message - message for the user
   */
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Builds an ApiError and logs it, except for sendClientLog itself (a failed log must not log again).
 * @param {string} operation - api method name, for example "getSession"
 * @param {number} status - HTTP status code, or 0
 * @param {string} message - message for the user
 * @returns {ApiError} the error for the caller to throw
 */
function apiFailure(operation, status, message) {
  if (operation !== 'sendClientLog') {
    logClientEvent('ERROR', 'api_error', { operation, status });
  }
  return new ApiError(status, message);
}

/**
 * Reads a JSON response body.
 * @param {Response} response - the fetch response
 * @returns {Promise<object|null>} the parsed body, or null when it is empty or not JSON (for example a proxy error page)
 */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Sends one request to the API as the signed-in user.
 * @param {string} operation - api method name, used in the error log
 * @param {string} method - HTTP method
 * @param {string} path - path that starts with /api/
 * @param {{ json?: object, body?: Blob, headers?: object }} [options] - a JSON body, a raw body, or extra headers
 * @returns {Promise<object>} the parsed JSON response body
 * @throws {ApiError} when nobody is signed in, the server cannot be reached, or the status is not 2xx
 */
async function request(operation, method, path, options = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw apiFailure(operation, 401, 'Please sign in again.');
  }
  let idToken;
  try {
    // Firebase returns a cached ID token and refreshes it shortly before its 1-hour expiry.
    idToken = await user.getIdToken();
  } catch {
    throw apiFailure(operation, 401, 'Please sign in again.');
  }
  // The backend verifies this token on every route except /api/health.
  const headers = { ...options.headers, Authorization: `Bearer ${idToken}` };
  // Lets the backend send its Analytics events into this browser's GA session.
  const gaClientId = await getAnalyticsClientId();
  if (gaClientId) {
    headers['X-GA-Client-Id'] = gaClientId;
  }
  let body = options.body;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  let response;
  try {
    response = await fetch(path, { method, headers, body });
  } catch {
    // fetch rejects only when no response came back at all (offline, DNS, server down).
    throw apiFailure(operation, 0, 'We could not reach StudyBoard. Check your connection and try again.');
  }
  const data = await readJson(response);
  // A 2xx reply with no JSON also fails, for example a proxy's error page; every route answers with JSON.
  if (!response.ok || data === null) {
    let message = fallbackMessage;
    if (data && typeof data.error === 'string') {
      message = data.error;
    }
    throw apiFailure(operation, response.status, message);
  }
  return data;
}

/**
 * Builds the path of one session. encodeURIComponent stops an id such as "a/b" from changing the path.
 * @param {string} sid - session id
 * @returns {string} for example "/api/sessions/abc123"
 */
function sessionPath(sid) {
  return `/api/sessions/${encodeURIComponent(sid)}`;
}

/**
 * The StudyBoard API. Every method returns the JSON body that the API contract lists for its route,
 * and throws ApiError when the call fails.
 */
export const api = {
  /** GET /api/sessions -> { sessions }, newest first. course '' or undefined lists every course. */
  listSessions(course) {
    let query = '';
    if (course) {
      query = `?course=${encodeURIComponent(course)}`;
    }
    return request('listSessions', 'GET', `/api/sessions${query}`);
  },

  /** POST /api/sessions -> { session }. title 1-80 characters; a blank course becomes "General". */
  createSession({ title, course }) {
    return request('createSession', 'POST', '/api/sessions', { json: { title, course } });
  },

  /** GET /api/sessions/:sid -> { session, cards } */
  getSession(sid) {
    return request('getSession', 'GET', sessionPath(sid));
  },

  /** PATCH /api/sessions/:sid -> { session }. fields holds title and/or course. */
  updateSession(sid, fields) {
    return request('updateSession', 'PATCH', sessionPath(sid), { json: fields });
  },

  /** DELETE /api/sessions/:sid -> { ok: true }. Also deletes its cards and questions. */
  deleteSession(sid) {
    return request('deleteSession', 'DELETE', sessionPath(sid));
  },

  /** GET /api/sessions/:sid/cards -> { cards }. unknownOnly true asks only for cards not marked known. */
  listCards(sid, unknownOnly) {
    let query = '';
    if (unknownOnly) {
      query = '?known=false';
    }
    return request('listCards', 'GET', `${sessionPath(sid)}/cards${query}`);
  },

  /** PATCH /api/sessions/:sid/cards/:cid -> { card }. known is true for "Got it", false for "Still learning". */
  updateCard(sid, cid, known) {
    return request('updateCard', 'PATCH', `${sessionPath(sid)}/cards/${encodeURIComponent(cid)}`, { json: { known } });
  },

  /** DELETE /api/sessions/:sid/cards/:cid -> { ok: true } */
  deleteCard(sid, cid) {
    return request('deleteCard', 'DELETE', `${sessionPath(sid)}/cards/${encodeURIComponent(cid)}`);
  },

  /** POST /api/sessions/:sid/picker -> { pickerUri }. The Google Photos token travels only in this header. */
  startPicker(sid, photosToken) {
    return request('startPicker', 'POST', `${sessionPath(sid)}/picker`, { headers: { 'X-Photos-Token': photosToken } });
  },

  /** POST /api/sessions/:sid/photo -> { session }. Reads the photo picked in Google Photos. */
  importPhoto(sid, photosToken) {
    return request('importPhoto', 'POST', `${sessionPath(sid)}/photo`, { headers: { 'X-Photos-Token': photosToken } });
  },

  /** POST /api/sessions/:sid/upload -> { session }. form holds the photo, thumbnail and icon JPEGs; fetch sets the form's Content-Type. */
  uploadPhoto(sid, form) {
    return request('uploadPhoto', 'POST', `${sessionPath(sid)}/upload`, { body: form });
  },

  /** POST /api/sessions/:sid/audio -> { session }. blob is the raw recording (at most 10 MB); durationSeconds is whole seconds, 0-180. */
  uploadRecording(sid, blob, durationSeconds) {
    return request('uploadRecording', 'POST', `${sessionPath(sid)}/audio?durationSeconds=${durationSeconds}`, {
      body: blob,
      headers: { 'Content-Type': blob.type }
    });
  },

  /** POST /api/sessions/:sid/build -> { session, cards }. Runs the notes and flashcards agents. */
  buildStudySet(sid) {
    return request('buildStudySet', 'POST', `${sessionPath(sid)}/build`);
  },

  /** POST /api/sessions/:sid/questions -> { question }. question 1-500 characters. */
  askTutor(sid, question) {
    return request('askTutor', 'POST', `${sessionPath(sid)}/questions`, { json: { question } });
  },

  /** GET /api/sessions/:sid/questions -> { questions }, the last 20, newest first. */
  listQuestions(sid) {
    return request('listQuestions', 'GET', `${sessionPath(sid)}/questions`);
  },

  /** GET /api/agent-check -> { value, answer, toolCalled }. The ADK smoke check; value 1-40 characters. */
  agentCheck(value) {
    return request('agentCheck', 'GET', `/api/agent-check?value=${encodeURIComponent(value)}`);
  },

  /** POST /api/client-logs -> { ok: true }. entry is { level, event, details }. */
  sendClientLog(entry) {
    return request('sendClientLog', 'POST', '/api/client-logs', { json: entry });
  }
};