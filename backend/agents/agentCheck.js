// ADK smoke check (issue #23): one LlmAgent calls one FunctionTool that returns a value from the current request.
// GET /api/agent-check uses it to show that ADK, the tool and the Gemini model work together in the deployed service.
import { FunctionTool, LlmAgent } from '@google/adk';
import { z } from 'zod';
import { runAgent } from './runAgent.js';

const instruction = 'Call readRequestValue, then reply with one short sentence that repeats the value it returned.';

/**
 * Runs the smoke check once.
 * @param {{ uid: string, gaClientId: string|null }} ctx Request context from the route.
 * @param {string} value The request's value (1-40 characters). Only the tool hands it to the model.
 * @returns {Promise<{ value: string, answer: string, toolCalled: boolean }>} answer is the agent's reply;
 *   toolCalled is true when the model called readRequestValue.
 * @throws {HttpError} 503, 429 or 502 from runAgent.
 */
export async function runAgentCheck(ctx, value) {
  // Built for this request, so the tool can return only this request's value.
  const readRequestValue = new FunctionTool({
    name: 'readRequestValue',
    description: 'Returns the value sent with the current request.',
    // An optional field the tool ignores, so the declared parameters are not an empty object, which Gemini may reject.
    parameters: z.object({ reason: z.string().optional() }),
    execute: async () => {
      return { value };
    },
  });
  const agent = new LlmAgent({
    name: 'agentCheck',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    instruction,
    tools: [readRequestValue],
    generateContentConfig: { store: false }, // do not keep this request in the project's Gemini logs
  });
  const result = await runAgent({
    agent,
    ctx,
    operation: 'adk.agentCheck',
    message: 'Run the agent check.',
    maxLlmCalls: 4, // one call that asks for the tool, one reply, and room for two more
  });
  return { value, answer: result.finalText, toolCalled: result.toolCalls.includes('readRequestValue') };
}