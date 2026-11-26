// Tests for getSessionNotes isolation (issue #77): request identity stays outside model arguments,
// and step filtering cannot change the session or mutate the saved material.
// Run with `npm test`. The reader is injected, so these tests use no Firestore, Gemini, or Secret Manager.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGetSessionNotesTool } from '../agents/tools/getSessionNotes.js';

const material = {
  title: 'Edge detection review',
  course: 'Computer Vision',
  steps: [
    { number: 1, text: 'Blur the image.' },
    { number: 2, text: 'Find the gradient.' },
  ],
  unreadable: [],
  transcript: 'First blur, then find the gradient.',
  points: [
    { kind: 'explanation', text: 'Blurring reduces noise.' },
    { kind: 'emphasis', text: 'The gradient reveals edges.' },
  ],
  summary: 'A two-step edge detection process.',
  notes: [
    { stepNumber: 1, boardText: 'Blur the image.', explanation: 'Reduce noise.', correction: null },
    { stepNumber: 2, boardText: 'Find the gradient.', explanation: 'Use the image gradient.', correction: null },
  ],
  cards: [
    { question: 'Why blur?', answer: 'To reduce noise.', stepNumber: 1 },
    { question: 'What reveals edges?', answer: 'The gradient.', stepNumber: 2 },
  ],
};

async function runTool(ctx, args, readMaterial = async () => structuredClone(material)) {
  const tool = createGetSessionNotesTool(ctx, readMaterial);
  return tool.runAsync({ args });
}

test('the declaration exposes only the optional stepNumber argument', () => {
  const tool = createGetSessionNotesTool({ uid: 'user-a', sessionId: 'session-a' });
  const declaration = tool._getDeclaration();

  assert.equal(declaration.name, 'getSessionNotes');
  assert.deepEqual(Object.keys(declaration.parameters.properties), ['stepNumber']);
  assert.equal('uid' in declaration.parameters.properties, false);
  assert.equal('sessionId' in declaration.parameters.properties, false);
});

test('the reader receives the verified request uid and session id, not model-supplied ids', async () => {
  const calls = [];
  const readMaterial = async (uid, sessionId) => {
    calls.push({ uid, sessionId });
    return structuredClone(material);
  };

  const result = await runTool(
    { uid: 'verified-user-a', sessionId: 'owned-session-a' },
    { uid: 'attacker-user', sessionId: 'other-session', stepNumber: 2 },
    readMaterial,
  );

  assert.deepEqual(calls, [{ uid: 'verified-user-a', sessionId: 'owned-session-a' }]);
  assert.deepEqual(result.steps, [{ number: 2, text: 'Find the gradient.' }]);
});

test('a valid step filters steps, notes, and cards but preserves session-wide material', async () => {
  const original = structuredClone(material);
  const result = await runTool({ uid: 'user-a', sessionId: 'session-a' }, { stepNumber: 2 });

  assert.deepEqual(result, {
    ...original,
    steps: [original.steps[1]],
    notes: [original.notes[1]],
    cards: [original.cards[1]],
  });
  assert.deepEqual(material, original);
});

test('a missing or invalid step returns all material', async () => {
  const expected = structuredClone(material);

  assert.deepEqual(await runTool({ uid: 'user-a', sessionId: 'session-a' }, {}), expected);
  assert.deepEqual(await runTool({ uid: 'user-a', sessionId: 'session-a' }, { stepNumber: 99 }), expected);
});

test('the step argument is validated and malformed calls fail before reading material', async () => {
  let readCount = 0;
  const readMaterial = async () => {
    readCount += 1;
    return structuredClone(material);
  };

  await assert.rejects(
    runTool({ uid: 'user-a', sessionId: 'session-a' }, { stepNumber: 0 }, readMaterial),
    /Error in tool 'getSessionNotes'/,
  );
  await assert.rejects(
    runTool({ uid: 'user-a', sessionId: 'session-a' }, { stepNumber: '2' }, readMaterial),
    /Error in tool 'getSessionNotes'/,
  );
  assert.equal(readCount, 0);
});
