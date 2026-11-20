// cardsAgent (issue #47): an ADK LlmAgent that writes 5 to 10 flashcards from the notes notesAgent saved.
// It saves { cards } in session state under 'cards'; buildService checks the cards before they are saved.
import { LlmAgent } from '@google/adk';
import { z } from 'zod';

// The shape Gemini must answer in. ADK asks for JSON in this shape and saves the parsed object under outputKey.
const cardsSchema = z.object({
  cards: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      stepNumber: z.number().int(),
    }),
  ),
});

// {notes} is an ADK state placeholder: ADK replaces it with state.notes written as JSON.
// No other curly braces may appear in this text, or ADK would treat them as placeholders too.
const instruction =
  'Notes (JSON): {notes}\n' +
  'Write 5 to 10 flashcards. question: one sentence that asks why or how. answer: one to three sentences that use ' +
  'only the notes. stepNumber: the step the card is about. Write at least one card for every note that has a ' +
  'correction, and teach the corrected value. Use only facts from the notes.';

/**
 * Builds a new cardsAgent. Each build needs a new one, because an ADK agent can belong to only one pipeline.
 * @returns {LlmAgent} An agent that reads state.notes and writes state.cards.
 */
export function createCardsAgent() {
  return new LlmAgent({
    name: 'cardsAgent',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    instruction,
    outputSchema: cardsSchema,
    outputKey: 'cards', // state.cards = the parsed { cards }
    includeContents: 'none', // the model sees only this turn, not earlier events of the session
    generateContentConfig: { store: false }, // do not keep this request in the project's Gemini logs
  });
}