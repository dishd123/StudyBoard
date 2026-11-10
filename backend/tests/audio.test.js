import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import express from 'express';
import multer from 'multer';
import { createAudioRouter } from '../routes/audio.js';
import {
  AudioProcessingError, createGeminiAudioService, validateAudioResult
} from '../services/geminiAudioService.js';

const maxAudioBytes = 10 * 1024 * 1024;
const rawAudio = Buffer.from('PRIVATE_RAW_AUDIO_ISSUE_73');
const providerSecret = 'PRIVATE_PROVIDER_ERROR_ISSUE_73';
const result = () => ({
  transcript: 'Gradient descent updates weights. Correction: use a rate of 0.1. This rate matters.',
  points: [
    { text: 'Gradient descent updates weights.', kind: 'explanation' },
    { text: 'Use a rate of 0.1.', kind: 'correction' },
    { text: 'This rate matters.', kind: 'emphasis' }
  ],
  length: 12.5
});
const malformedResults = [
  ['null result', null],
  ['array result', []],
  ['missing transcript', { points: [], length: 1 }],
  ['nonnumeric transcript', { ...result(), transcript: 1 }],
  ['missing points', { transcript: 'Speech', length: 1 }],
  ['nonarray points', { ...result(), points: {} }],
  ['null point', { ...result(), points: [null] }],
  ['invalid point kind', { ...result(), points: [{ text: 'Speech', kind: 'guess' }] }],
  ['missing point text', { ...result(), points: [{ kind: 'correction' }] }],
  ['blank point text', { ...result(), points: [{ text: '  ', kind: 'emphasis' }] }],
  ['extra point field', { ...result(), points: [{ text: 'Speech', kind: 'explanation', raw: providerSecret }] }],
  ['missing length', { transcript: 'Speech', points: [] }],
  ['string length', { ...result(), length: '12' }],
  ['negative length', { ...result(), length: -1 }],
  ['excessive length', { ...result(), length: 181 }],
  ['extra result field', { ...result(), raw: providerSecret }]
];

function assertNoRaw(value) {
  const json = JSON.stringify(value);
  assert.ok(!json.includes(rawAudio.toString()));
  assert.ok(!json.includes(rawAudio.toString('base64')));
  assert.ok(!json.includes(providerSecret));
  assert.doesNotMatch(json, /"(?:buffer|inlineData|audioBuffer|path|destination)"/);
}

function assertSafeProcessingError(error, code) {
  assert.ok(error instanceof AudioProcessingError);
  assert.equal(error.code, code);
  assert.equal(error.cause, undefined);
  assert.ok(error.message.length > 0);
  assert.ok(!error.message.includes(providerSecret));
  return true;
}

// Real multipart bytes exercise Multer, including its size/field limits.
function multipart({ files = [{ data: rawAudio, type: 'audio/webm' }], fields = [] } = {}) {
  const boundary = 'studyboard-audio-tests-boundary';
  const chunks = [];
  for (const [name, value] of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const { data = rawAudio, type = 'audio/webm', field = 'audio' } of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="recording.webm"\r\nContent-Type: ${type}\r\n\r\n`));
    chunks.push(data, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('audio upload route (real Express/Multer; mocked processing and persistence)', { concurrency: false }, () => {
  let server;
  let fixture;
  let diskWrite;
  const storagePrototype = Object.getPrototypeOf(multer.memoryStorage());
  const originalHandle = storagePrototype._handleFile;
  const originalRemove = storagePrototype._removeFile;

  before(async () => {
    // Observe real memory storage without replacing multipart parsing or cleanup.
    mock.method(storagePrototype, '_handleFile', function (req, file, callback) {
      originalHandle.call(this, req, file, (error, info) => {
        if (info) fixture.uploads.push({ file, info });
        callback(error, info);
      });
    });
    mock.method(storagePrototype, '_removeFile', function (req, file, callback) {
      fixture.removed.push(file);
      originalRemove.call(this, req, file, callback);
    });
    diskWrite = mock.method(fs, 'createWriteStream', () => { throw new Error('Unexpected disk recording'); });
    const app = express();
    app.use((req, _res, next) => {
      fixture.request = req;
      req.user = fixture.user;
      next();
    });
    app.use(createAudioRouter({
      analyzeAudio: input => fixture.analyzeAudio(input),
      getOwnedSession: context => fixture.getOwnedSession(context),
      saveAudioResult: input => fixture.saveAudioResult(input)
    }));
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  });

  after(async () => {
    try {
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      mock.restoreAll();
    }
  });

  beforeEach(() => {
    fixture = {
      user: { uid: 'alice' }, uploads: [], removed: [],
      session: {
        id: 'session-one', owner: 'alice', privateMetadata: providerSecret,
        photo: { steps: [{ step: 1, text: 'Gradient descent' }] },
        audio: { transcript: 'Old recording', points: [], length: 3 },
        summary: 'Old summary', notes: [{ step: 1 }], status: 'ready', cardCount: 1
      },
      cards: [{ id: 'old-card', known: true }], saveResult: true
    };
    fixture.getOwnedSession = mock.fn(async ({ uid, sid }) =>
      uid === fixture.session.owner && sid === fixture.session.id ? structuredClone(fixture.session) : null);
    fixture.analyzeAudio = mock.fn(async input => {
      fixture.inputBytes = Buffer.from(input.audioBuffer);
      fixture.processingFile = { ...fixture.request.file };
      return result();
    });
    fixture.saveAudioResult = mock.fn(async ({ sessionUpdate, invalidateGeneratedMaterial }) => {
      assertReleased(); // Raw upload must already be cleared BEFORE saving.
      assertNoRaw(sessionUpdate);
      if (fixture.saveError) throw fixture.saveError;
      if (fixture.saveResult === true) {
        Object.assign(fixture.session, structuredClone(sessionUpdate));
        if (invalidateGeneratedMaterial) fixture.cards = [];
      }
      return fixture.saveResult;
    });
  });

  function post(upload = multipart(), path = '/api/sessions/session-one/audio') {
    return new Promise((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1', port: server.address().port, path, method: 'POST', agent: false,
        headers: { 'Content-Type': upload.contentType, 'Content-Length': upload.body.length }
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
          catch (error) { reject(error); }
        });
      });
      request.setTimeout(5000, () => request.destroy(new Error('Local upload test timed out')));
      request.on('error', reject);
      request.end(upload.body);
    });
  }

  function assertReleased({ zeroed = true } = {}) {
    assert.equal(fixture.request.file, undefined);
    for (const { file, info } of fixture.uploads) {
      assert.equal(file.path, undefined);
      assert.equal(info.path, undefined);
      assert.equal(info.destination, undefined);
      assert.ok(Buffer.isBuffer(info.buffer));
      if (zeroed) assert.ok(info.buffer.every(byte => byte === 0), 'upload bytes must be zeroed');
    }
    assert.equal(diskWrite.mock.callCount(), 0);
  }

  function assertError(response, status, code, { analyzed = false, parsed = true, zeroed = true } = {}) {
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'message']);
    assert.equal(response.body.error.code, code);
    assert.ok(response.body.error.message.length > 0);
    assertNoRaw(response.body);
    assert.equal(fixture.analyzeAudio.mock.callCount(), analyzed ? 1 : 0);
    assert.equal(fixture.saveAudioResult.mock.callCount(), 0);
    assertReleased({ zeroed });
    if (!parsed) assert.equal(fixture.uploads.length, 0);
  }

  it('requires explicit persistence helpers', () => {
    assert.throws(() => createAudioRouter(), TypeError);
    assert.throws(() => createAudioRouter({ getOwnedSession: async () => null }), TypeError);
  });

  for (const user of [undefined, {}, { uid: '' }, { uid: '   ' }]) {
    it(`rejects missing authenticated identity ${JSON.stringify(user)} before parsing`, async () => {
      fixture.user = user;
      assertError(await post(), 401, 'UNAUTHENTICATED', { parsed: false });
      assert.equal(fixture.getOwnedSession.mock.callCount(), 0);
    });
  }

  it('rejects another user\'s session without processing or buffering audio', async () => {
    fixture.user = { uid: 'bob' };
    assertError(await post(), 404, 'SESSION_NOT_FOUND', { parsed: false });
    assert.deepEqual(fixture.getOwnedSession.mock.calls[0].arguments, [{ uid: 'bob', sid: 'session-one' }]);
  });

  it('rejects missing sessions', async () => {
    assertError(await post(multipart(), '/api/sessions/missing/audio'), 404, 'SESSION_NOT_FOUND', { parsed: false });
  });

  it('fails closed if the ownership helper returns a different session ID', async () => {
    fixture.getOwnedSession = mock.fn(async () => ({ id: 'another-session' }));
    assertError(await post(), 404, 'SESSION_NOT_FOUND', { parsed: false });
  });

  it('returns a safe lookup error without invoking processing', async () => {
    fixture.getOwnedSession = mock.fn(async () => { throw new Error(providerSecret); });
    assertError(await post(), 500, 'SESSION_LOOKUP_FAILED', { parsed: false });
  });

  it('rejects encoded slash session IDs before ownership lookup', async () => {
    assertError(await post(multipart(), '/api/sessions/bad%2Fid/audio'), 400, 'INVALID_SESSION_ID', { parsed: false });
    assert.equal(fixture.getOwnedSession.mock.callCount(), 0);
  });

  it('rejects a non-multipart request', async () => {
    assertError(await post({ body: Buffer.from('{}'), contentType: 'application/json' }), 415, 'UNSUPPORTED_MEDIA_TYPE', { parsed: false });
  });

  it('rejects text/plain audio without sending it to Gemini', async () => {
    assertError(await post(multipart({ files: [{ type: 'text/plain' }] })), 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects uploads one byte above 10 MiB and releases Multer\'s rejected file', async () => {
    const response = await post(multipart({ files: [{ data: Buffer.alloc(maxAudioBytes + 1, 7) }] }));
    assertError(response, 413, 'AUDIO_TOO_LARGE', { zeroed: false });
    assert.ok(fixture.removed.length > 0);
    assert.ok(fixture.removed.every(file => file.buffer === undefined));
  });

  it('accepts exactly 10 MiB and clears the full buffer before persistence', async () => {
    const response = await post(multipart({ files: [{ data: Buffer.alloc(maxAudioBytes, 7) }] }));
    assert.equal(response.status, 200);
    assert.equal(fixture.inputBytes.length, maxAudioBytes);
    assert.equal(fixture.analyzeAudio.mock.callCount(), 1);
    assert.equal(fixture.saveAudioResult.mock.callCount(), 1);
    assertReleased();
  });

  it('saves processed audio, invalidates prior generated material, and returns only safe session state', async () => {
    const previousPhoto = structuredClone(fixture.session.photo);
    const response = await post(multipart({ fields: [['durationSeconds', '12.5']] }));
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.inputBytes, rawAudio);
    const input = fixture.analyzeAudio.mock.calls[0].arguments[0];
    assert.deepEqual(Object.keys(input).sort(), ['audioBuffer', 'durationSeconds', 'mimeType']);
    assert.equal(input.mimeType, 'audio/webm');
    assert.equal(input.durationSeconds, 12.5);
    assert.ok(Buffer.isBuffer(input.audioBuffer));
    const saved = fixture.saveAudioResult.mock.calls[0].arguments[0];
    assert.deepEqual(Object.keys(saved).sort(), ['invalidateGeneratedMaterial', 'sessionUpdate', 'sid', 'uid']);
    assert.equal(saved.uid, 'alice');
    assert.equal(saved.sid, 'session-one');
    assert.equal(saved.invalidateGeneratedMaterial, true);
    const { updatedAt, ...patch } = saved.sessionUpdate;
    assert.equal(new Date(updatedAt).toISOString(), updatedAt);
    assert.deepEqual(patch, { audio: result(), status: 'draft', errorMessage: null, summary: '', notes: [], cardCount: 0 });
    assert.deepEqual(response.body, { session: { id: 'session-one', ...saved.sessionUpdate }, rebuildRequired: true });
    assert.deepEqual(fixture.session.audio, result());
    assert.deepEqual(fixture.session.photo, previousPhoto);
    assert.deepEqual(fixture.cards, []);
    assertNoRaw(saved);
    assertNoRaw(response.body);
    assertReleased();
  });

  for (const [mimeType, normalized] of [
    ['audio/webm;codecs=opus', 'audio/webm'], ['audio/ogg;codecs=opus', 'audio/ogg'],
    ['audio/mp4', 'audio/mp4'], ['audio/x-wav', 'audio/wav'], ['audio/wav', 'audio/wav'],
    ['audio/mpeg', 'audio/mpeg'], ['audio/mp3', 'audio/mp3'], ['audio/m4a', 'audio/m4a'],
    ['audio/aac', 'audio/aac'], ['audio/flac', 'audio/flac'], ['audio/aiff', 'audio/aiff']
  ]) {
    it(`accepts supported upload MIME ${mimeType}`, async () => {
      assert.equal((await post(multipart({ files: [{ type: mimeType }] }))).status, 200);
      assert.equal(fixture.analyzeAudio.mock.calls[0].arguments[0].mimeType, normalized);
      assertReleased();
    });
  }

  for (const duration of ['0', '12.75', '180', ' 3.5 ']) {
    it(`accepts duration ${JSON.stringify(duration)}`, async () => {
      assert.equal((await post(multipart({ fields: [['durationSeconds', duration]] }))).status, 200);
      assert.equal(fixture.analyzeAudio.mock.calls[0].arguments[0].durationSeconds, Number(duration));
      assertReleased();
    });
  }

  it('allows missing optional duration', async () => {
    assert.equal((await post()).status, 200);
    assert.equal(fixture.analyzeAudio.mock.calls[0].arguments[0].durationSeconds, undefined);
  });

  for (const duration of ['-1', '180.1', 'not-a-number', '', 'NaN', 'Infinity', '1e2']) {
    it(`rejects invalid duration ${JSON.stringify(duration)} and clears audio before processing`, async () => {
      assertError(await post(multipart({ fields: [['durationSeconds', duration]] })), 400, 'INVALID_DURATION');
    });
  }

  for (const [label, upload, code] of [
    ['missing audio field', { files: [] }, 'MISSING_AUDIO'],
    ['empty recording', { files: [{ data: Buffer.alloc(0) }] }, 'EMPTY_AUDIO'],
    ['unexpected file field', { files: [{ field: 'photo' }] }, 'INVALID_UPLOAD'],
    ['multiple audio files', { files: [{}, {}] }, 'INVALID_UPLOAD'],
    ['unexpected text field', { fields: [['uid', 'another-user']] }, 'INVALID_UPLOAD'],
    ['repeated duration field', { fields: [['durationSeconds', '1'], ['durationSeconds', '2']] }, 'INVALID_UPLOAD'],
    ['oversized text field', { fields: [['durationSeconds', '1'.repeat(65)]] }, 'INVALID_UPLOAD']
  ]) {
    it(`rejects ${label}`, async () => {
      assertError(await post(multipart(upload)), 400, code, { zeroed: code !== 'INVALID_UPLOAD' });
      for (const file of fixture.removed) assert.equal(file.buffer, undefined);
    });
  }

  it('rejects malformed multipart data safely', async () => {
    assertError(await post({ body: Buffer.from('not multipart'), contentType: 'multipart/form-data' }), 400, 'INVALID_UPLOAD');
  });

  for (const [label, invalid] of malformedResults) {
    it(`rejects malformed analyzer output: ${label}`, async () => {
      fixture.analyzeAudio = mock.fn(async () => invalid);
      assertError(await post(), 502, 'INVALID_AUDIO_RESULT', { analyzed: true });
    });
  }

  for (const [label, error, status, code] of [
    ['provider rejection', new Error(providerSecret), 502, 'AUDIO_PROCESSING_FAILED'],
    ['Gemini API failure', new AudioProcessingError('GEMINI_API_ERROR', providerSecret), 502, 'AUDIO_PROCESSING_FAILED'],
    ['malformed JSON', new AudioProcessingError('MALFORMED_MODEL_JSON', providerSecret), 502, 'INVALID_AUDIO_RESULT'],
    ['missing model response', new AudioProcessingError('MISSING_MODEL_RESPONSE', providerSecret), 502, 'INVALID_AUDIO_RESULT'],
    ['missing configuration', new AudioProcessingError('MISSING_API_KEY', providerSecret), 503, 'AUDIO_SERVICE_UNAVAILABLE']
  ]) {
    it(`handles ${label} without saving or leaking provider details`, async () => {
      const prior = structuredClone(fixture.session);
      fixture.analyzeAudio = mock.fn(async () => { throw error; });
      assertError(await post(), status, code, { analyzed: true });
      assert.deepEqual(fixture.session, prior);
      assert.deepEqual(fixture.cards, [{ id: 'old-card', known: true }]);
    });
  }

  for (const [label, ack, throws, status, code] of [
    ['database failure', true, true, 500, 'PERSISTENCE_FAILED'],
    ['ownership lost at commit', false, false, 404, 'SESSION_NOT_FOUND'],
    ['missing commit acknowledgement', undefined, false, 500, 'PERSISTENCE_FAILED']
  ]) {
    it(`handles ${label} after clearing raw audio and preserves prior committed state`, async () => {
      const prior = structuredClone(fixture.session);
      fixture.saveResult = ack;
      if (throws) fixture.saveError = new Error(providerSecret);
      const response = await post();
      assert.equal(response.status, status);
      assert.equal(response.body.error.code, code);
      assertNoRaw(response.body);
      assert.equal(fixture.saveAudioResult.mock.callCount(), 1);
      assert.deepEqual(fixture.session, prior);
      assert.deepEqual(fixture.cards, [{ id: 'old-card', known: true }]);
      assertReleased();
    });
  }
});

describe('Gemini audio service (injected SDK-shaped client)', () => {
  function setup(response = { text: JSON.stringify(result()) }) {
    const generateContent = mock.fn(async () => response);
    const analyze = createGeminiAudioService({ client: { models: { generateContent } } });
    return { analyze, generateContent };
  }
  const input = () => ({ audioBuffer: Buffer.from(rawAudio), mimeType: 'audio/webm' });

  it('sends inline audio and a strict JSON schema to the injected client and returns only validated text data', async t => {
    const previous = process.env.GEMINI_AUDIO_MODEL;
    process.env.GEMINI_AUDIO_MODEL = 'offline-audio-model';
    t.after(() => {
      if (previous === undefined) delete process.env.GEMINI_AUDIO_MODEL;
      else process.env.GEMINI_AUDIO_MODEL = previous;
    });
    const { analyze, generateContent } = setup();
    const output = await analyze({ ...input(), mimeType: ' AUDIO/WEBM;codecs=opus ', durationSeconds: 8.25 });
    assert.deepEqual(output, { ...result(), length: 8.25 });
    assert.equal(generateContent.mock.callCount(), 1);
    const request = generateContent.mock.calls[0].arguments[0];
    assert.equal(request.model, 'offline-audio-model');
    assert.deepEqual(request.contents[0].parts[1], {
      inlineData: { mimeType: 'audio/webm', data: rawAudio.toString('base64') }
    });
    assert.match(request.contents[0].parts[0].text, /8\.25/);
    assert.equal(request.config.store, false);
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.equal(request.config.responseJsonSchema.additionalProperties, false);
    assert.deepEqual(request.config.responseJsonSchema.properties.points.items.properties.kind.enum,
      ['explanation', 'correction', 'emphasis']);
    assertNoRaw(output);
  });

  it('accepts Uint8Array input and uses the model duration when optional duration is absent', async () => {
    const { analyze } = setup();
    assert.deepEqual(await analyze({ ...input(), audioBuffer: new Uint8Array(rawAudio) }), result());
  });

  it('accepts silence with an empty transcript and no tagged points', async () => {
    const silence = { transcript: '', points: [], length: 0 };
    assert.doesNotThrow(() => validateAudioResult(silence));
    assert.deepEqual(await setup({ text: JSON.stringify(silence) }).analyze(input()), silence);
  });

  for (const [label, invalid] of malformedResults) {
    it(`rejects parsed Gemini output: ${label}`, async () => {
      assert.throws(() => validateAudioResult(invalid), error => assertSafeProcessingError(error, 'INVALID_AUDIO_RESULT'));
      await assert.rejects(setup({ text: JSON.stringify(invalid) }).analyze(input()),
        error => assertSafeProcessingError(error, 'INVALID_AUDIO_RESULT'));
    });
  }

  for (const length of [NaN, Infinity, -Infinity]) {
    it(`rejects nonfinite result length ${length}`, () => {
      assert.throws(() => validateAudioResult({ ...result(), length }),
        error => assertSafeProcessingError(error, 'INVALID_AUDIO_RESULT'));
    });
  }

  for (const [label, invalid, code] of [
    ['null input', null, 'INVALID_AUDIO'], ['array input', [], 'INVALID_AUDIO'],
    ['missing bytes', {}, 'INVALID_AUDIO'], ['string bytes', { audioBuffer: 'audio' }, 'INVALID_AUDIO'],
    ['empty bytes', { ...input(), audioBuffer: Buffer.alloc(0) }, 'EMPTY_AUDIO'],
    ['unsupported MIME', { ...input(), mimeType: 'text/plain' }, 'UNSUPPORTED_MIME_TYPE'],
    ['missing MIME', { audioBuffer: rawAudio }, 'UNSUPPORTED_MIME_TYPE'],
    ['newline MIME', { ...input(), mimeType: 'audio/webm\r\nprivate: value' }, 'UNSUPPORTED_MIME_TYPE']
  ]) {
    it(`rejects ${label} before calling Gemini`, async () => {
      const { analyze, generateContent } = setup();
      await assert.rejects(analyze(invalid), error => assertSafeProcessingError(error, code));
      assert.equal(generateContent.mock.callCount(), 0);
    });
  }

  for (const durationSeconds of [-1, 181, '12', NaN, Infinity, null]) {
    it(`rejects invalid service duration ${String(durationSeconds)} before Gemini`, async () => {
      const { analyze, generateContent } = setup();
      await assert.rejects(analyze({ ...input(), durationSeconds }),
        error => assertSafeProcessingError(error, 'INVALID_DURATION'));
      assert.equal(generateContent.mock.callCount(), 0);
    });
  }

  for (const durationSeconds of [0, 12.75, 180]) {
    it(`uses valid supplied service duration ${durationSeconds}`, async () => {
      assert.equal((await setup().analyze({ ...input(), durationSeconds })).length, durationSeconds);
    });
  }

  it('does not let supplied duration rescue an invalid model length', async () => {
    await assert.rejects(setup({ text: JSON.stringify({ ...result(), length: 181 }) }).analyze({ ...input(), durationSeconds: 10 }),
      error => assertSafeProcessingError(error, 'INVALID_AUDIO_RESULT'));
  });

  for (const [label, response, code] of [
    ['missing response', undefined, 'MISSING_MODEL_RESPONSE'],
    ['missing response text', {}, 'MISSING_MODEL_RESPONSE'],
    ['blank response text', { text: '  ' }, 'MISSING_MODEL_RESPONSE'],
    ['nonstring response text', { text: 7 }, 'MISSING_MODEL_RESPONSE'],
    ['invalid JSON', { text: `{${providerSecret}` }, 'MALFORMED_MODEL_JSON'],
    ['fenced JSON', { text: '```json\n{}\n```' }, 'MALFORMED_MODEL_JSON']
  ]) {
    it(`handles ${label} safely`, async () => {
      const { analyze, generateContent } = setup();
      generateContent.mock.mockImplementation(async () => response);
      await assert.rejects(analyze(input()), error => assertSafeProcessingError(error, code));
      assert.equal(generateContent.mock.callCount(), 1);
    });
  }

  it('maps SDK rejection to a safe error without an external cause', async () => {
    const { analyze, generateContent } = setup();
    generateContent.mock.mockImplementation(async () => { throw new Error(providerSecret); });
    await assert.rejects(analyze(input()), error => assertSafeProcessingError(error, 'GEMINI_API_ERROR'));
    assert.equal(generateContent.mock.callCount(), 1);
  });

  it('maps response getter failure to a safe error', async () => {
    await assert.rejects(setup({ get text() { throw new Error(providerSecret); } }).analyze(input()),
      error => assertSafeProcessingError(error, 'GEMINI_API_ERROR'));
  });

  it('rejects missing default-client credentials without a network request', async t => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    t.after(() => {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    });
    await assert.rejects(createGeminiAudioService()(input()),
      error => assertSafeProcessingError(error, 'MISSING_API_KEY'));
  });
});
