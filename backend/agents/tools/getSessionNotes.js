// getSessionNotes (issue #50): the tutor's one tool, built for each request around the verified uid and session id.
// Returns the session's saved board steps, transcript, spoken points, notes and cards as plain JSON; it never writes.
import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { logCall } from '../../services/logCall.js';
import { getTutorMaterial } from '../../services/sessionStore.js';

/**
 * Builds the getSessionNotes tool for one request.
 * @param {{ uid: string, sessionId: string }} ctx Request context; uid is the verified Firebase user id.
 * @param {(uid: string, sessionId: string) => Promise<object>} [readMaterial=getTutorMaterial] Loads the material
 *   from Firestore. Only scripts/testAgents.js passes another one: an in-memory stand-in built from its fixture.
 * @returns {FunctionTool} A tool the model calls with an optional stepNumber and never with an id.
 */
export function createGetSessionNotesTool(ctx, readMaterial = getTutorMaterial) {
  return new FunctionTool({
    name: 'getSessionNotes',
    description: 'Returns the saved board steps, transcript, spoken points, notes and flashcards of this session.',
    // The model can send only a step number. ADK checks it with this schema and drops any other field, so the
    // uid and session id always come from ctx and the model cannot reach another session.
    // min(1) rather than positive(): ADK turns positive() into exclusiveMinimum, which Gemini's Schema type lacks.
    parameters: z.object({
      stepNumber: z.number().int().min(1).optional().describe('Optional single step to focus on'),
    }),
    execute: async ({ stepNumber }) => {
      return logCall({ operation: 'adk.tool.getSessionNotes', uid: ctx.uid, sessionId: ctx.sessionId }, async () => {
        const material = await readMaterial(ctx.uid, ctx.sessionId);
        const stepExists = material.steps.some((step) => step.number === stepNumber);
        // No step asked for, or a step that does not exist: return all the material.
        if (!stepExists) {
          return material;
        }
        return focusOnStep(material, stepNumber);
      });
    },
  });
}

/**
 * Narrows the material to one board step. The transcript and spoken points stay whole: they have no step numbers.
 * @param {object} material The result of getTutorMaterial.
 * @param {number} stepNumber A step number that exists in material.steps.
 * @returns {object} The same fields, with steps, notes and cards for that step only.
 */
function focusOnStep(material, stepNumber) {
  return {
    ...material,
    steps: material.steps.filter((step) => step.number === stepNumber),
    notes: material.notes.filter((note) => note.stepNumber === stepNumber),
    cards: material.cards.filter((card) => card.stepNumber === stepNumber),
  };
}