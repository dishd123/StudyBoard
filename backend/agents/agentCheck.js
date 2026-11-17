import { randomUUID } from 'node:crypto';
import { FunctionTool, InMemoryRunner, LlmAgent } from '@google/adk';

const messages = {
  INVALID_INPUT: 'Provide a nonempty value of at most 256 characters.',
  MISSING_API_KEY: 'The agent check is not configured on the server.',
  AGENT_CHECK_FAILED: 'The agent check could not complete. Please try again.',
  SESSION_CLEANUP_FAILED: 'The temporary agent-check session could not be discarded.'
};
export class AgentCheckError extends Error {
  constructor(code) { super(messages[code]); this.name = 'AgentCheckError'; this.code = code; }
}

/** Optional ADK model override supports controlled offline verification. */
export function createAgentCheck({ model } = {}) {
  return async function runAgentCheck(input) {
    const value = input?.value;
    if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new AgentCheckError('INVALID_INPUT');
    }
    if ((model === undefined || typeof model === 'string') && !process.env.GEMINI_API_KEY?.trim()) {
      throw new AgentCheckError('MISSING_API_KEY');
    }
    let toolResult;
    const tool = new FunctionTool({
      name: 'return_request_value',
      description: 'Return the current smoke-check request value.',
      parameters: { type: 'OBJECT', properties: {} },
      execute: async () => { toolResult = { value }; return toolResult; }
    });
    let runner;
    let address;
    let failure;
    let finalResponse = false;
    try {
      const agent = new LlmAgent({
        name: 'agentCheck', model: model ?? (process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash'),
        instruction: 'Call return_request_value once, then finish.', tools: [tool],
        generateContentConfig: { store: false }, disallowTransferToParent: true, disallowTransferToPeers: true
      });
      runner = new InMemoryRunner({ agent, appName: 'StudyBoardAgentCheck' });
      address = { appName: runner.appName, userId: 'agent-check', sessionId: randomUUID() };
      await runner.sessionService.createSession(address);
      for await (const event of runner.runAsync({
        userId: address.userId, sessionId: address.sessionId,
        newMessage: { role: 'user', parts: [{ text: 'Run the request value check.' }] },
        runConfig: { streamingMode: 'none', saveInputBlobsAsArtifacts: false }
      })) {
        if (event.errorCode) throw new Error('Agent failed');
        if (event.author === 'agentCheck' && event.content?.parts?.some(part => typeof part.text === 'string' && part.text.trim())) finalResponse = true;
      }
      if (!finalResponse || !toolResult || toolResult.value !== value) throw new Error('Tool was not invoked');
    } catch {
      failure = new AgentCheckError('AGENT_CHECK_FAILED');
    } finally {
      if (runner && address) {
        try { await runner.sessionService.deleteSession(address); }
        catch { failure ??= new AgentCheckError('SESSION_CLEANUP_FAILED'); }
      }
    }
    if (failure) throw failure;
    return { value: toolResult.value, toolInvoked: true };
  };
}
export const runAgentCheck = createAgentCheck();
