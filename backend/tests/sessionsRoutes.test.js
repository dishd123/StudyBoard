// Tests for session/card HTTP routes (issue #66): validation, verified ownership,
// CRUD forwarding, course filtering, known-state changes, and card-count responses.
// Run with `npm test`. Persistence is injected, so no Firestore or cloud credentials are needed.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createSessionsRouter } from '../routes/sessions.js';
import { requireUser } from '../middleware/authMiddleware.js';
import { errorHandler, HttpError, notFound } from '../middleware/errorHandler.js';
import { adminAuth } from '../services/firebaseAdmin.js';

const savedSession = {
  id: 'session-1',
  title: 'Edge detection',
  course: 'Computer Vision',
  status: 'ready',
  cardCount: 2,
};
const savedCards = [
  { id: 'card-1', question: 'Why blur?', answer: 'To reduce noise.', stepNumber: 1, known: false },
  { id: 'card-2', question: 'What reveals edges?', answer: 'The gradient.', stepNumber: 2, known: true },
];

async function setup(t, overrides = {}) {
  const verify = t.mock.method(adminAuth, 'verifyIdToken', async token => {
    if (token !== 'good-token') {
      throw Object.assign(new Error('Invalid token'), { code: 'auth/invalid-id-token' });
    }
    return { uid: 'verified-user' };
  });
  const calls = [];
  const services = {
    createSession: t.mock.fn(async (uid, fields) => {
      calls.push({ operation: 'createSession', uid, fields });
      return structuredClone({ ...savedSession, ...fields, status: 'draft', cardCount: 0 });
    }),
    listSessions: t.mock.fn(async (uid, course) => {
      calls.push({ operation: 'listSessions', uid, course });
      return [structuredClone(savedSession)];
    }),
    getSession: t.mock.fn(async (uid, sessionId) => {
      calls.push({ operation: 'getSession', uid, sessionId });
      return structuredClone(savedSession);
    }),
    updateSession: t.mock.fn(async (uid, sessionId, fields) => {
      calls.push({ operation: 'updateSession', uid, sessionId, fields });
      return structuredClone({ ...savedSession, ...fields });
    }),
    deleteSession: t.mock.fn(async (uid, sessionId) => {
      calls.push({ operation: 'deleteSession', uid, sessionId });
    }),
    listCards: t.mock.fn(async (uid, sessionId, options) => {
      calls.push({ operation: 'listCards', uid, sessionId, options });
      return structuredClone(savedCards);
    }),
    updateCard: t.mock.fn(async (uid, sessionId, cardId, fields) => {
      calls.push({ operation: 'updateCard', uid, sessionId, cardId, fields });
      return structuredClone({ ...savedCards[0], id: cardId, ...fields });
    }),
    deleteCard: t.mock.fn(async (uid, sessionId, cardId) => {
      calls.push({ operation: 'deleteCard', uid, sessionId, cardId });
    }),
    ...overrides,
  };

  const app = express();
  app.use(express.json());
  app.use('/api', requireUser);
  app.use('/api/sessions', createSessionsRouter(services));
  app.use('/api', notFound);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { token = 'good-token', method = 'GET', body } = {}) {
    const headers = {};
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  return { request, services, calls, verify };
}

test('creates a draft session with trimmed fields and the default course', async t => {
  const { request, calls } = await setup(t);

  const response = await request('/api/sessions', {
    method: 'POST',
    body: { title: '  Edge detection  ', course: '  ' , uid: 'attacker-user' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.session.status, 'draft');
  assert.equal(response.body.session.cardCount, 0);
  assert.deepEqual(calls[0], {
    operation: 'createSession',
    uid: 'verified-user',
    fields: { title: 'Edge detection', course: 'General' },
  });
});

test('lists sessions and forwards the trimmed course filter with verified ownership', async t => {
  const { request, calls } = await setup(t);

  const response = await request('/api/sessions?course=%20Computer%20Vision%20');

  assert.deepEqual(response, { status: 200, body: { sessions: [savedSession] } });
  assert.deepEqual(calls[0], { operation: 'listSessions', uid: 'verified-user', course: 'Computer Vision' });
});

test('gets a session and its cards, including the persisted card count', async t => {
  const { request, calls } = await setup(t);

  const response = await request('/api/sessions/session-1');

  assert.deepEqual(response, { status: 200, body: { session: savedSession, cards: savedCards } });
  assert.deepEqual(calls.map(call => call.operation), ['getSession', 'listCards']);
  assert.deepEqual(calls[0], { operation: 'getSession', uid: 'verified-user', sessionId: 'session-1' });
  assert.deepEqual(calls[1], {
    operation: 'listCards',
    uid: 'verified-user',
    sessionId: 'session-1',
    options: { unknownOnly: false },
  });
});

test('renames a session or changes its course, but rejects an empty patch', async t => {
  const { request, calls } = await setup(t);

  assert.deepEqual(await request('/api/sessions/session-1', {
    method: 'PATCH',
    body: { title: '  New title  ' },
  }), { status: 200, body: { session: { ...savedSession, title: 'New title' } } });
  assert.deepEqual(calls[0], {
    operation: 'updateSession',
    uid: 'verified-user',
    sessionId: 'session-1',
    fields: { title: 'New title' },
  });

  assert.deepEqual(await request('/api/sessions/session-1', { method: 'PATCH', body: {} }), {
    status: 400,
    body: { error: 'Send a new title or course.' },
  });
  assert.equal(calls.length, 1);
});

test('deletes a session and delegates recursive child deletion to persistence', async t => {
  const { request, calls } = await setup(t);

  assert.deepEqual(await request('/api/sessions/session-1', { method: 'DELETE' }), {
    status: 200,
    body: { ok: true },
  });
  assert.deepEqual(calls[0], { operation: 'deleteSession', uid: 'verified-user', sessionId: 'session-1' });
});

test('lists all cards or only unknown cards', async t => {
  const { request, calls } = await setup(t);

  assert.deepEqual(await request('/api/sessions/session-1/cards'), {
    status: 200,
    body: { cards: savedCards },
  });
  assert.deepEqual(await request('/api/sessions/session-1/cards?known=false'), {
    status: 200,
    body: { cards: savedCards },
  });
  assert.deepEqual(calls.map(call => call.options), [
    { unknownOnly: false },
    { unknownOnly: true },
  ]);
});

test('updates known state and deletes a card using the verified user and URL IDs', async t => {
  const { request, calls } = await setup(t);

  assert.deepEqual(await request('/api/sessions/session-1/cards/card-1', {
    method: 'PATCH',
    body: { known: true, uid: 'attacker-user' },
  }), {
    status: 200,
    body: { card: { ...savedCards[0], known: true } },
  });
  assert.deepEqual(await request('/api/sessions/session-1/cards/card-1', { method: 'DELETE' }), {
    status: 200,
    body: { ok: true },
  });
  assert.deepEqual(calls, [
    {
      operation: 'updateCard',
      uid: 'verified-user',
      sessionId: 'session-1',
      cardId: 'card-1',
      fields: { known: true },
    },
    {
      operation: 'deleteCard',
      uid: 'verified-user',
      sessionId: 'session-1',
      cardId: 'card-1',
    },
  ]);
});

test('rejects invalid input before persistence and rejects unauthenticated requests', async t => {
  const { request, services, verify } = await setup(t);

  assert.deepEqual(await request('/api/sessions', { method: 'POST', body: {} }), {
    status: 400,
    body: { error: 'Give the session a title of 1 to 80 characters.' },
  });
  assert.equal(services.createSession.mock.callCount(), 0);

  assert.deepEqual(await request('/api/sessions/session-1/cards/card-1', {
    method: 'PATCH',
    body: { known: 'true' },
  }), {
    status: 400,
    body: { error: 'Send known as true or false.' },
  });
  assert.equal(services.updateCard.mock.callCount(), 0);

  const verifiedRequests = verify.mock.callCount();
  assert.deepEqual(await request('/api/sessions', { token: null }), {
    status: 401,
    body: { error: 'Please sign in again.' },
  });
  assert.equal(verify.mock.callCount(), verifiedRequests);
});

test('preserves a missing-session error from persistence', async t => {
  const missing = t.mock.fn(async () => {
    throw new HttpError(404, 'We could not find that session.');
  });
  const { request } = await setup(t, { getSession: missing });

  assert.deepEqual(await request('/api/sessions/not-owned'), {
    status: 404,
    body: { error: 'We could not find that session.' },
  });
  assert.equal(missing.mock.callCount(), 1);
});
