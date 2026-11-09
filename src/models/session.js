export const SESSION_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  FAILED: 'failed'
});

/**
 * Frontend session response. Cards/questions are separate session subcollections.
 * @typedef {Object} Session
 * @property {string} id Session document ID supplied by the API.
 * @property {string} title
 * @property {string} course Free-text name, not a course ID or collection.
 * @property {'draft'|'ready'|'failed'} status Stored status from the revised PDF.
 * @property {string|null} errorMessage Safe display text for a failed operation.
 * @property {import('./material.js').Photo|null} photo
 * @property {import('./material.js').Audio|null} audio
 * @property {string} summary
 * @property {import('./note.js').Note[]} notes
 * @property {number} cardCount Count of the session's saved cards.
 * @property {string} createdAt ISO 8601 UTC time serialized by the API.
 * @property {string} updatedAt ISO 8601 UTC time serialized by the API.
 *
 * Processing is temporary UI state, not a fourth persisted Session.status.
 * @typedef {{ status: 'idle'|'processing', name: 'build'|null }} OperationState
 */

/** @returns {Session} */
export function createSession({
  id, title, course, createdAt, updatedAt = createdAt,
  status = SESSION_STATUS.DRAFT, errorMessage = null,
  photo = null, audio = null, summary = '', notes = [], cardCount = 0
}) {
  return {
    id, title, course, status, errorMessage, photo, audio,
    summary, notes, cardCount, createdAt, updatedAt
  };
}
