# notesAgent — issue #46

`backend/agents/notesAgent.js` exports a real Google ADK `LlmAgent` named
`notesAgent` and a `createNotesAgent({ model? })` factory. It matches saved board
steps to tagged spoken points. It does not analyze raw photos/audio, perform
database operations, or run cardsAgent, tutorAgent, or studySetPipeline.

The implementation follows [Issue #46](https://github.com/dishd123/StudyBoard/issues/46)
and the existing [Photo, Audio, and Note contracts](frontend-data-contracts.md).
The original Note fields remain `step`, `boardText`, `explanation`, and
`correction`. Agent results add emphasis and source indexes to each note, plus
top-level audio-only and unresolved collections. These are agent-state additions;
this issue does not change frontend models or decide how the later build service
will persist the enriched fields.

## ADK and state contract

The backend adds only `@google/adk` as a direct dependency, pinned to `2.4.0`.
It uses the supported JavaScript `LlmAgent` API with `inputSchema`, `outputSchema`,
`outputKey`, and lifecycle callbacks. See the
[official ADK agent documentation](https://adk.dev/agents/llm-agents/).
The model defaults to `gemini-3.8-flash`; configure the shared ADK model ID with
`GEMINI_MODEL`. Configure `GEMINI_API_KEY` in the server environment before a
real run. Importing the module and constructing the agent requires no key or
network call. The factory accepts an ADK `BaseLlm` instance as an optional model override.

No shared state-key names were defined in the existing repository or issue text.
This module establishes exported constants for the later pipeline:

| Constant | State key | Value |
| --- | --- | --- |
| `notesInputKey` | `notesInput` | Validated structured input object. |
| `notesOutputKey` | `notesResult` | Validated structured notes object, not a JSON string. Null until successful generation. |

[studySetPipeline](study-set-pipeline.md) places the current build's input under
`notesInput`, then runs notesAgent followed by [cardsAgent](cards-agent.md).
Its execution wrapper uses a fresh ADK session for each build.
The factory creates a separate agent instance
when a pipeline needs its own parent relationship.

## Input schema

`prepareNotesInput(savedSession)` selects and validates the text fields below.
It accepts the actual saved session/Photo/Audio contract, including Photo fields
such as title, thumbnail, and visionText, but copies **only** this projection into
agent state and the model request:

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

Step numbers must be unique; their supplied order is preserved. An empty board
or empty point list is allowed, so audio-only and board-only input remain usable.
The audio contract is validated by Issue #44's existing `validateAudioResult`.
The thumbnail, media bytes, OCR hint, tokens, and unrelated session metadata are
never included in the model request. Course is free text and may be empty.

Prior conversation contents are excluded. A before-model callback constructs a
single text-only message from this validated projection, rather than allowing a
user message or an earlier session's conversation to replace the current input.
The system instruction treats every supplied field as untrusted source material,
never as an instruction to change the task or format.

## Output schema

Every field shown below is required. Unknown output fields are rejected.

```text
{
  course: string,
  summary: string,
  notes: [{
    step: positive safe integer,
    boardText: string,
    explanation: nonempty string | null,
    correction: nonempty string | null,
    emphasis: [nonempty string],
    sourcePointIndexes: [nonnegative safe integer]
  }],
  audioOnly: [{
    pointIndex: nonnegative safe integer,
    text: nonempty string,
    kind: "explanation" | "correction" | "emphasis"
  }],
  unresolved: [nonempty string]
}
```

`course` must exactly match the input. `summary` must contain exactly two
sentences, checked with Node's English `Intl.Segmenter` sentence boundaries.
The model is instructed to keep the summary concise and grounded in the sources.

There is exactly one note per board step, in the same order. `step` and
`boardText` must match their original source exactly. `sourcePointIndexes` are
zero-based indexes into `audio.points`, unique and increasing within each note.
The same point may support multiple board steps when relevant.

For a note, the matching explanation-tagged texts are copied verbatim, in point
order, joined with a newline into `explanation`; absent matches produce null.
Correction-tagged texts use the same rule for `correction`. Emphasis-tagged texts
are copied into the `emphasis` array. The runtime validator checks these exact
relationships, so a model cannot invent a sourced explanation, convert an
explanation into a correction, or discard a corrected value while passing
validation. The agent's reasoning selects which points belong to which steps;
the source wording is deliberately preserved instead of rewritten.

Every tagged audio point must appear in a board note or `audioOnly`. Unmatched
points keep their original index, text, and kind in increasing index order.
They cannot simultaneously be marked audio-only and matched. A board-only item
has empty source indexes, null explanation/correction, and empty emphasis; null
explicitly means no matching spoken explanation was captured.

The transcript supplies context. Relevant transcript-only material not extracted
into tagged points must be flagged in `unresolved` for review, rather than
inventing a source index or silently retagging it. The agent preserves every
`photo.unreadableParts` entry verbatim in `unresolved`; it may add descriptions
of ambiguous matches, unclear speech, or unresolved contradictions.

## Corrections and contradictions

With board `σ = 1.4` and correction-tagged audio `Correction: sigma should be 2.`,
the note retains:

```json
{
  "step": 1,
  "boardText": "σ = 1.4",
  "explanation": null,
  "correction": "Correction: sigma should be 2.",
  "emphasis": [],
  "sourcePointIndexes": [0]
}
```

The original written value, spoken correction, corrected value, and correction
provenance all remain available. Replacing `boardText` with `σ = 2` fails runtime
validation. An explanation saying something different from the board is not
automatically a correction: both strings remain and the prompt requires an
unresolved discrepancy entry without deciding which account is correct.

The validator guarantees structure, source integrity, point coverage, board order,
and unreadable-item preservation. Semantic relevance of an alignment, completeness
of transcript-only uncertainty, contradiction detection, and summary accuracy
still depend on the model; these are not provable from field types alone.

## Validation and failures

`notesContract.js` exports both ADK schemas, state-key constants,
`prepareNotesInput`, `validateNotesResult`, and `NotesAgentError` (re-exported by
`notesAgent.js`). It also exports `validateNotesStructure` for downstream consumers
such as cardsAgent, without requiring the original sources. Full source validation
still runs in `validateNotesResult`. Safe error codes are `INVALID_NOTES_INPUT`,
`INVALID_NOTES_OUTPUT`, `NOTES_MODEL_FAILED`, and `MISSING_API_KEY`.
Validation errors expose fixed messages, not source text or provider payloads.

The before-agent callback clears previous `notesResult` and validates the input.
The after-model callback parses plain JSON and validates it against the current
sources **before** ADK stores output. This guard is necessary because the installed
ADK's default output handling can retain malformed/schema-invalid responses.
The after-agent callback checks the stored object again. Invalid results do not
become successful notes; the later build service owns retry/failure persistence.
Consumers should use validated `notesResult`, not log raw framework/provider
events. The module adds no logger, database tool, retrieval tool, or media call.

## Validation

Run from the repository root:

```powershell
node --test backend/tests/notesAgent.test.js
npm test --prefix backend
npm run check --prefix backend
npm run check
npm run build
```

Issue #74 adds `backend/tests/notesAgent.test.js`, using Node's built-in test
runner and repeatable complete, board-only, and audio-only fixtures under
`backend/tests/fixtures/notesAgent.js`. Tests exercise the production validators,
lifecycle callbacks, and real ADK InMemoryRunner with controlled local BaseLlm
output. They cover matching explanations, separate corrections, emphasis,
unmatched content, unreadable items, board ordering, provenance, two-sentence
summaries, malformed output, and rejection before invalid notes reach state.
No live Gemini requests are made. These checks verify the alignment contract;
semantic alignment quality from a live model still requires separate evaluation.
Production runtime validation remains part of Issue #46.

The dependency installation initially reported transitive advisories; compatible
`npm audit fix --ignore-scripts` updates resolved them without adding direct
dependencies beyond ADK. The resulting backend audit reported zero vulnerabilities.
