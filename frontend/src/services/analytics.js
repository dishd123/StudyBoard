// Google Analytics helpers for the React pages (issue #59).
// Sends the frontend events, tags them with the user id, and reads the GA client id for the backend.
import { getGoogleAnalyticsClientId, logEvent, setUserId } from 'firebase/analytics';
import { analyticsReady } from './firebase.js';

// This browser's GA client id once gtag.js has reported it; null until then or when Analytics is off.
let knownClientId = null;

/**
 * Asks gtag.js for this browser's client id and keeps it in knownClientId.
 * @returns {Promise<void>} never rejects
 */
async function lookUpClientId() {
  const analytics = await analyticsReady;
  if (!analytics) {
    return;
  }
  try {
    knownClientId = await getGoogleAnalyticsClientId(analytics);
  } catch {
    // No client id (for example, cookies are blocked), so API requests go without the header.
  }
}

// Look the id up once per page load. An ad blocker can stop gtag.js so the lookup never
// finishes; that is why API calls read knownClientId instead of waiting for this.
lookUpClientId();

/**
 * Sends one Google Analytics event. Fire and forget: does nothing when Analytics is off.
 * @param {string} name - event name, letters, digits and underscores only (for example "build_success")
 * @param {object} [params] - event parameters; ids and counts only, never note or question text.
 *   Names are snake_case (for example card_count), the GA4 convention, unlike this code's camelCase.
 * @returns {void}
 */
export function trackEvent(name, params) {
  analyticsReady.then((analytics) => {
    if (analytics) {
      logEvent(analytics, name, params);
    }
  });
}

/**
 * Tags every later Analytics event with the signed-in user's Firebase uid.
 * @param {string|null} uid - the Firebase uid, or null after sign-out
 * @returns {void}
 */
export function setAnalyticsUser(uid) {
  analyticsReady.then((analytics) => {
    if (analytics) {
      setUserId(analytics, uid);
    }
  });
}

/**
 * Returns the GA client id so the backend can send its events into the same GA session.
 * @returns {Promise<string|null>} the client id, or null when Analytics is off or has not answered yet
 */
export async function getAnalyticsClientId() {
  return knownClientId;
}