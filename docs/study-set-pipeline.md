# studySetPipeline — issue #48

`backend/agents/studySetPipeline.js` composes the existing agent factories into
a real Google ADK `SequentialAgent`, in this order:

```text
notesAgent -> cardsAgent
```

This implements [Issue #48](https://github.com/dishd123/StudyBoard/issues/48).
There is no Firestore access, database session-status update, card deletion,
HTTP route, or build retry here. Persistence and retry orchestration remain in
Issue #49. No dependencies were added.

## Exports and model configuration

| Export | Purpose |
| --- | --- |
| `studySetPipeline` | An ADK SequentialAgent definition containing fresh notesAgent and cardsAgent instances. |
| `createStudySetPipeline({ notesModel?, cardsModel? })` | Create an independent pipeline using the existing child-agent factories. Model overrides support controlled/offline use. |
| `runStudySetPipeline(input)` | Execute one build with a fresh in-memory runner/session, validate results, discard the session, and return both objects. |
| `createStudySetExecutor({ createPipeline?, createRunner? })` | Create the same execution function with factory hooks for local verification. Each call still creates its own runner and UUID session. |
| `StudySetPipelineError` | Fixed safe error messages and stable failure codes. |

The pipeline does not introduce a new model setting. Both child factories retain
their existing `GEMINI_MODEL` configuration, default `gemini-3.8-flash`, and
server-side `GEMINI_API_KEY` requirement. No media service or direct Gemini call
is duplicated. Importing the module makes no model request.

The installed `@google/adk` 2.4.0 still provides `SequentialAgent` but marks it
deprecated in favor of `Workflow` and emits a warning. Issue #48 explicitly
requires SequentialAgent, so this implementation uses it without changing the
agreed framework or upgrading dependencies.

## Build input and state flow

Call the wrapper from backend code with the structured saved-input contract:

```js
import { runStudySetPipeline } from './agents/studySetPipeline.js';

const { notesResult, cardsResult } = await runStudySetPipeline({
  course: session.course,
  photo: session.photo,
  audio: session.audio
});
```

`prepareNotesInput` from `notesContract.js` validates and selects exactly:

```text
{
  course: string,
  photo: {
    steps: [{ step: positive safe integer, text: nonempty string }],
    unreadableParts: [nonempty string]
  },
  audio: {
    transcript: string,
    points: [{ text: nonempty string, kind: "explanation" | "correction" | "emphasis" }],
    length: finite number in [0, 180]
  }
}
```

This is the existing [notesAgent input](notes-agent.md), not a new schema. Saved
Photo metadata such as thumbnail or visionText is omitted from the projection.
Raw photo/audio bytes are not accepted as these structured inputs and are never
included in model requests. Extra caller fields, including stale notesResult or
cardsResult, are not copied into the initial state.

| State key | Writer | Reader |
| --- | --- | --- |
| `notesInput` | Execution wrapper, after validation | notesAgent |
| `notesResult` | notesAgent, after output validation | cardsAgent and final wrapper validation |
| `cardsResult` | cardsAgent, after output validation | Final wrapper validation |

All keys are imported from the existing contracts. ADK's shared session state
passes notesResult between the agents; no manual output bridge is used. Each
agent retains its own before-model callback and excludes unrelated conversation
contents. The wrapper supplies only a fixed text trigger message.

## Fresh session lifecycle

For every execution, including calls through a reused executor function:

1. Validate and copy the structured notes input before allocating a runner.
2. Create a new pipeline and a new `InMemoryRunner`.
3. Generate a new UUID and create an in-memory ADK session seeded only with
   `notesInput`. A separate copy is retained for final source validation.
4. Run the SequentialAgent once, notes first and cards second.
5. Read the final session state and validate both results.
6. Copy the return values and delete the session in `finally`, on success or
   failure, including an attempted cleanup after partially completed creation.

The internal ADK user label `study-set-build` is only a local session namespace,
not an authenticated identity or a database owner. New runners have independent
in-memory session stores, so parallel builds cannot share user/app state or
conversation history. No runner or session is cached in the module. Returned
objects are detached copies and contain no ADK session identifiers or events.

Use `runStudySetPipeline` for build execution. The exported bare pipeline and
factory expose the ADK definition; a caller driving that definition manually is
responsible for its own session lifecycle.

## Return shape and validation

```text
{
  notesResult: existing notesAgent result,
  cardsResult: {
    cards: [{ question: nonempty string, answer: nonempty string, step: integer }]
  }
}
```

The notes result keeps the unchanged course/summary/notes/audioOnly/unresolved
contract documented in [notes-agent.md](notes-agent.md). The cards result keeps
the existing 5–10-card contract documented in [cards-agent.md](cards-agent.md),
using `step` as its source reference.

The wrapper calls `validateNotesResult(notesResult, originalValidatedInput)`
and `validateCardsResult(cardsResult, notesResult)` before returning. This
reuses source-preservation, correction, ordering, card-count, uniqueness, and
source-step membership checks; it does not duplicate their logic. Missing state
or invalid results are rejected rather than reconstructed from event text or
reused from an earlier build. The future build service receives only these
validated objects and may apply its own build-level validation/persistence.

## Safe failures

| Code | Meaning |
| --- | --- |
| `INVALID_NOTES_INPUT` | Initial saved inputs failed notes input validation. |
| `NOTES_AGENT_FAILED` | notesAgent failed, including its own output/configuration guard. |
| `MISSING_NOTES_RESULT` | Final notesResult is absent/null. |
| `INVALID_NOTES_RESULT` | Final notesResult fails the existing source-aware validator. |
| `CARDS_AGENT_FAILED` | cardsAgent failed, including its own output/configuration guard. |
| `MISSING_CARDS_RESULT` | Final cardsResult is absent/null. |
| `INVALID_CARDS_RESULT` | Final cardsResult fails the existing card validator. |
| `ADK_EXECUTION_FAILED` | Runner/session creation, execution, lookup, or an unclassified failure occurred. |
| `ADK_SESSION_CLEANUP_FAILED` | Session deletion failed after an otherwise successful build. |

The wrapper stops when ADK reports an error event. It maps errors to fixed
messages without exposing provider payloads, secrets, raw event messages, or
error causes. A notes failure stops execution before cards. Cleanup is attempted
after failures too; if both execution and cleanup fail, the original safe
execution error is preserved. An otherwise successful build does not return
results if cleanup reports failure. There are no application-level retries.

## Local verification

Run `npm run check --prefix backend`, `npm run check`, and `npm run build`.

Temporary offline checks outside the repository used the real SequentialAgent,
InMemoryRunner, and existing agents with controlled BaseLlm implementations.
They verified imports and order, ADK state passing, exposure of both results,
four successful builds including concurrent runs, independent UUID sessions,
stale-state exclusion, returned-object isolation, and session deletion.
Fourteen failure checks covered invalid initial input, both agents' provider and
malformed-output failures, missing/malformed final results, invalid source steps,
session creation/lookup/execution failures, and cleanup failure. Notes failure
prevented cards from running. No live model requests or dedicated repository
test files were added; the dedicated build test issue remains separate.
