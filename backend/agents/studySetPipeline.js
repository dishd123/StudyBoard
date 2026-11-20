// studySetPipeline (issue #48): an ADK SequentialAgent that runs notesAgent, then cardsAgent, on one session state.
// cardsAgent reads state.notes, which notesAgent saved, so the flashcards are written from the notes.
import { SequentialAgent } from '@google/adk';
import { createCardsAgent } from './cardsAgent.js';
import { createNotesAgent } from './notesAgent.js';

/**
 * Builds a new pipeline for one build, with new sub-agents, because an ADK agent can have only one parent.
 * ADK 2.x marks SequentialAgent deprecated; its replacement, Workflow, is still experimental.
 * @returns {SequentialAgent} Runs notesAgent and then cardsAgent; together they write state.notes and state.cards.
 */
export function createStudySetPipeline() {
  return new SequentialAgent({
    name: 'studySetPipeline',
    subAgents: [createNotesAgent(), createCardsAgent()],
  });
}