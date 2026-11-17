# ADK agent check — Issue #23

`runAgentCheck({ value })` from `backend/agents/agentCheck.js` runs a JavaScript
ADK `LlmAgent` with one `FunctionTool`. The tool obtains the current request value
from a request-local closure and returns it to ADK. Success returns
`{ value, toolInvoked: true }` only after an agent run invokes the tool and
finishes. The tool output supplies the returned value. Input must be a nonblank
string of at most 256 characters without control characters. Failures use fixed
`AgentCheckError` codes and messages.

Every call creates its own tool, runner and UUID in-memory session; the session is
deleted after completion. The exported `createAgentCheck({ model })` factory
permits an ADK model override for offline verification. The default
`runAgentCheck` uses `GEMINI_MODEL` (default `gemini-3.8-flash`) and requires
server-side `GEMINI_API_KEY`. The repository requires Node >=22 and uses
`@google/adk` 2.4.0.

This checks the agent-to-tool execution path and request isolation. A controlled
model verifies ADK wiring offline; verifying a real provider configuration
requires a live call. Issue #53 owns the HTTP route, and Issue #79 owns its
dedicated tests.
