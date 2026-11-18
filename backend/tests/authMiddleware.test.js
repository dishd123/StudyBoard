// Tests for requireUser (issue #64): each 401 path, and that req.uid comes only from the verified token.
// Run with `npm test`. adminAuth.verifyIdToken is mocked, so no network, key or Firebase project is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth } from '../services/firebaseAdmin.js';
import { requireUser } from '../middleware/authMiddleware.js';

const signInBody = { error: 'Please sign in again.' };

/**
 * Builds the parts of an Express request that requireUser reads.
 * @param {object} headers Header values keyed by lower-case name.
 * @returns {object} A request stand-in with get(name), baseUrl and path.
 */
function fakeRequest(headers) {
  return {
    baseUrl: '/api',
    path: '/sessions',
    // Express header lookups ignore case, so this one does too.
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
}

/**
 * Builds a response stand-in that records what requireUser sends.
 * @returns {object} { statusCode, body, status(code), json(body) }, with statusCode and body null until sent.
 */
function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this; // lets the code chain res.status(401).json(...)
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('no Authorization header -> 401, and the token check never runs', async (t) => {
  const verifyIdToken = t.mock.method(adminAuth, 'verifyIdToken', async () => ({ uid: 'user-1' }));
  const next = t.mock.fn();
  const res = fakeResponse();

  await requireUser(fakeRequest({}), res, next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, signInBody);
  assert.equal(next.mock.callCount(), 0);
  assert.equal(verifyIdToken.mock.callCount(), 0);
});

test('a scheme other than Bearer -> 401, and the token check never runs', async (t) => {
  const verifyIdToken = t.mock.method(adminAuth, 'verifyIdToken', async () => ({ uid: 'user-1' }));
  const next = t.mock.fn();
  const res = fakeResponse();

  await requireUser(fakeRequest({ authorization: 'Basic dXNlcjpwYXNz' }), res, next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, signInBody);
  assert.equal(next.mock.callCount(), 0);
  assert.equal(verifyIdToken.mock.callCount(), 0);
});

test('verifyIdToken throws (expired or forged token) -> 401', async (t) => {
  t.mock.method(adminAuth, 'verifyIdToken', async () => {
    const error = new Error('Firebase ID token has expired.');
    error.code = 'auth/id-token-expired'; // the code firebase-admin uses for an expired token
    throw error;
  });
  const next = t.mock.fn();
  const res = fakeResponse();

  await requireUser(fakeRequest({ authorization: 'Bearer expired-token' }), res, next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, signInBody);
  assert.equal(next.mock.callCount(), 0);
});

test('a valid token -> next(), req.uid from the token, req.gaClientId from the header', async (t) => {
  const verifyIdToken = t.mock.method(adminAuth, 'verifyIdToken', async () => ({ uid: 'user-1' }));
  const next = t.mock.fn();
  const res = fakeResponse();
  const req = fakeRequest({ authorization: 'Bearer good-token', 'x-ga-client-id': '123.456' });
  // A uid already on the request or in the body must never win over the verified one.
  req.uid = 'someone-else';
  req.body = { uid: 'someone-else' };

  await requireUser(req, res, next);

  assert.equal(verifyIdToken.mock.callCount(), 1);
  assert.equal(verifyIdToken.mock.calls[0].arguments[0], 'good-token');
  assert.equal(next.mock.callCount(), 1);
  assert.deepEqual(next.mock.calls[0].arguments, []); // next() with no error
  assert.equal(req.uid, 'user-1');
  assert.equal(req.gaClientId, '123.456');
  assert.equal(res.statusCode, null); // nothing was sent
});

test('a valid token with a malformed X-GA-Client-Id -> req.gaClientId is null', async (t) => {
  t.mock.method(adminAuth, 'verifyIdToken', async () => ({ uid: 'user-1' }));
  const next = t.mock.fn();
  const req = fakeRequest({ authorization: 'Bearer good-token', 'x-ga-client-id': 'not-a-ga-id' });

  await requireUser(req, fakeResponse(), next);

  assert.equal(next.mock.callCount(), 1);
  assert.equal(req.uid, 'user-1');
  assert.equal(req.gaClientId, null);
});