// HTTP wiring only: Firebase verification and all agent/storage services are mocked.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createAgentsRouter } from '../routes/agents.js';
import { requireUser } from '../middleware/authMiddleware.js';
import { errorHandler, HttpError, notFound } from '../middleware/errorHandler.js';
import { adminAuth } from '../services/firebaseAdmin.js';

const privateDetail = 'PRIVATE_PROVIDER_ERROR_NOT_FOR_RESPONSE';
const savedQuestion = { id: 'question-1', question: 'Why do we blur before finding gradients?', answer: 'To reduce noise.', steps: [1] };
const savedBuild = { session: { id: 'session-1', status: 'ready' }, cards: [{ id: 'card-1', known: false }] };

async function setup(t, overrides = {}) {
  const verify = t.mock.method(adminAuth, 'verifyIdToken', async token => {
    if (token !== 'good-token') throw Object.assign(new Error('Invalid token'), { code: 'auth/invalid-id-token' });
    return { uid: 'user-1' };
  });
  const services = {
    runAgentCheck: t.mock.fn(async (_ctx, value) => ({ value, answer: value, toolCalled: true })),
    buildStudySet: t.mock.fn(async () => structuredClone(savedBuild)),
    askTutor: t.mock.fn(async () => structuredClone(savedQuestion)),
    listQuestions: t.mock.fn(async () => []),
    // Avoid shared rate-limit state; route forwarding and real auth remain exercised.
    limitModelCalls: (_req, _res, next) => next(),
    ...overrides
  };
  const app = express();
  app.use(express.json());
  app.use('/api', requireUser);
  app.use('/api', createAgentsRouter(services));
  app.use('/api', notFound);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { token = 'good-token', method = 'GET', body, headers = {} } = {}) {
    const allHeaders = { ...headers };
    if (token !== null) allHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) allHeaders['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
      method, headers: allHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, services, verify };
}

test('agent-check forwards each request value and verified identity to its service', async t => {
  const { request, services, verify } = await setup(t);
  for (const value of ['alpha', 'beta']) {
    assert.deepEqual(await request(`/api/agent-check?value=${value}`), {
      status: 200, body: { value, answer: value, toolCalled: true }
    });
  }
  assert.deepEqual(services.runAgentCheck.mock.calls.map(call => call.arguments), [
    [{ uid: 'user-1', sessionId: undefined, gaClientId: null }, 'alpha'],
    [{ uid: 'user-1', sessionId: undefined, gaClientId: null }, 'beta']
  ]);
  assert.deepEqual(verify.mock.calls.map(call => call.arguments), [['good-token'], ['good-token']]);
});

test('agent-check trims input, uses its default when absent, and rejects overlong values', async t => {
  const { request, services } = await setup(t);
  assert.equal((await request('/api/agent-check?value=%20alpha%20')).body.value, 'alpha');
  assert.equal((await request('/api/agent-check')).body.value, 'hello');
  assert.deepEqual(await request(`/api/agent-check?value=${'a'.repeat(41)}`), {
    status: 400, body: { error: 'Send a value of 1 to 40 characters.' }
  });
  assert.equal(services.runAgentCheck.mock.callCount(), 2);
});

for (const [path, body, service] of [
  ['/api/sessions/session-1/build', undefined, 'buildStudySet'],
  ['/api/sessions/session-1/questions', { question: savedQuestion.question }, 'askTutor']
]) {
  test(`${service} rejects unauthenticated requests before calling a service`, async t => {
    const { request, services, verify } = await setup(t);
    assert.deepEqual(await request(path, { method: 'POST', body, token: null }), {
      status: 401, body: { error: 'Please sign in again.' }
    });
    assert.equal(verify.mock.callCount(), 0);
    assert.equal(services[service].mock.callCount(), 0);
  });
}

test('invalid bearer token rejects protected operations before services run', async t => {
  const { request, services, verify } = await setup(t);
  assert.deepEqual(await request('/api/sessions/session-1/build', { method: 'POST', token: 'bad-token' }), {
    status: 401, body: { error: 'Please sign in again.' }
  });
  assert.equal(verify.mock.callCount(), 1);
  assert.equal(services.buildStudySet.mock.callCount(), 0);
});

test('build forwards the verified user, URL session and valid GA client ID and returns service result', async t => {
  const { request, services } = await setup(t);
  assert.deepEqual(await request('/api/sessions/session-1/build', {
    method: 'POST', headers: { 'X-GA-Client-Id': '123.456' }
  }), { status: 200, body: savedBuild });
  assert.deepEqual(services.buildStudySet.mock.calls[0].arguments, [{ uid: 'user-1', sessionId: 'session-1', gaClientId: '123.456' }]);
});

test('invalid GA client ID is removed from the build service context', async t => {
  const { request, services } = await setup(t);
  assert.equal((await request('/api/sessions/session-1/build', { method: 'POST', headers: { 'X-GA-Client-Id': 'not-valid' } })).status, 200);
  assert.deepEqual(services.buildStudySet.mock.calls[0].arguments, [{ uid: 'user-1', sessionId: 'session-1', gaClientId: null }]);
});

test('tutor POST forwards exact question and verified context, returning the saved question', async t => {
  const { request, services } = await setup(t);
  assert.deepEqual(await request('/api/sessions/session-1/questions', {
    method: 'POST', body: { question: savedQuestion.question }
  }), { status: 200, body: { question: savedQuestion } });
  assert.deepEqual(services.askTutor.mock.calls[0].arguments, [
    { uid: 'user-1', sessionId: 'session-1', gaClientId: null }, savedQuestion.question
  ]);
});

for (const [label, path, method, service] of [
  ['build', '/api/sessions/not-owned/build', 'POST', 'buildStudySet'],
  ['question submission', '/api/sessions/not-owned/questions', 'POST', 'askTutor'],
  ['question history', '/api/sessions/not-owned/questions', 'GET', 'listQuestions']
]) {
  test(`${label} preserves an inaccessible-session HttpError`, async t => {
    const failing = t.mock.fn(async () => { throw new HttpError(404, 'That session does not exist.'); });
    const { request } = await setup(t, { [service]: failing });
    const response = await request(path, { method, ...(method === 'POST' ? { body: { question: savedQuestion.question } } : {}) });
    assert.deepEqual(response, { status: 404, body: { error: 'That session does not exist.' } });
    assert.equal(failing.mock.callCount(), 1);
    assert.ok(!JSON.stringify(response.body).includes(privateDetail));
  });
}

test('expected service failure preserves its status and safe message', async t => {
  const failing = t.mock.fn(async () => { throw new HttpError(409, 'Make notes and flashcards first.'); });
  const { request } = await setup(t, { askTutor: failing });
  assert.deepEqual(await request('/api/sessions/session-1/questions', { method: 'POST', body: { question: 'Why?' } }), {
    status: 409, body: { error: 'Make notes and flashcards first.' }
  });
});

test('unexpected service failures produce the generic response without exception details', async t => {
  const failing = t.mock.fn(async () => { throw new Error(privateDetail); });
  const { request } = await setup(t, { buildStudySet: failing });
  const response = await request('/api/sessions/session-1/build', { method: 'POST' });
  assert.deepEqual(response, { status: 500, body: { error: 'Something went wrong. Try again.' } });
  assert.ok(!JSON.stringify(response.body).includes(privateDetail));
  assert.ok(!JSON.stringify(response.body).includes('stack'));
});

test('question history delegates only verified UID and session ID, ignoring caller-selected limits', async t => {
  const questions = Array.from({ length: 20 }, (_, index) => ({ id: `q-${index}`, question: `Question ${index}` }));
  const listQuestions = t.mock.fn(async () => structuredClone(questions));
  const { request } = await setup(t, { listQuestions });
  const response = await request('/api/sessions/session-1/questions?limit=100');
  assert.equal(response.status, 200);
  assert.equal(response.body.questions.length, 20);
  assert.deepEqual(response.body, { questions });
  assert.deepEqual(listQuestions.mock.calls[0].arguments, ['user-1', 'session-1']);
});

test('history requires authentication before querying storage', async t => {
  const { request, services } = await setup(t);
  assert.deepEqual(await request('/api/sessions/session-1/questions', { token: null }), {
    status: 401, body: { error: 'Please sign in again.' }
  });
  assert.equal(services.listQuestions.mock.callCount(), 0);
});

test('unmatched authenticated API routes use the application JSON not-found response', async t => {
  const { request } = await setup(t);
  assert.deepEqual(await request('/api/unknown'), { status: 404, body: { error: 'That API route does not exist.' } });
});
