import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BaseLlm, InMemoryRunner, LlmAgent } from '@google/adk';
import { createNotesAgent, notesAgent } from '../agents/notesAgent.js';
import {
  NotesAgentError, notesInputKey, notesOutputKey, prepareNotesInput,
  validateNotesResult, validateNotesStructure
} from '../agents/notesContract.js';
import {
  createCompleteNotesFixture, createBoardOnlyNotesFixture, createAudioOnlyNotesFixture
} from './fixtures/notesAgent.js';

const privateMarker = 'PRIVATE_NOTES_TEST_PAYLOAD';
function safeError(code = 'INVALID_NOTES_OUTPUT') {
  return error => {
    assert.ok(error instanceof NotesAgentError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(error.message.length > 0);
    assert.ok(!error.message.includes(privateMarker));
    assert.ok(!error.message.includes('σ = 1.4'));
    return true;
  };
}

describe('notesAgent source-aware alignment contract', () => {
  it('accepts the complete realistic fixture without modifying its input or output', () => {
    const { input, output } = createCompleteNotesFixture();
    const before = structuredClone({ input, output });
    assert.equal(validateNotesStructure(output), output);
    assert.equal(validateNotesResult(output, input), output);
    assert.deepEqual({ input, output }, before);
  });

  it('aligns the spoken reason to its board step with exact wording and source indexes', () => {
    const { input, output } = createCompleteNotesFixture();
    validateNotesResult(output, input);
    const note = output.notes.find(note => note.step === 9);
    assert.equal(note.boardText, 'Learning rate controls update size');
    assert.equal(note.explanation, `${input.audio.points[1].text}\n${input.audio.points[4].text}`);
    assert.deepEqual(note.sourcePointIndexes, [0, 1, 4]);
    assert.equal(output.notes[0].explanation, null);
  });

  it('keeps the original sigma value alongside the separate explicit correction', () => {
    const { input, output } = createCompleteNotesFixture();
    validateNotesResult(output, input);
    assert.equal(output.notes[0].boardText, 'σ = 1.4');
    assert.equal(output.notes[0].correction, 'Correction: sigma should be 2.');
    assert.deepEqual(output.notes[0].sourcePointIndexes, [2]);
    assert.equal(input.audio.points[2].kind, 'correction');
    assert.equal(output.notes[0].explanation, null);
  });

  it('retains matched emphasis without inventing emphasis for other steps', () => {
    const { input, output } = createCompleteNotesFixture();
    validateNotesResult(output, input);
    assert.deepEqual(output.notes[1].emphasis, [input.audio.points[0].text]);
    assert.deepEqual(output.notes[0].emphasis, []);
    assert.deepEqual(output.notes[2].emphasis, []);
  });

  it('preserves an insufficiently explained board step with null explanation and no invented sources', () => {
    const { input, output } = createCompleteNotesFixture();
    validateNotesResult(output, input);
    assert.deepEqual(output.notes[2], {
      step: 2, boardText: 'Batch size is 32', explanation: null,
      correction: null, emphasis: [], sourcePointIndexes: []
    });
  });

  it('retains unmatched audio point indexes, text, and kinds without adding board steps', () => {
    const { input, output } = createCompleteNotesFixture();
    validateNotesResult(output, input);
    assert.deepEqual(output.audioOnly, [
      { pointIndex: 3, ...input.audio.points[3] }, { pointIndex: 5, ...input.audio.points[5] }
    ]);
    assert.equal(output.notes.length, input.photo.steps.length);
  });

  it('preserves every original unreadable item and allows additional uncertainty', () => {
    const { input, output } = createCompleteNotesFixture();
    output.unresolved.push('Check the unclear spoken transition.');
    validateNotesResult(output, input);
    for (const text of input.photo.unreadableParts) assert.ok(output.unresolved.includes(text));
  });

  it('preserves supplied board order even when step IDs are noncontiguous and not ascending', () => {
    const { input, output } = createCompleteNotesFixture();
    validateNotesResult(output, input);
    assert.deepEqual(output.notes.map(note => note.step), [4, 9, 2]);
    assert.deepEqual(output.notes.map(note => note.boardText), input.photo.steps.map(step => step.text));
  });

  for (const [label, createFixture] of [
    ['board-only', createBoardOnlyNotesFixture], ['audio-only', createAudioOnlyNotesFixture]
  ]) {
    it(`accepts the ${label} fixture without fabricating matches`, () => {
      const { input, output } = createFixture();
      assert.equal(validateNotesResult(output, input), output);
      if (label === 'board-only') {
        assert.ok(output.notes.every(note => note.explanation === null && note.sourcePointIndexes.length === 0));
      } else assert.deepEqual(output.notes, []);
    });
  }

  it('returns fresh independent fixtures for repeatable tests', () => {
    const first = createCompleteNotesFixture();
    const second = createCompleteNotesFixture();
    first.input.photo.steps[0].text = 'Changed';
    first.output.notes[1].sourcePointIndexes.push(99);
    assert.deepEqual(second, createCompleteNotesFixture());
  });

  const invalidOutputs = [
    ['missing required board step', value => value.notes.splice(1, 1)],
    ['fabricated board step', value => value.notes.push({ ...value.notes[2], step: 999 })],
    ['unknown source-step ID', value => { value.notes[0].step = 999; }],
    ['duplicate step ID', value => { value.notes[0].step = 9; }],
    ['noninteger step ID', value => { value.notes[0].step = 4.5; }],
    ['string step ID', value => { value.notes[0].step = '4'; }],
    ['reordered board steps', value => { [value.notes[0], value.notes[1]] = [value.notes[1], value.notes[0]]; }],
    ['rewritten board text', value => { value.notes[1].boardText = 'The learning rate changes updates.'; }],
    ['corrected value substituted into board text', value => { value.notes[0].boardText = 'σ = 2'; }],
    ['negative source index', value => { value.notes[1].sourcePointIndexes = [-1, 1, 4]; }],
    ['out-of-range source index', value => { value.notes[1].sourcePointIndexes = [0, 1, 6]; }],
    ['noninteger source index', value => { value.notes[1].sourcePointIndexes = [0, 1.5, 4]; }],
    ['string source index', value => { value.notes[1].sourcePointIndexes = ['0', 1, 4]; }],
    ['duplicate source index', value => { value.notes[1].sourcePointIndexes = [0, 1, 1, 4]; }],
    ['unordered source indexes', value => { value.notes[1].sourcePointIndexes = [4, 1, 0]; }],
    ['wrong point reference for preserved explanation', value => { value.notes[1].sourcePointIndexes = [0, 3, 4]; }],
    ['explanation promoted to correction', value => { value.notes[1].correction = value.notes[1].explanation; value.notes[1].explanation = null; }],
    ['correction demoted to explanation', value => { value.notes[0].explanation = value.notes[0].correction; value.notes[0].correction = null; }],
    ['rewritten spoken explanation', value => { value.notes[1].explanation = 'A rate controls the learning speed.'; }],
    ['dropped explicit correction', value => { value.notes[0].correction = null; }],
    ['invented emphasis', value => { value.notes[1].emphasis.push('Invented emphasis'); }],
    ['dropped matched emphasis', value => { value.notes[1].emphasis = []; }],
    ['fabricated board-only explanation', value => { value.notes[2].explanation = 'An unsupported reason.'; }],
    ['lost audio-only point', value => value.audioOnly.pop()],
    ['rewritten audio-only text', value => { value.audioOnly[0].text = 'Invented office hours'; }],
    ['mismatched audio-only kind', value => { value.audioOnly[0].kind = 'correction'; }],
    ['invalid audio-only kind', value => { value.audioOnly[0].kind = 'guess'; }],
    ['unknown audio-only point', value => { value.audioOnly[1].pointIndex = 6; }],
    ['negative audio-only index', value => { value.audioOnly[0].pointIndex = -1; }],
    ['reordered audio-only points', value => value.audioOnly.reverse()],
    ['duplicate audio-only point', value => value.audioOnly.splice(1, 0, { ...value.audioOnly[0] })],
    ['matched point also marked audio-only', value => value.audioOnly.unshift({ pointIndex: 2, text: 'Correction: sigma should be 2.', kind: 'correction' })],
    ['dropped unreadable item', value => value.unresolved.shift()],
    ['rewritten unreadable item', value => { value.unresolved[0] = 'The lower-right equation might be solvable.'; }],
    ['changed course', value => { value.course = 'Another course'; }]
  ];
  for (const [label, mutate] of invalidOutputs) {
    it(`safely rejects ${label}`, () => {
      const { input, output } = createCompleteNotesFixture();
      mutate(output);
      assert.throws(() => validateNotesResult(output, input), safeError());
    });
  }

  for (const [label, summary] of [
    ['empty', ''], ['blank', '  '], ['one sentence', 'The learning rate controls updates.'],
    ['three sentences', 'The board lists sigma. The speaker corrects it. The batch size remains unexplained.'],
    ['null', null], ['wrong type', 2]
  ]) {
    it(`rejects summary (${label}) instead of the required two sentences`, () => {
      const { input, output } = createCompleteNotesFixture();
      output.summary = summary;
      assert.throws(() => validateNotesResult(output, input), safeError());
    });
  }

  for (const [label, mutate] of [
    ['missing notes array', value => { delete value.notes; }],
    ['missing course', value => { delete value.course; }],
    ['nonstring course', value => { value.course = 5; }],
    ['nonarray notes', value => { value.notes = {}; }],
    ['null note', value => { value.notes[0] = null; }],
    ['missing explanation', value => { delete value.notes[0].explanation; }],
    ['blank explanation', value => { value.notes[1].explanation = ' '; }],
    ['nonarray source indexes', value => { value.notes[0].sourcePointIndexes = null; }],
    ['nonarray emphasis', value => { value.notes[1].emphasis = 'Important'; }],
    ['nonarray audioOnly', value => { value.audioOnly = {}; }],
    ['null audioOnly item', value => { value.audioOnly[0] = null; }],
    ['missing audioOnly kind', value => { delete value.audioOnly[0].kind; }],
    ['nonarray unresolved', value => { value.unresolved = 'Unclear'; }],
    ['blank unresolved item', value => value.unresolved.push(' ')],
    ['extra result field', value => { value.raw = privateMarker; }],
    ['extra note field', value => { value.notes[0].raw = privateMarker; }]
  ]) {
    it(`rejects malformed output with ${label}`, () => {
      const { input, output } = createCompleteNotesFixture();
      mutate(output);
      assert.throws(() => validateNotesResult(output, input), safeError());
    });
  }
});

class FixtureModel extends BaseLlm {
  constructor(responses) {
    super({ model: 'offline-notes-fixture' });
    this.responses = responses;
    this.requests = [];
  }
  async *generateContentAsync(request) {
    this.requests.push(structuredClone(request.contents));
    for (const response of this.responses) yield structuredClone(response);
  }
}

function modelResponse(output) {
  return { content: { role: 'model', parts: [{ text: JSON.stringify(output) }] }, finishReason: 'STOP' };
}

function callbackContext(input, output = null) {
  // Only the production callbacks' state seam is mocked here.
  return { state: new Map([[notesInputKey, structuredClone(input)], [notesOutputKey, structuredClone(output)]]) };
}

async function callAgentCallbacks(callbacks, context) {
  for (const callback of Array.isArray(callbacks) ? callbacks : [callbacks]) await callback(context);
}

describe('notesAgent production lifecycle callbacks', () => {
  it('exports a real ADK LlmAgent with the agreed output key', () => {
    assert.ok(notesAgent instanceof LlmAgent);
    const agent = createNotesAgent({ model: new FixtureModel([]) });
    assert.ok(agent instanceof LlmAgent);
    assert.equal(agent.name, 'notesAgent');
    assert.equal(agent.outputKey, notesOutputKey);
    assert.equal(notesInputKey, 'notesInput');
    assert.equal(notesOutputKey, 'notesResult');
  });

  it('projects saved text into detached inputs while excluding thumbnail, raw media, and metadata', () => {
    const { input } = createCompleteNotesFixture();
    const saved = {
      ...structuredClone(input), token: privateMarker,
      photo: { ...structuredClone(input.photo), thumbnail: privateMarker, visionText: privateMarker }
    };
    const prepared = prepareNotesInput(saved);
    assert.deepEqual(prepared, input);
    assert.ok(!JSON.stringify(prepared).includes(privateMarker));
    prepared.photo.steps[0].text = 'Changed';
    prepared.audio.points[0].text = 'Changed';
    assert.equal(saved.photo.steps[0].text, input.photo.steps[0].text);
    assert.equal(saved.audio.points[0].text, input.audio.points[0].text);
  });

  it('clears stale output before generation and prepares only saved text input', async () => {
    const { input, output } = createCompleteNotesFixture();
    input.photo.thumbnail = privateMarker;
    const context = callbackContext(input, output);
    const model = new FixtureModel([]);
    const agent = createNotesAgent({ model });
    await callAgentCallbacks(agent.beforeAgentCallback, context);
    assert.equal(context.state.get(notesOutputKey), null);
    assert.deepEqual(context.state.get(notesInputKey), createCompleteNotesFixture().input);
    assert.equal(model.requests.length, 0);
  });

  for (const [label, mutate] of [
    ['missing input', context => context.state.delete(notesInputKey)],
    ['missing board data', context => { context.state.get(notesInputKey).photo = null; }],
    ['duplicate board step', context => { const input = context.state.get(notesInputKey); input.photo.steps[1].step = 4; }],
    ['invalid board step', context => { context.state.get(notesInputKey).photo.steps[0].step = -1; }],
    ['invalid point kind', context => { context.state.get(notesInputKey).audio.points[0].kind = 'guess'; }]
  ]) {
    it(`rejects ${label} and clears prior notes before any model call`, async () => {
      const { input, output } = createCompleteNotesFixture();
      const context = callbackContext(input, output);
      mutate(context);
      const model = new FixtureModel([]);
      const agent = createNotesAgent({ model });
      await assert.rejects(callAgentCallbacks(agent.beforeAgentCallback, context), safeError('INVALID_NOTES_INPUT'));
      assert.equal(context.state.get(notesOutputKey), null);
      assert.equal(model.requests.length, 0);
    });
  }

  it('constructs the model request from saved input and replaces unrelated conversation history', () => {
    const { input } = createCompleteNotesFixture();
    const context = callbackContext(input);
    context.state.set('unrelated', privateMarker);
    const request = { contents: [{ role: 'user', parts: [{ text: privateMarker }] }] };
    createNotesAgent({ model: new FixtureModel([]) }).beforeModelCallback({ context, request });
    assert.deepEqual(request.contents, [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }]);
    assert.ok(!JSON.stringify(request.contents).includes(privateMarker));
  });

  it('parses, source-validates, and returns final JSON without thought content', () => {
    const { input, output } = createCompleteNotesFixture();
    const context = callbackContext(input);
    const agent = createNotesAgent({ model: new FixtureModel([]) });
    const text = JSON.stringify(output);
    const response = {
      content: { role: 'model', parts: [
        { thought: true, text: privateMarker },
        { text: text.slice(0, 50) }, { text: text.slice(50) }
      ] }, finishReason: 'STOP'
    };
    const validated = agent.afterModelCallback({ context, response });
    assert.deepEqual(JSON.parse(validated.content.parts[0].text), output);
    assert.equal(validated.content.parts.length, 1);
    assert.ok(!JSON.stringify(validated).includes(privateMarker));
    // The callback validates; ADK is responsible for publishing outputKey.
    assert.equal(context.state.get(notesOutputKey), null);
  });

  it('leaves partial model chunks unpublished until a final validated response', () => {
    const { input } = createCompleteNotesFixture();
    const context = callbackContext(input);
    const response = { partial: true, content: { parts: [{ text: '{' }] } };
    const agent = createNotesAgent({ model: new FixtureModel([]) });
    assert.equal(agent.afterModelCallback({ context, response }), undefined);
    assert.equal(context.state.get(notesOutputKey), null);
  });

  for (const [label, response] of [
    ['malformed JSON', { content: { parts: [{ text: `{${privateMarker}` }] } }],
    ['fenced JSON', { content: { parts: [{ text: '```json\n{}\n```' }] } }],
    ['missing content', {}],
    ['thought-only content', { content: { parts: [{ thought: true, text: privateMarker }] } }],
    ['nontext content', { content: { parts: [{ inlineData: { data: privateMarker, mimeType: 'audio/webm' } }] } }],
    ['unknown content field', { content: { parts: [{ text: '{}', raw: privateMarker }] } }]
  ]) {
    it(`rejects ${label} before notesResult can be published`, () => {
      const { input } = createCompleteNotesFixture();
      const context = callbackContext(input);
      const agent = createNotesAgent({ model: new FixtureModel([]) });
      assert.throws(() => agent.afterModelCallback({ context, response }), safeError());
      assert.equal(context.state.get(notesOutputKey), null);
    });
  }

  for (const [label, properties] of [
    ['model error', { errorCode: '500', errorMessage: privateMarker }],
    ['interruption', { interrupted: true }], ['incomplete output', { finishReason: 'MAX_TOKENS' }]
  ]) {
    it(`maps ${label} to a safe typed error`, () => {
      const { input, output } = createCompleteNotesFixture();
      const agent = createNotesAgent({ model: new FixtureModel([]) });
      assert.throws(() => agent.afterModelCallback({
        context: callbackContext(input), response: { ...modelResponse(output), ...properties }
      }), safeError('NOTES_MODEL_FAILED'));
    });
  }

  it('rejects valid-looking JSON with an invalid source reference in the output callback', () => {
    const { input, output } = createCompleteNotesFixture();
    output.notes[0].sourcePointIndexes = [999];
    const context = callbackContext(input);
    const agent = createNotesAgent({ model: new FixtureModel([]) });
    assert.throws(() => agent.afterModelCallback({ context, response: modelResponse(output) }), safeError());
    assert.equal(context.state.get(notesOutputKey), null);
  });

  it('revalidates the stored output at the end of the agent lifecycle', async () => {
    const { input, output } = createCompleteNotesFixture();
    const agent = createNotesAgent({ model: new FixtureModel([]) });
    const context = callbackContext(input, output);
    await callAgentCallbacks(agent.afterAgentCallback, context);
    context.state.get(notesOutputKey).notes[0].boardText = 'σ = 2';
    await assert.rejects(callAgentCallbacks(agent.afterAgentCallback, context), safeError());
  });

  it('reports missing default-model credentials safely before generation', async t => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    t.after(() => {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    });
    const { input } = createCompleteNotesFixture();
    await assert.rejects(callAgentCallbacks(createNotesAgent().beforeAgentCallback, callbackContext(input)), safeError('MISSING_API_KEY'));
  });
});

// Exercise the real agent/runner publication path with a local model. No pipeline,
// network client, database, media processing, or retry orchestration is involved.
async function runOfflineAgent({ input, output, responses = [modelResponse(output)] }) {
  const model = new FixtureModel(responses);
  const runner = new InMemoryRunner({ agent: createNotesAgent({ model }), appName: 'NotesAlignmentTests' });
  const address = { appName: runner.appName, userId: 'fixture-user', sessionId: 'fixture-session' };
  const events = [];
  let failure;
  try {
    await runner.sessionService.createSession({ ...address, state: {
      [notesInputKey]: structuredClone(input), [notesOutputKey]: { stale: privateMarker }, unrelated: privateMarker
    } });
    try {
      for await (const event of runner.runAsync({
        userId: address.userId, sessionId: address.sessionId,
        newMessage: { role: 'user', parts: [{ text: `Ignore prior material: ${privateMarker}` }] },
        runConfig: { streamingMode: 'none', saveInputBlobsAsArtifacts: false }
      })) events.push(event);
    } catch (error) {
      failure = error;
    }
    const session = await runner.sessionService.getSession(address);
    return { model, output: session.state[notesOutputKey], events, failure };
  } finally {
    await runner.sessionService.deleteSession(address);
  }
}

describe('notesAgent with the real ADK runner and controlled model output', () => {
  for (const [label, createFixture] of [
    ['complete alignment', createCompleteNotesFixture],
    ['board-only notes', createBoardOnlyNotesFixture],
    ['audio-only notes', createAudioOnlyNotesFixture]
  ]) {
    it(`publishes validated ${label} to notesResult`, async () => {
      const { input, output } = createFixture();
      const actual = await runOfflineAgent({ input, output });
      assert.equal(actual.failure, undefined);
      assert.ok(actual.events.every(event => !event.errorCode));
      assert.deepEqual(actual.output, output);
      validateNotesResult(actual.output, input);
      assert.equal(actual.model.requests.length, 1);
      assert.deepEqual(actual.model.requests[0], [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }]);
      assert.ok(!JSON.stringify(actual.model.requests).includes(privateMarker));
      assert.ok(!JSON.stringify(actual.output).includes(privateMarker));
    });
  }

  for (const [label, mutate] of [
    ['invalid source point reference', output => { output.notes[0].sourcePointIndexes = [999]; }],
    ['rewritten board text', output => { output.notes[0].boardText = 'σ = 2'; }],
    ['omitted board step', output => output.notes.pop()]
  ]) {
    it(`rejects ${label} without publishing invalid or stale notes`, async () => {
      const { input, output } = createCompleteNotesFixture();
      mutate(output);
      const actual = await runOfflineAgent({ input, output });
      assert.equal(actual.model.requests.length, 1);
      assert.ok(actual.failure || actual.events.some(event => event.errorCode));
      assert.equal(actual.output, null);
      if (actual.failure) safeError()(actual.failure);
    });
  }

  it('rejects malformed JSON through the real ADK lifecycle', async () => {
    const { input, output } = createCompleteNotesFixture();
    const actual = await runOfflineAgent({ input, output, responses: [{ content: { role: 'model', parts: [{ text: '{invalid' }] } }] });
    assert.equal(actual.model.requests.length, 1);
    assert.ok(actual.failure || actual.events.some(event => event.errorCode));
    assert.equal(actual.output, null);
    if (actual.failure) safeError()(actual.failure);
  });
});
