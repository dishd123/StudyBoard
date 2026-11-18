// Frontend logging (issue #62, report section 2.1).
// Writes each event to the browser console and, when signed in, to Cloud Logging through POST /api/client-logs.
import { auth } from './firebase.js';
import { api } from './apiClient.js';

// The console method for each log level the backend accepts.
const consoleMethods = {
  INFO: 'info',
  WARNING: 'warn',
  ERROR: 'error'
};

/**
 * Logs one frontend event. Never throws, so logging can never break the page.
 * @param {'INFO'|'WARNING'|'ERROR'} level - severity of the event
 * @param {string} event - fixed event name, for example "api_error"
 * @param {object} [details] - ids, codes and counts only; never tokens, emails, notes or question text
 * @returns {void}
 */
export function logClientEvent(level, event, details) {
  try {
    const method = consoleMethods[level] || 'log';
    console[method]('[StudyBoard]', event, details || {});
    // The API needs a signed-in user, so before sign-in the event stays in the console only.
    if (auth.currentUser) {
      // Swallow a failed send: apiClient does not log sendClientLog failures, so this cannot loop.
      api.sendClientLog({ level, event, details }).catch(() => {});
    }
  } catch {
    // Logging must never break the page.
  }
}