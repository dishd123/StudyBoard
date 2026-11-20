# ADK agent check (issue #23)

The dashboard's "Check the AI agent" button calls `GET /api/agent-check?value=<text>`. The route runs `runAgentCheck` from `backend/agents/agentCheck.js`: one `LlmAgent` with one `FunctionTool`, `readRequestValue`, which returns the value sent with the current request. The agent is told to call the tool and reply with one sentence that repeats the value.

The route answers `{ value, answer, toolCalled }`. `answer` is the agent's reply, and `toolCalled` is true only when the model called the tool. The value is 1 to 40 characters; without one, the check uses `hello`. Like every AI route, it needs a signed-in user and counts toward the limit of 30 AI calls per user per hour.

The check runs through the shared runner, `backend/agents/runAgent.js`, like the notes, flashcards and tutor agents. So it is logged to Cloud Logging as `adk.agentCheck`, sent to Google Analytics as an `agent_run` event, and gets the same plain error messages.

The first version was pull request #140 by Venkatesh Katta, which ran the same agent-and-tool check with its own runner.