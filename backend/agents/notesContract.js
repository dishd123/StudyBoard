import { Type } from '@google/genai';
import { validateAudioResult } from '../services/geminiAudioService.js';

export const notesInputKey = 'notesInput';
export const notesOutputKey = 'notesResult';

const textSchema = { type: Type.STRING };
const textListSchema = { type: Type.ARRAY, items: textSchema };
const pointKindSchema = { type: Type.STRING, enum: ['explanation', 'correction', 'emphasis'] };
const stepSchema = { type: Type.INTEGER, minimum: 1 };
const indexSchema = { type: Type.INTEGER, minimum: 0 };
const nullableTextSchema = { type: Type.STRING, nullable: true };
const objectSchema = (properties) => ({ type: Type.OBJECT, properties, required: Object.keys(properties) });

export const notesInputSchema = objectSchema({
  course: textSchema,
  photo: objectSchema({
    steps: { type: Type.ARRAY, items: objectSchema({ step: stepSchema, text: textSchema }) },
    unreadableParts: textListSchema
  }),
  audio: objectSchema({
    transcript: textSchema,
    points: { type: Type.ARRAY, items: objectSchema({ text: textSchema, kind: pointKindSchema }) },
    length: { type: Type.NUMBER, minimum: 0, maximum: 180 }
  })
});

export const notesOutputSchema = objectSchema({
  course: textSchema,
  summary: { type: Type.STRING, description: 'Exactly two concise sentences grounded in the supplied sources.' },
  notes: {
    type: Type.ARRAY,
    items: objectSchema({
      step: stepSchema,
      boardText: textSchema,
      explanation: nullableTextSchema,
      correction: nullableTextSchema,
      emphasis: textListSchema,
      sourcePointIndexes: { type: Type.ARRAY, items: indexSchema }
    })
  },
  audioOnly: {
    type: Type.ARRAY,
    items: objectSchema({ pointIndex: indexSchema, text: textSchema, kind: pointKindSchema })
  },
  unresolved: textListSchema
});

export class NotesAgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NotesAgentError';
    this.code = code;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));

/** Project a saved session onto validated text inputs; never forward its thumbnail or other metadata. */
export function prepareNotesInput(input) {
  const invalid = () => { throw new NotesAgentError('INVALID_NOTES_INPUT', 'Provide a course, structured board steps, unreadable parts, and a valid processed audio result.'); };
  if (!isObject(input) || typeof input.course !== 'string' || !isObject(input.photo)
      || !Array.isArray(input.photo.steps) || !Array.isArray(input.photo.unreadableParts)
      || !input.photo.unreadableParts.every(isText)) invalid();
  const seen = new Set();
  for (const item of input.photo.steps) {
    if (!exactKeys(item, ['step', 'text']) || !Number.isSafeInteger(item.step) || item.step < 1
        || seen.has(item.step) || !isText(item.text)) invalid();
    seen.add(item.step);
  }
  try {
    validateAudioResult(input.audio);
  } catch {
    invalid();
  }
  return {
    course: input.course,
    photo: {
      steps: input.photo.steps.map(({ step, text }) => ({ step, text })),
      unreadableParts: [...input.photo.unreadableParts]
    },
    audio: {
      transcript: input.audio.transcript,
      points: input.audio.points.map(({ text, kind }) => ({ text, kind })),
      length: input.audio.length
    }
  };
}

function invalidOutput() {
  throw new NotesAgentError('INVALID_NOTES_OUTPUT', 'Generated notes did not preserve the required structure and source references. Please try again.');
}

function check(condition) {
  if (!condition) invalidOutput();
}

/** Enforce the schema and preservation rules before ADK can publish notesResult. */
export function validateNotesResult(result, source) {
  const input = prepareNotesInput(source);
  check(exactKeys(result, ['course', 'summary', 'notes', 'audioOnly', 'unresolved']));
  check(result.course === input.course && isText(result.summary));
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(result.summary)]
    .filter(({ segment }) => segment.trim());
  check(sentences.length === 2);
  check(Array.isArray(result.notes) && result.notes.length === input.photo.steps.length);
  check(Array.isArray(result.audioOnly) && Array.isArray(result.unresolved) && result.unresolved.every(isText));

  const points = input.audio.points;
  const used = new Set();
  for (const [position, note] of result.notes.entries()) {
    const board = input.photo.steps[position];
    check(exactKeys(note, ['step', 'boardText', 'explanation', 'correction', 'emphasis', 'sourcePointIndexes']));
    check(note.step === board.step && note.boardText === board.text);
    check(Array.isArray(note.sourcePointIndexes));
    let previous = -1;
    for (const index of note.sourcePointIndexes) {
      check(Number.isSafeInteger(index) && index > previous && index < points.length);
      previous = index;
      used.add(index);
    }
    const matched = note.sourcePointIndexes.map((index) => points[index]);
    const textFor = (kind) => matched.filter((point) => point.kind === kind).map((point) => point.text);
    check(note.explanation === (textFor('explanation').join('\n') || null));
    check(note.correction === (textFor('correction').join('\n') || null));
    const emphasis = textFor('emphasis');
    check(Array.isArray(note.emphasis) && note.emphasis.length === emphasis.length
      && note.emphasis.every((text, index) => text === emphasis[index]));
  }
  let previousAudioOnly = -1;
  for (const item of result.audioOnly) {
    check(exactKeys(item, ['pointIndex', 'text', 'kind']));
    const index = item.pointIndex;
    check(Number.isSafeInteger(index) && index > previousAudioOnly && index < points.length && !used.has(index));
    check(item.text === points[index].text && item.kind === points[index].kind);
    previousAudioOnly = index;
    used.add(index);
  }
  check(used.size === points.length);
  check(input.photo.unreadableParts.every((text) => result.unresolved.includes(text)));
  return result;
}
