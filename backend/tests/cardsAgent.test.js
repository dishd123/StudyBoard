import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BaseLlm, InMemoryRunner, LlmAgent } from '@google/adk';
import { cardsAgent, createCardsAgent } from '../agents/cardsAgent.js';
import {
  CardsAgentError, cardsOutputKey, cardsOutputSchema, prepareCardsInput, validateCardsResult
} from '../agents/cardsContract.js';
import { notesOutputKey, notesOutputSchema, validateNotesResult } from '../agents/notesContract.js';
import { createAudioOnlyNotesFixture } from './fixtures/notesAgent.js';
import {
  createCardsFixture, createInvalidStepCardsFixture, createEmptyContentCardsFixture
} from './fixtures/cardsAgent.js';

const privateMarker = 'PRIVATE_CARDS_TEST_PAYLOAD';
function safeError(code = 'INVALID_CARDS_OUTPUT') {
  return error => {
    assert.ok(error instanceof CardsAgentError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(error.message.length > 0);
    assert.ok(!error.message.includes(privateMarker));
    return true;
  };
}

describe('cardsAgent output contract', () => {
  for (const count of [5, 10]) {
    it(`accepts ${count} complete cards with actual note-step references and leaves sources unchanged`, () => {
      const { notesInput, notesResult, cardsResult } = createCardsFixture(count);
      const before = structuredClone({ notesResult, cardsResult });
      validateNotesResult(notesResult, notesInput);
      assert.equal(validateCardsResult(cardsResult, notesResult), cardsResult);
      assert.equal(cardsResult.cards.length, count);
      const sourceSteps = new Map(notesResult.notes.map(note => [note.step, note]));
      for (const card of cardsResult.cards) {
        assert.deepEqual(Object.keys(card).sort(), ['answer', 'question', 'step']);
        assert.ok(card.question.trim());
        assert.ok(card.answer.trim());
        assert.ok(Number.isSafeInteger(card.step));
        assert.equal(sourceSteps.get(card.step).step, card.step);
      }
      assert.deepEqual({ notesResult, cardsResult }, before);
    });
  }

  it('uses the aligned spoken explanation for a conceptual learning-rate question', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    validateCardsResult(cardsResult, notesResult);
    const card = cardsResult.cards[0];
    const note = notesResult.notes.find(note => note.step === card.step);
    assert.equal(card.question, 'Why is the learning rate important in gradient descent?');
    assert.equal(note.boardText, 'Learning rate controls update size');
    assert.match(note.explanation, /determines how large each gradient step is/);
    assert.equal(card.answer, 'It determines how large each gradient step is.');
    assert.notEqual(card.answer, note.boardText);
  });

  it('uses corrected sigma understanding while retaining both original board text and correction', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const before = structuredClone(notesResult);
    validateCardsResult(cardsResult, notesResult);
    const card = cardsResult.cards[1];
    assert.equal(card.step, 4);
    assert.match(card.answer, /^2, following the explicit spoken correction/);
    assert.ok(!card.answer.includes('1.4'));
    assert.equal(notesResult.notes[0].boardText, 'σ = 1.4');
    assert.equal(notesResult.notes[0].correction, 'Correction: sigma should be 2.');
    assert.deepEqual(notesResult, before);
  });

  it('permits a grounded factual card from a board-only note without inventing an explanation', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    validateCardsResult(cardsResult, notesResult);
    assert.equal(cardsResult.cards[2].step, 2);
    assert.equal(cardsResult.cards[2].answer, '32.');
    assert.equal(notesResult.notes.find(note => note.step === 2).explanation, null);
  });

  it('keeps audio-only and unreadable context without using it as a card source', () => {
    const { notesResult, cardsResult } = createCardsFixture(10);
    assert.ok(notesResult.audioOnly.length > 0);
    assert.ok(notesResult.unresolved.length > 0);
    validateCardsResult(cardsResult, notesResult);
    assert.deepEqual(cardsResult.cards.map(card => card.step), [9, 4, 2, 12, 20, 30, 40, 50, 60, 70]);
    assert.ok(!JSON.stringify(cardsResult).includes('Office hours'));
    assert.ok(!JSON.stringify(cardsResult).includes('unreadable'));
  });

  it('permits multiple distinct supported questions from the same note', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    cardsResult.cards[4] = {
      question: 'What happens to a weight update when the learning rate is smaller?',
      answer: 'A smaller rate produces a smaller weight update.', step: 9
    };
    assert.equal(validateCardsResult(cardsResult, notesResult), cardsResult);
  });

  it('creates independent repeatable cards fixtures', () => {
    const first = createCardsFixture();
    const second = createCardsFixture();
    first.notesResult.notes[0].boardText = 'Changed';
    first.cardsResult.cards[0].answer = 'Changed';
    assert.deepEqual(second, createCardsFixture());
  });

  for (const [label, createFixture] of [
    ['invalid step', createInvalidStepCardsFixture], ['empty answer', createEmptyContentCardsFixture]
  ]) {
    it(`rejects the reusable ${label} fixture safely`, () => {
      const { notesResult, cardsResult } = createFixture();
      assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
    });
  }

  for (const step of [999, -1, 0, 4.5, '4', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    it(`rejects invalid source step ${String(step)}`, () => {
      const { notesResult, cardsResult } = createCardsFixture();
      cardsResult.cards[0].step = step;
      assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
    });
  }

  it('rejects a step that exists only in another notesResult', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const otherNotes = structuredClone(notesResult);
    otherNotes.notes[0].step = 500;
    cardsResult.cards[0].step = otherNotes.notes[0].step;
    assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
  });

  it('rejects an audio-only point index used as a board step', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    cardsResult.cards[0] = { question: 'When are office hours?', answer: 'Friday.', step: 3 };
    assert.equal(notesResult.audioOnly[0].pointIndex, 3);
    assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
  });

  it('rejects a fabricated source step for unresolved material', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    cardsResult.cards[0] = { question: 'What is the unreadable equation?', answer: 'An invented equation.', step: 99 };
    assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
  });

  for (const [field, value, label] of [
    ['question', '', 'empty'], ['question', '  \t\n', 'whitespace'],
    ['answer', '', 'empty'], ['answer', '  \t\n', 'whitespace'],
    ['question', '?! …', 'punctuation-only'],
    ['question', 1, 'numeric'], ['answer', 1, 'numeric'],
    ['question', null, 'null'], ['answer', null, 'null']
  ]) {
    it(`rejects ${label} ${field}`, () => {
      const { notesResult, cardsResult } = createCardsFixture();
      cardsResult.cards[0][field] = value;
      assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
    });
  }

  for (const count of [0, 3, 4, 11, 12]) {
    it(`rejects ${count} cards under the agent's 5–10 contract`, () => {
      const { notesResult, cardsResult } = createCardsFixture(10);
      const additional = [
        { question: 'How does a smaller learning rate affect a weight update?', answer: 'It produces a smaller weight update.', step: 9 },
        { question: 'Which concept does the speaker emphasize when discussing update size?', answer: 'The learning rate.', step: 9 }
      ];
      cardsResult.cards = count <= 10 ? cardsResult.cards.slice(0, count)
        : [...cardsResult.cards, ...additional.slice(0, count - 10)];
      assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
    });
  }

  for (const [label, mutate] of [
    ['exact repeated card', cards => { cards[1] = { ...cards[0] }; }],
    ['same question with a different answer and step', cards => { cards[1].question = cards[0].question; }],
    ['case and punctuation duplicate', cards => { cards[1].question = `${cards[0].question.toUpperCase()}!!!`; }],
    ['whitespace duplicate', cards => { cards[1].question = `  ${cards[0].question.replaceAll(' ', '   ')}  `; }],
    ['Unicode-normalized duplicate', cards => { cards[0].question = 'Why use sigma?'; cards[1].question = 'Ｗｈｙ use sigma?'; }],
    ['lexically redundant question with the same answer', cards => {
      cards[0] = { question: 'How does learning rate control update size?', answer: 'It controls gradient step size.', step: 9 };
      cards[1] = { question: 'How does learning rate control update size in gradient descent?', answer: 'IT CONTROLS GRADIENT STEP SIZE!', step: 9 };
    }]
  ]) {
    it(`rejects ${label} using the existing duplicate rules`, () => {
      const { notesResult, cardsResult } = createCardsFixture();
      mutate(cardsResult.cards);
      assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
    });
  }

  for (const [label, mutate] of [
    ['missing cards property', value => { delete value.cards; }],
    ['nonarray cards', value => { value.cards = {}; }],
    ['null card', value => { value.cards[0] = null; }],
    ['string card', value => { value.cards[0] = privateMarker; }],
    ['array card', value => { value.cards[0] = []; }],
    ['missing question', value => { delete value.cards[0].question; }],
    ['missing answer', value => { delete value.cards[0].answer; }],
    ['missing step', value => { delete value.cards[0].step; }],
    ['unexpected card field', value => { value.cards[0].known = false; }],
    ['unexpected sourceStep field', value => { value.cards[0].sourceStep = value.cards[0].step; }],
    ['unexpected root field', value => { value.raw = privateMarker; }]
  ]) {
    it(`rejects malformed cardsResult with ${label}`, () => {
      const { notesResult, cardsResult } = createCardsFixture();
      mutate(cardsResult);
      assert.throws(() => validateCardsResult(cardsResult, notesResult), safeError());
    });
  }

  for (const [label, malformed] of [['null', null], ['array', []], ['string', privateMarker]]) {
    it(`rejects a ${label} root result`, () => {
      assert.throws(() => validateCardsResult(malformed, createCardsFixture().notesResult), safeError());
    });
  }
});

class FixtureModel extends BaseLlm {
  constructor(responses = []) {
    super({ model: 'offline-cards-fixture' });
    this.responses = responses;
    this.requests = [];
  }
  async *generateContentAsync(request) {
    this.requests.push({ contents: structuredClone(request.contents), instruction: request.config?.systemInstruction });
    for (const response of this.responses) yield structuredClone(response);
  }
}

function responseFor(cardsResult) {
  return { content: { role: 'model', parts: [{ text: JSON.stringify(cardsResult) }] }, finishReason: 'STOP' };
}

function callbackContext(notesResult, cardsResult = null) {
  return { state: new Map([
    [notesOutputKey, structuredClone(notesResult)], [cardsOutputKey, structuredClone(cardsResult)]
  ]) };
}

async function callAgentCallbacks(callbacks, context) {
  for (const callback of Array.isArray(callbacks) ? callbacks : [callbacks]) await callback(context);
}

const invalidNotesCases = [
  ['missing notesResult', () => undefined],
  ['null notesResult', () => null],
  ['missing notes array', value => { delete value.notes; return value; }],
  ['malformed notes array', value => { value.notes = {}; return value; }],
  ['null note', value => { value.notes[0] = null; return value; }],
  ['invalid note step', value => { value.notes[0].step = -1; return value; }],
  ['duplicate note steps', value => { value.notes[1].step = value.notes[0].step; return value; }],
  ['blank boardText', value => { value.notes[0].boardText = ' '; return value; }],
  ['nonstring boardText', value => { value.notes[0].boardText = 1; return value; }],
  ['malformed correction', value => { value.notes[0].correction = {}; return value; }],
  ['blank explanation', value => { value.notes[1].explanation = ''; return value; }],
  ['malformed source indexes', value => { value.notes[0].sourcePointIndexes = [-1]; return value; }],
  ['missing summary', value => { delete value.summary; return value; }],
  ['one-sentence summary', value => { value.summary = 'Only one sentence.'; return value; }],
  ['malformed audioOnly', value => { value.audioOnly = null; return value; }],
  ['malformed unresolved', value => { value.unresolved = [null]; return value; }]
];

describe('cardsAgent saved notes input and lifecycle callbacks', () => {
  it('exports a real LlmAgent using the agreed state/schema and five-to-ten generation contract', () => {
    assert.ok(cardsAgent instanceof LlmAgent);
    const agent = createCardsAgent({ model: new FixtureModel() });
    assert.ok(agent instanceof LlmAgent);
    assert.equal(agent.name, 'cardsAgent');
    assert.equal(agent.outputKey, 'cardsResult');
    assert.equal(agent.inputSchema, notesOutputSchema);
    assert.equal(agent.outputSchema, cardsOutputSchema);
    assert.equal(cardsOutputSchema.properties.cards.minItems, 5);
    assert.equal(cardsOutputSchema.properties.cards.maxItems, 10);
  });

  it('requires corrected understanding and grounds audio-only/unresolved decisions in its instructions', () => {
    const agent = createCardsAgent({ model: new FixtureModel() });
    // Factual entailment is a prompt responsibility, not a string validator.
    assert.match(agent.instruction, /An explicit note\.correction takes precedence over conflicting boardText/);
    assert.match(agent.instruction, /Do not teach 1\.4 as the correct value/);
    assert.match(agent.instruction, /Do not create cards from audioOnly entries/);
    assert.match(agent.instruction, /Never invent a step or use an audio point index as a step/);
    assert.match(agent.instruction, /unless the specific fact and its step are independently clear/);
    assert.match(agent.instruction, /Prefer why, how, meaning, consequences/);
  });

  it('defensively copies valid saved notes without requiring photo, audio, or notesInput', () => {
    const { notesResult } = createCardsFixture();
    const prepared = prepareCardsInput(notesResult);
    assert.deepEqual(prepared, notesResult);
    assert.notEqual(prepared, notesResult);
    prepared.notes[0].correction = 'Changed';
    prepared.audioOnly[0].text = 'Changed';
    prepared.unresolved.push('Changed');
    assert.deepEqual(notesResult, createCardsFixture().notesResult);
    assert.ok(!Object.hasOwn(prepared, 'photo'));
    assert.ok(!Object.hasOwn(prepared, 'audio'));
  });

  it('clears prior cards while retaining the preceding saved notesResult', async () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const context = callbackContext(notesResult, cardsResult);
    const agent = createCardsAgent({ model: new FixtureModel() });
    await callAgentCallbacks(agent.beforeAgentCallback, context);
    assert.equal(context.state.get(cardsOutputKey), null);
    assert.deepEqual(context.state.get(notesOutputKey), notesResult);
    assert.equal(context.state.has('notesInput'), false);
  });

  for (const [label, makeInvalid] of invalidNotesCases) {
    it(`rejects ${label} safely before a model call and clears stale cards`, async () => {
      const { notesResult, cardsResult } = createCardsFixture();
      const invalid = makeInvalid(notesResult);
      assert.throws(() => prepareCardsInput(invalid), safeError('INVALID_CARDS_INPUT'));
      const context = callbackContext(invalid, cardsResult);
      const model = new FixtureModel();
      const agent = createCardsAgent({ model });
      await assert.rejects(callAgentCallbacks(agent.beforeAgentCallback, context), safeError('INVALID_CARDS_INPUT'));
      assert.equal(context.state.get(cardsOutputKey), null);
      assert.equal(model.requests.length, 0);
    });
  }

  it('rejects audio-only notes with no board source before generation', async () => {
    const notesResult = createAudioOnlyNotesFixture().output;
    assert.throws(() => prepareCardsInput(notesResult), safeError('INSUFFICIENT_NOTES'));
    const model = new FixtureModel();
    await assert.rejects(callAgentCallbacks(createCardsAgent({ model }).beforeAgentCallback,
      callbackContext(notesResult)), safeError('INSUFFICIENT_NOTES'));
    assert.equal(model.requests.length, 0);
  });

  it('replaces history with only preceding notesResult, excluding raw input and unrelated state', () => {
    const { notesResult } = createCardsFixture();
    const context = callbackContext(notesResult);
    context.state.set('notesInput', { photo: privateMarker, audio: privateMarker });
    context.state.set('unrelated', privateMarker);
    const request = { contents: [{ role: 'user', parts: [{ text: privateMarker }] }] };
    createCardsAgent({ model: new FixtureModel() }).beforeModelCallback({ context, request });
    assert.deepEqual(request.contents, [{ role: 'user', parts: [{ text: JSON.stringify(notesResult) }] }]);
    assert.ok(!JSON.stringify(request.contents).includes(privateMarker));
    const actual = JSON.parse(request.contents[0].parts[0].text);
    assert.deepEqual(actual.audioOnly, notesResult.audioOnly);
    assert.deepEqual(actual.unresolved, notesResult.unresolved);
  });

  it('parses and validates final text, excludes thought content, and preserves corrected notes', () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const context = callbackContext(notesResult);
    const text = JSON.stringify(cardsResult);
    const response = { content: { role: 'model', parts: [
      { thought: true, text: privateMarker }, { text: text.slice(0, 40) }, { text: text.slice(40) }
    ] } };
    const agent = createCardsAgent({ model: new FixtureModel() });
    const validated = agent.afterModelCallback({ context, response });
    assert.deepEqual(validated.content.parts, [{ text: JSON.stringify(cardsResult) }]);
    assert.ok(!JSON.stringify(validated).includes(privateMarker));
    assert.deepEqual(context.state.get(notesOutputKey), notesResult);
    assert.equal(context.state.get(cardsOutputKey), null);
  });

  it('defers validation of partial model chunks until a final response', () => {
    const context = callbackContext(createCardsFixture().notesResult);
    const agent = createCardsAgent({ model: new FixtureModel() });
    assert.equal(agent.afterModelCallback({ context, response: { partial: true, content: { parts: [{ text: '{' }] } } }), undefined);
    assert.equal(context.state.get(cardsOutputKey), null);
  });

  for (const [label, response] of [
    ['malformed JSON', { content: { parts: [{ text: `{${privateMarker}` }] } }],
    ['fenced JSON', { content: { parts: [{ text: '```json\n{}\n```' }] } }],
    ['missing response content', {}],
    ['thought-only response', { content: { parts: [{ thought: true, text: privateMarker }] } }],
    ['nontext part', { content: { parts: [{ inlineData: { mimeType: 'audio/webm', data: privateMarker } }] } }],
    ['unexpected part field', { content: { parts: [{ text: '{}', raw: privateMarker }] } }]
  ]) {
    it(`rejects ${label} before output publication`, () => {
      const context = callbackContext(createCardsFixture().notesResult);
      const agent = createCardsAgent({ model: new FixtureModel() });
      assert.throws(() => agent.afterModelCallback({ context, response }), safeError());
      assert.equal(context.state.get(cardsOutputKey), null);
    });
  }

  for (const [label, properties] of [
    ['provider error', { errorCode: '500', errorMessage: privateMarker }],
    ['interrupted generation', { interrupted: true }], ['incomplete generation', { finishReason: 'MAX_TOKENS' }]
  ]) {
    it(`maps ${label} to a safe typed error`, () => {
      const { notesResult, cardsResult } = createCardsFixture();
      const agent = createCardsAgent({ model: new FixtureModel() });
      assert.throws(() => agent.afterModelCallback({
        context: callbackContext(notesResult), response: { ...responseFor(cardsResult), ...properties }
      }), safeError('CARDS_MODEL_FAILED'));
    });
  }

  it('rejects invalid references in parsed JSON before publishing cards', () => {
    const { notesResult, cardsResult } = createInvalidStepCardsFixture();
    const context = callbackContext(notesResult);
    const agent = createCardsAgent({ model: new FixtureModel() });
    assert.throws(() => agent.afterModelCallback({ context, response: responseFor(cardsResult) }), safeError());
    assert.equal(context.state.get(cardsOutputKey), null);
  });

  it('revalidates saved cards at the end of the agent lifecycle', async () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const context = callbackContext(notesResult, cardsResult);
    const agent = createCardsAgent({ model: new FixtureModel() });
    await callAgentCallbacks(agent.afterAgentCallback, context);
    context.state.get(cardsOutputKey).cards[0].answer = ' ';
    await assert.rejects(callAgentCallbacks(agent.afterAgentCallback, context), safeError());
  });

  it('reports missing default-model credentials without a model request', async t => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    t.after(() => {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    });
    await assert.rejects(callAgentCallbacks(createCardsAgent().beforeAgentCallback,
      callbackContext(createCardsFixture().notesResult)), safeError('MISSING_API_KEY'));
  });
});

// Run cardsAgent directly: its only required source state is notesResult.
// No notesAgent, studySetPipeline, build service, or external model is executed.
async function runOfflineAgent({ notesResult, cardsResult, responses = [responseFor(cardsResult)], extraState = {} }) {
  const model = new FixtureModel(responses);
  const runner = new InMemoryRunner({ agent: createCardsAgent({ model }), appName: 'CardsOutputTests' });
  const address = { appName: runner.appName, userId: 'fixture-user', sessionId: 'fixture-session' };
  const events = [];
  let failure;
  try {
    const state = { ...structuredClone(extraState), [cardsOutputKey]: { stale: privateMarker } };
    if (notesResult !== undefined) state[notesOutputKey] = structuredClone(notesResult);
    await runner.sessionService.createSession({ ...address, state });
    try {
      for await (const event of runner.runAsync({
        userId: address.userId, sessionId: address.sessionId,
        newMessage: { role: 'user', parts: [{ text: privateMarker }] },
        runConfig: { streamingMode: 'none', saveInputBlobsAsArtifacts: false }
      })) events.push(event);
    } catch (error) {
      failure = error;
    }
    const session = await runner.sessionService.getSession(address);
    return { model, state: session.state, events, failure };
  } finally {
    await runner.sessionService.deleteSession(address);
  }
}

describe('cardsAgent real ADK lifecycle with controlled model output', () => {
  for (const count of [5, 10]) {
    it(`reads only saved aligned notes and publishes ${count} validated cards`, async () => {
      const { notesResult, cardsResult } = createCardsFixture(count);
      const before = structuredClone(notesResult);
      const actual = await runOfflineAgent({ notesResult, cardsResult });
      assert.equal(actual.failure, undefined);
      assert.ok(actual.events.every(event => !event.errorCode));
      assert.deepEqual(actual.state[cardsOutputKey], cardsResult);
      assert.deepEqual(actual.state[notesOutputKey], before);
      validateCardsResult(actual.state[cardsOutputKey], notesResult);
      assert.equal(actual.model.requests.length, 1);
      const request = actual.model.requests[0];
      assert.deepEqual(request.contents, [{ role: 'user', parts: [{ text: JSON.stringify(notesResult) }] }]);
      assert.equal(Object.hasOwn(actual.state, 'notesInput'), false);
      assert.ok(!JSON.stringify(request.contents).includes(privateMarker));
      assert.match(JSON.stringify(request.instruction), /Do not teach 1\.4 as the correct value/);
      assert.match(actual.state[cardsOutputKey].cards[1].answer, /^2,/);
    });
  }

  it('ignores conflicting raw-input state and user history when saved notes are available', async () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const actual = await runOfflineAgent({ notesResult, cardsResult,
      extraState: { notesInput: { photo: privateMarker, audio: privateMarker }, transcript: privateMarker }
    });
    assert.equal(actual.failure, undefined);
    assert.deepEqual(JSON.parse(actual.model.requests[0].contents[0].parts[0].text), notesResult);
    assert.deepEqual(actual.state[cardsOutputKey], cardsResult);
  });

  for (const [label, createFixture] of [
    ['nonexistent note step', createInvalidStepCardsFixture],
    ['empty card content', createEmptyContentCardsFixture],
    ['audio-only source index', () => {
      const fixture = createCardsFixture();
      fixture.cardsResult.cards[0] = { question: 'When are office hours?', answer: 'Friday.', step: 3 };
      return fixture;
    }],
    ['unresolved fabricated source', () => {
      const fixture = createCardsFixture();
      fixture.cardsResult.cards[0] = { question: 'What is the unreadable equation?', answer: 'Invented.', step: 99 };
      return fixture;
    }]
  ]) {
    it(`rejects ${label} before invalid or stale cards become saved state`, async () => {
      const { notesResult, cardsResult } = createFixture();
      const actual = await runOfflineAgent({ notesResult, cardsResult });
      assert.equal(actual.model.requests.length, 1);
      assert.ok(actual.failure || actual.events.some(event => event.errorCode));
      assert.equal(actual.state[cardsOutputKey], null);
      assert.deepEqual(actual.state[notesOutputKey], notesResult);
      if (actual.failure) safeError()(actual.failure);
    });
  }

  it('rejects malformed JSON through the real ADK lifecycle', async () => {
    const { notesResult, cardsResult } = createCardsFixture();
    const actual = await runOfflineAgent({ notesResult, cardsResult,
      responses: [{ content: { role: 'model', parts: [{ text: '{invalid' }] } }]
    });
    assert.equal(actual.model.requests.length, 1);
    assert.ok(actual.failure || actual.events.some(event => event.errorCode));
    assert.equal(actual.state[cardsOutputKey], null);
    if (actual.failure) safeError()(actual.failure);
  });

  it('does not substitute raw notesInput for missing preceding notesResult', async () => {
    const { notesInput, cardsResult } = createCardsFixture();
    const actual = await runOfflineAgent({ cardsResult, extraState: { notesInput } });
    assert.equal(actual.model.requests.length, 0);
    // A throwing before-agent callback emits no state delta in ADK. Existing
    // state remains unchanged; the invocation fails without generating cards.
    assert.deepEqual(actual.state[cardsOutputKey], { stale: privateMarker });
    safeError('INVALID_CARDS_INPUT')(actual.failure);
  });

  it('rejects audio-only notes without board sources before reaching the model', async () => {
    const actual = await runOfflineAgent({ notesResult: createAudioOnlyNotesFixture().output });
    assert.equal(actual.model.requests.length, 0);
    assert.deepEqual(actual.state[cardsOutputKey], { stale: privateMarker });
    safeError('INSUFFICIENT_NOTES')(actual.failure);
  });
});
