// Server-side Google Analytics 4 events through the Measurement Protocol (issue #60).
// sendServerEvent sends in the background and only logs failures, so analytics can never break a request.
import { writeLog } from './logCall.js';

const collectUrl = 'https://www.google-analytics.com/mp/collect';

/**
 * Sends one GA4 event for the signed-in user without waiting for the reply (fire and forget).
 * Does nothing when GA4_MEASUREMENT_ID or GA4_API_SECRET is empty.
 * @param {{ uid: string, gaClientId: string|null }} ctx Request context built by the route.
 * @param {string} name GA4 event name, for example 'gemini_call'.
 * @param {object} params Event parameters: names, counts and flags only, never user text.
 * @returns {undefined} Never throws; a failed send becomes a WARNING log line.
 */
export function sendServerEvent(ctx, name, params) {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  // Server analytics stays off until both values are configured.
  if (!measurementId || !apiSecret) {
    return;
  }
  try {
    // URL encodes both values safely; the secret lives only in this URL, never in a log line.
    const url = new URL(collectUrl);
    url.searchParams.set('measurement_id', measurementId);
    url.searchParams.set('api_secret', apiSecret);
    const body = { // GA4 names its fields and parameters in snake_case, unlike this code's camelCase
      // The browser's client id joins server events to the same visitor; without it, use one derived from the uid.
      client_id: ctx.gaClientId || stableIdFromUid(ctx.uid),
      user_id: ctx.uid,
      // GA4 counts an event toward engagement only with a positive engagement time.
      events: [{ name, params: { ...params, engagement_time_msec: 1 } }],
    };
    // Not awaited: the route answers the browser without waiting for Google Analytics.
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => {
        if (!response.ok) {
          writeLog('WARNING', 'ga4 send failed', { event: name, httpStatus: response.status });
        }
      })
      .catch((error) => {
        // Log the error name and code only: a fetch error message can repeat the URL, which holds the API secret.
        writeLog('WARNING', 'ga4 send failed', { event: name, errorName: error.name, errorCode: error.cause?.code });
      });
  } catch (error) {
    writeLog('WARNING', 'ga4 send failed', { event: name, errorName: error.name });
  }
}

/**
 * Builds a Measurement Protocol client id ("<number>.1") from the uid, so one user always gets the same id.
 * @param {string} uid The verified Firebase user id.
 * @returns {string} For example "1234567.1".
 */
function stableIdFromUid(uid) {
  let hash = 0;
  for (const character of uid) {
    // Multiply-and-add string hash; the remainder keeps it a whole number below 2^31 - 1.
    hash = (hash * 31 + character.codePointAt(0)) % 2147483647;
  }
  return `${hash}.1`;
}