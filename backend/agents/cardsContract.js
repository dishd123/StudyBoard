import { Type } from '@google/genai';
import { validateNotesStructure } from './notesContract.js';

export const cardsOutputKey = 'cardsResult';
export const cardsOutputSchema = {
  type: Type.OBJECT,
  required: ['cards'],
  properties: {
    cards: {
      type: Type.ARRAY,
      minItems: 5,
      maxItems: 10,
      items: {
        type: Type.OBJECT,
        required: ['question', 'answer', 'step'],
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
          step: { type: Type.INTEGER, minimum: 1 }
        }
      }
    }
  }
};

export class CardsAgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CardsAgentError';
    this.code = code;
  }
}

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Consume the preceding agent's existing structured output, without accessing notesInput. */
export function prepareCardsInput(notesResult) {
  try {
    validateNotesStructure(notesResult);
  } catch {
    throw new CardsAgentError('INVALID_CARDS_INPUT', 'Provide the validated notesResult from notesAgent before generating flashcards.');
  }
  if (!notesResult.notes.length) {
    throw new CardsAgentError('INSUFFICIENT_NOTES', 'Flashcards require at least one supported board step. Audio-only material has no card source step.');
  }
  return structuredClone(notesResult);
}

function normalizedText(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function redundantCards(left, right) {
  if (left.question === right.question) return true;
  if (!left.answer || left.answer !== right.answer) return false;
  const leftWords = new Set(left.question.split(' '));
  const rightWords = new Set(right.question.split(' '));
  const smaller = Math.min(leftWords.size, rightWords.size);
  if (smaller < 4) return false;
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return shared / smaller >= 0.9;
}

export function validateCardsResult(result, notesResult) {
  const input = prepareCardsInput(notesResult);
  const invalid = () => { throw new CardsAgentError('INVALID_CARDS_OUTPUT', 'Generate 5–10 distinct flashcards with nonempty questions, answers, and valid note step references.'); };
  if (!exactKeys(result, ['cards']) || !Array.isArray(result.cards) || result.cards.length < 5 || result.cards.length > 10) invalid();
  const steps = new Set(input.notes.map((note) => note.step));
  const seen = [];
  for (const card of result.cards) {
    if (!exactKeys(card, ['question', 'answer', 'step']) || !isText(card.question) || !isText(card.answer)
        || !Number.isSafeInteger(card.step) || !steps.has(card.step)) invalid();
    const normalized = { question: normalizedText(card.question), answer: normalizedText(card.answer) };
    if (!normalized.question || seen.some((previous) => redundantCards(previous, normalized))) invalid();
    seen.push(normalized);
  }
  return result;
}
