// requireUser (issue #30): verifies the Firebase ID token on every protected /api request.
// It sets req.uid from the verified token, so no route ever trusts a user id sent by the browser.
import { adminAuth } from '../services/firebaseAdmin.js';
import { writeLog } from '../services/logCall.js';

const signInMessage = 'Please sign in again.';
const gaClientIdPattern = /^\d+\.\d+$/; // a GA client id is two numbers joined by a period, like "123.456"

/**
 * Express middleware for protected routes. Reads "Authorization: Bearer <Firebase ID token>".
 * On success sets req.uid (the verified user id) and req.gaClientId (header X-GA-Client-Id, or null),
 * then calls next().
 * @param {import('express').Request} req The request.
 * @param {import('express').Response} res Receives 401 { error: "Please sign in again." } for a missing or bad token.
 * @param {import('express').NextFunction} next Called only when the token is valid.
 * @returns {Promise<void>}
 */
export async function requireUser(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, idToken] = header.split(' ');
  // Without a Bearer token there is nothing to verify.
  if (scheme !== 'Bearer' || !idToken) {
    res.status(401).json({ error: signInMessage });
    return;
  }
  let decodedToken;
  try {
    // Checks the signature, the expiry, and that the token was issued for this Firebase project.
    decodedToken = await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    // Log the reason, never the token, so a wrong project id shows up in Cloud Logging.
    writeLog('WARNING', 'id token rejected', {
      path: `${req.baseUrl}${req.path}`, // full path without the query string, which can hold user text
      errorCode: error.code,
      errorMessage: String(error.message).slice(0, 200), // same 200-character cap as logCall
    });
    res.status(401).json({ error: signInMessage });
    return;
  }
  req.uid = decodedToken.uid;
  req.gaClientId = readGaClientId(req.get('X-GA-Client-Id'));
  // next() stays outside the try block, so an error in a later route is never answered with 401.
  next();
}

/**
 * Keeps the browser's GA client id only when it has the shape the Measurement Protocol accepts.
 * @param {string|undefined} headerValue The X-GA-Client-Id header.
 * @returns {string|null} The client id, or null.
 */
function readGaClientId(headerValue) {
  if (typeof headerValue === 'string' && gaClientIdPattern.test(headerValue)) {
    return headerValue;
  }
  return null;
}