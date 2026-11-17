import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createBuildService, BuildServiceError } from '../services/buildService.js';
import { StudySetPipelineError } from '../agents/studySetPipeline.js';
import { createBuildFixture } from './fixtures/buildService.js';

const context = { uid: 'alice', sid: 'session-one' };
const secret = 'PRIVATE_PROVIDER_DETAILS';

function harness({ fixture = createBuildFixture(), results = [fixture.result], save, lookup } = {}) {
  const state = { session: structuredClone(fixture.session), cards: structuredClone(fixture.oldCards), writes: [] };
  const getOwnedSession = mock.fn(async args => {
    if (lookup) return lookup(args, state);
    return args.uid === state.session.owner && args.sid === state.session.id ? structuredClone(state.session) : null;
  });
  let pipelineIndex = 0;
  const runPipeline = mock.fn(async input => {
    const index = pipelineIndex++;
    assert.ok(index < results.length, 'unexpected extra pipeline invocation');
    const entry = results[index];
    if (entry instanceof Error) throw entry;
    return structuredClone(typeof entry === 'function' ? await entry(input, state) : entry);
  });
  const saveBuildState = mock.fn(async args => {
    state.writes.push(structuredClone(args));
    if (save) return save(args, state);
    if (args.uid !== state.session.owner || args.sid !== state.session.id) return false;
    if (args.expectedUpdatedAt !== state.session.updatedAt) return 'conflict';
    Object.assign(state.session, structuredClone(args.sessionUpdate));
    state.cards = structuredClone(args.cards);
    return true;
  });
  return { state, fixture, getOwnedSession, runPipeline, saveBuildState,
    build: createBuildService({ getOwnedSession, runPipeline, saveBuildState }) };
}

async function rejected(promise, code, attempts = 0, failureStored = false) {
  let captured;
  await assert.rejects(promise, error => {
    assert.ok(error instanceof BuildServiceError);
    assert.equal(error.code, code);
    assert.equal(error.attempts, attempts);
    assert.equal(error.failureStored, failureStored);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes(secret));
    captured = error;
    return true;
  });
  return captured;
}

function invalidResult(kind, count = 5) {
  const result = createBuildFixture(count).result;
  if (kind === 'notes') result.notesResult.notes[0].boardText = 'rewritten';
  if (kind === 'cards') result.cardsResult.cards[0].answer = ' ';
  if (kind === 'step') result.cardsResult.cards[0].step = 999;
  if (kind === 'fractional step') result.cardsResult.cards[0].step = 4.5;
  if (kind === 'both') { result.notesResult.summary = ''; result.cardsResult = null; }
  return result;
}

describe('buildService orchestration and persistence', () => {
  it('requires injected ownership and persistence helpers', () => {
    assert.throws(() => createBuildService(), TypeError);
    assert.throws(() => createBuildService({ getOwnedSession: async () => null }), TypeError);
  });

  it('builds once from owned processed sources and atomically replaces cards with a ready session', async () => {
    const h = harness();
    const originalPhoto = structuredClone(h.state.session.photo);
    const originalAudio = structuredClone(h.state.session.audio);
    const output = await h.build(context);
    assert.equal(h.runPipeline.mock.callCount(), 1);
    assert.deepEqual(h.getOwnedSession.mock.calls[0].arguments, [context]);
    assert.deepEqual(h.runPipeline.mock.calls[0].arguments, [h.fixture.notesInput]);
    assert.equal(h.saveBuildState.mock.callCount(), 1);
    const write = h.state.writes[0];
    assert.deepEqual(Object.keys(write).sort(), ['cards', 'expectedUpdatedAt', 'replaceCards', 'sessionUpdate', 'sid', 'uid']);
    assert.equal(write.uid, context.uid);
    assert.equal(write.sid, context.sid);
    assert.equal(write.expectedUpdatedAt, h.fixture.session.updatedAt);
    assert.equal(write.replaceCards, true);
    assert.ok(Date.parse(write.sessionUpdate.updatedAt) > Date.parse(write.expectedUpdatedAt));
    assert.equal(write.sessionUpdate.status, 'ready');
    assert.equal(write.sessionUpdate.errorMessage, null);
    assert.equal(write.sessionUpdate.summary, h.fixture.result.notesResult.summary);
    assert.equal(write.sessionUpdate.cardCount, 5);
    assert.deepEqual(write.sessionUpdate.notes, h.fixture.result.notesResult.notes.map(({ step, boardText, explanation, correction }) => ({ step, boardText, explanation, correction })));
    assert.equal(new Set(write.cards.map(card => card.id)).size, 5);
    assert.ok(write.cards.every(card => typeof card.id === 'string' && card.id && card.known === false && !h.fixture.oldCards.some(old => old.id === card.id)));
    assert.deepEqual(write.cards.map(({ question, answer, step }) => ({ question, answer, step })), h.fixture.result.cardsResult.cards);
    assert.deepEqual(output, { session: { id: context.sid, ...write.sessionUpdate }, ...h.fixture.result, cards: write.cards });
    assert.deepEqual(h.state.cards, write.cards);
    assert.deepEqual(h.state.session.photo, originalPhoto);
    assert.deepEqual(h.state.session.audio, originalAudio);
    assert.ok(!JSON.stringify(output).includes('PRIVATE_'));
    output.cards[0].known = true;
    assert.equal(h.state.cards[0].known, false);
  });

  for (const [label, request, code] of [
    ['missing uid', { sid: context.sid }, 'UNAUTHENTICATED'], ['blank uid', { ...context, uid: ' ' }, 'UNAUTHENTICATED'],
    ['missing sid', { uid: context.uid }, 'INVALID_SESSION_ID'], ['blank sid', { ...context, sid: ' ' }, 'INVALID_SESSION_ID'],
    ['dot sid', { ...context, sid: '.' }, 'INVALID_SESSION_ID'], ['parent sid', { ...context, sid: '..' }, 'INVALID_SESSION_ID'],
    ['slash sid', { ...context, sid: 'a/b' }, 'INVALID_SESSION_ID'], ['backslash sid', { ...context, sid: 'a\\b' }, 'INVALID_SESSION_ID']
  ]) {
    it(`rejects ${label} before lookup or generation`, async () => {
      const h = harness();
      await rejected(h.build(request), code);
      assert.equal(h.getOwnedSession.mock.callCount(), 0);
      assert.equal(h.runPipeline.mock.callCount(), 0);
      assert.equal(h.saveBuildState.mock.callCount(), 0);
    });
  }

  for (const [label, lookup, code] of [
    ['inaccessible', async () => null, 'SESSION_NOT_FOUND'],
    ['wrong session ID', async () => ({ id: 'other' }), 'SESSION_NOT_FOUND'],
    ['lookup exception', async () => { throw new Error(secret); }, 'SESSION_LOOKUP_FAILED']
  ]) {
    it(`handles ${label} safely without generation or writes`, async () => {
      const h = harness({ lookup });
      await rejected(h.build(context), code);
      assert.equal(h.runPipeline.mock.callCount(), 0);
      assert.equal(h.saveBuildState.mock.callCount(), 0);
    });
  }

  for (const [label, mutate, code] of [
    ['missing photo', session => { session.photo = null; }, 'MISSING_PHOTO'],
    ['missing audio', session => { session.audio = null; }, 'MISSING_AUDIO'],
    ['empty board', session => { session.photo.steps = []; }, 'INVALID_NOTES_INPUT'],
    ['malformed photo', session => { session.photo.steps[0].step = -1; }, 'INVALID_NOTES_INPUT'],
    ['malformed audio', session => { session.audio.points[0].kind = 'unknown'; }, 'INVALID_NOTES_INPUT'],
    ['missing session timestamp', session => { delete session.updatedAt; }, 'INVALID_SESSION_STATE'],
    ['invalid session timestamp', session => { session.updatedAt = 'invalid'; }, 'INVALID_SESSION_STATE']
  ]) {
    it(`rejects ${label} before generation and persistence`, async () => {
      const h = harness();
      mutate(h.state.session);
      await rejected(h.build(context), code);
      assert.equal(h.runPipeline.mock.callCount(), 0);
      assert.equal(h.saveBuildState.mock.callCount(), 0);
    });
  }

  for (const kind of ['notes', 'cards', 'step', 'fractional step']) {
    it(`retries invalid ${kind} once, then persists the valid second result`, async () => {
      const good = createBuildFixture().result;
      const h = harness({ results: [invalidResult(kind), good] });
      const output = await h.build(context);
      assert.equal(h.runPipeline.mock.callCount(), 2);
      assert.equal(h.saveBuildState.mock.callCount(), 1);
      assert.deepEqual(output.notesResult, good.notesResult);
      assert.deepEqual(output.cardsResult, good.cardsResult);
      assert.equal(h.state.session.status, 'ready');
      assert.deepEqual(h.runPipeline.mock.calls[0].arguments, h.runPipeline.mock.calls[1].arguments);
    });
  }

  it('validates notes before cards when both outputs are invalid', async () => {
    const bad = invalidResult('both');
    const h = harness({ results: [bad, bad] });
    const error = await rejected(h.build(context), 'BUILD_RETRY_EXHAUSTED', 2, true);
    assert.equal(error.failureCode, 'INVALID_NOTES_RESULT');
    assert.equal(h.runPipeline.mock.callCount(), 2);
  });

  for (const kind of ['notes', 'cards', 'step']) {
    it(`exhausts after two invalid ${kind} outputs and stores a safe failed state`, async () => {
      const h = harness({ results: [invalidResult(kind), invalidResult(kind)] });
      const error = await rejected(h.build(context), 'BUILD_RETRY_EXHAUSTED', 2, true);
      assert.equal(error.failureCode, kind === 'notes' ? 'INVALID_NOTES_RESULT' : 'INVALID_CARDS_RESULT');
      assert.equal(h.runPipeline.mock.callCount(), 2);
      assert.equal(h.saveBuildState.mock.callCount(), 1);
      const write = h.state.writes[0];
      assert.equal(write.replaceCards, true);
      assert.deepEqual(write.cards, []);
      assert.equal(write.sessionUpdate.status, 'failed');
      assert.equal(write.sessionUpdate.errorMessage, error.message);
      assert.deepEqual(write.sessionUpdate.notes, []);
      assert.equal(write.sessionUpdate.summary, '');
      assert.equal(write.sessionUpdate.cardCount, 0);
      assert.deepEqual(h.state.cards, []);
      assert.ok(!JSON.stringify(write).includes(secret));
    });
  }

  it('retries a retryable pipeline failure once', async () => {
    const h = harness({ results: [new StudySetPipelineError('INVALID_NOTES_RESULT'), createBuildFixture().result] });
    assert.equal((await h.build(context)).session.status, 'ready');
    assert.equal(h.runPipeline.mock.callCount(), 2);
  });

  for (const error of [new StudySetPipelineError('ADK_EXECUTION_FAILED'), new Error(secret)]) {
    it('does not retry a non-retryable generation failure', async () => {
      const h = harness({ results: [error] });
      const failure = await rejected(h.build(context), 'PIPELINE_FAILED', 1, true);
      assert.equal(h.runPipeline.mock.callCount(), 1);
      assert.equal(h.state.session.status, 'failed');
      assert.equal(h.state.session.errorMessage, failure.message);
      assert.ok(!JSON.stringify(h.state.writes).includes(secret));
    });
  }

  for (const count of [3, 12]) {
    it(`accepts the build-level ${count}-card boundary`, async () => {
      const fixture = createBuildFixture(count);
      const h = harness({ fixture });
      const output = await h.build(context);
      assert.equal(output.cards.length, count);
      assert.equal(h.state.session.cardCount, count);
      assert.equal(h.runPipeline.mock.callCount(), 1);
    });
  }

  for (const count of [2, 13]) {
    it(`rejects ${count} otherwise distinct cards and exhausts after one retry`, async () => {
      const result = createBuildFixture(count).result;
      assert.equal(new Set(result.cardsResult.cards.map(card => card.question)).size, count);
      const h = harness({ results: [result, result] });
      const failure = await rejected(h.build(context), 'BUILD_RETRY_EXHAUSTED', 2, true);
      assert.equal(failure.failureCode, 'INVALID_CARDS_RESULT');
      assert.equal(h.runPipeline.mock.callCount(), 2);
    });
  }

  it('rejects model-supplied card IDs and review flags instead of persisting them', async () => {
    const bad = createBuildFixture().result;
    bad.cardsResult.cards[0].id = 'model-controlled';
    bad.cardsResult.cards[0].known = true;
    const h = harness({ results: [bad, bad] });
    const error = await rejected(h.build(context), 'BUILD_RETRY_EXHAUSTED', 2, true);
    assert.equal(error.failureCode, 'INVALID_CARDS_RESULT');
    assert.deepEqual(h.state.cards, []);
  });

  it('rebuilds repeatedly by replacing cards and resetting every known flag', async () => {
    const good = createBuildFixture().result;
    const h = harness({ results: [good, good] });
    const first = await h.build(context);
    h.state.cards.forEach(card => { card.known = true; });
    const second = await h.build(context);
    const firstIds = new Set(first.cards.map(card => card.id));
    assert.equal(h.state.cards.length, 5);
    assert.ok(second.cards.every(card => !firstIds.has(card.id) && card.known === false));
    assert.equal(h.state.session.cardCount, 5);
    assert.equal(h.state.writes[1].expectedUpdatedAt, first.session.updatedAt);
    assert.ok(Date.parse(second.session.updatedAt) > Date.parse(first.session.updatedAt));
  });

  for (const [ack, code] of [['conflict', 'BUILD_CONFLICT'], [false, 'SESSION_NOT_FOUND']]) {
    it(`handles save acknowledgement ${String(ack)} without overwriting a newer session`, async () => {
      const h = harness({ save: async () => ack });
      const before = structuredClone(h.state.session);
      await rejected(h.build(context), code, 1);
      assert.equal(h.runPipeline.mock.callCount(), 1);
      assert.equal(h.saveBuildState.mock.callCount(), 1);
      assert.deepEqual(h.state.session, before);
    });
  }

  it('rejects a commit after the input version changes during generation', async () => {
    const good = createBuildFixture().result;
    const h = harness({ results: [(input, state) => {
      state.session.updatedAt = '2026-02-01T00:00:00.000Z';
      state.session.status = 'draft';
      return good;
    }] });
    await rejected(h.build(context), 'BUILD_CONFLICT', 1);
    assert.equal(h.state.session.status, 'draft');
    assert.equal(h.saveBuildState.mock.callCount(), 1);
  });

  it('stores failed state if the ready commit throws but a subsequent failed-state commit succeeds', async () => {
    const h = harness({ save: async (args, state) => {
      if (args.sessionUpdate.status === 'ready') throw new Error(secret);
      Object.assign(state.session, structuredClone(args.sessionUpdate));
      state.cards = structuredClone(args.cards);
      return true;
    } });
    const failure = await rejected(h.build(context), 'PERSISTENCE_FAILED', 1, true);
    assert.equal(h.runPipeline.mock.callCount(), 1);
    assert.equal(h.saveBuildState.mock.callCount(), 2);
    assert.equal(h.state.session.status, 'failed');
    assert.equal(h.state.session.errorMessage, failure.message);
    assert.deepEqual(h.state.cards, []);
  });

  for (const ack of ['throw', undefined]) {
    it(`reports failure-state persistence failure (${String(ack)}) without claiming it was stored`, async () => {
      const bad = invalidResult('cards');
      const h = harness({ results: [bad, bad], save: async () => {
        if (ack === 'throw') throw new Error(secret);
        return ack;
      } });
      const before = structuredClone(h.state.session);
      const failure = await rejected(h.build(context), 'PERSISTENCE_FAILED', 2, false);
      assert.equal(failure.failureCode, 'BUILD_RETRY_EXHAUSTED');
      assert.equal(h.saveBuildState.mock.callCount(), 1);
      assert.deepEqual(h.state.session, before);
      assert.ok(!JSON.stringify(h.state.writes).includes(secret));
    });
  }

  it('reports that failure was not stored when both ready and failed commits throw', async () => {
    const h = harness({ save: async () => { throw new Error(secret); } });
    const before = structuredClone(h.state.session);
    const error = await rejected(h.build(context), 'PERSISTENCE_FAILED', 1, false);
    assert.equal(error.failureCode, 'PERSISTENCE_FAILED');
    assert.equal(h.runPipeline.mock.callCount(), 1);
    assert.equal(h.saveBuildState.mock.callCount(), 2);
    assert.deepEqual(h.state.session, before);
  });
});
