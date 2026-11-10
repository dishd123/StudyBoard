# cardsAgent — issue #47

`backend/agents/cardsAgent.js` exports a Google ADK `LlmAgent` named `cardsAgent`
and a `createCardsAgent({ model? })` factory. It generates 5–10 grounded flashcards
from the preceding [notesAgent](notes-agent.md) output. It performs no database
operations, raw-media processing, HTTP handling, or frontend updates.

This implements [Issue #47](https://github.com/dishd123/StudyBoard/issues/47).
[studySetPipeline](study-set-pipeline.md) runs notesAgent followed by cardsAgent
with a fresh in-memory session. Build persistence and retry remain in Issue #49.

## Existing notes input and ADK state

The agent reads the structured object under the imported `notesOutputKey`
constant, whose value is `notesResult`. It writes its validated object under
`cardsOutputKey`, whose value is `cardsResult`. It does not read `notesInput`,
photo/audio results, transcripts, or media bytes. A user message cannot substitute
for missing saved notes.

The input is exactly the existing notesResult contract:

```text
{
  course: string,
  summary: string,
  notes: [{
    step: positive safe integer,
    boardText: nonempty string,
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

`inputSchema` reuses `notesOutputSchema`; no second notes schema is introduced.
The shared `validateNotesStructure` in `notesContract.js` checks the saved shape,
two-sentence summary, unique step numbers, field types, and provenance-index
structure without requiring the original photo/audio analysis. notesAgent still
runs its full `validateNotesResult` against the original saved sources before
publishing that state. Structural validation here cannot re-establish semantic
grounding if a caller bypasses notesAgent and supplies fabricated notes.

`prepareCardsInput` returns a defensive copy of this object. At least one board
note is required; an audio-only notesResult fails with `INSUFFICIENT_NOTES`.
Before a model request, the agent replaces conversation contents with one
text-only message containing the saved notesResult. It leaves notesResult
unchanged and ignores prior chat/history or unrelated state.

## cardsResult output

```text
{
  cards: [
    {
      question: nonempty string,
      answer: nonempty string,
      step: positive safe integer
    }
  ]
}
```

There must be 5–10 cards, inclusive, and no extra fields. The repository's agreed
[Card contract](frontend-data-contracts.md) names the source reference `step`,
so the generated schema uses `step`, not a new `sourceStep` field. IDs and the
persisted `known` review flag are outside this agent's generated output.

Every step must occur in the supplied `notesResult.notes[].step` set. The check
uses actual step IDs, not array positions or audio-point indexes, and permits
multiple distinct cards from one note. Unknown, fractional, or string-valued step
references are rejected.

Runtime validation also rejects blank questions/answers and repeated questions
after Unicode normalization, case folding, punctuation removal, and whitespace
normalization. A conservative lexical redundancy check rejects highly overlapping
questions with the same normalized answer. Full semantic paraphrase detection
and factual entailment still depend on the model and later evaluation; the code
does not claim that string comparisons prove every answer correct.

## Question and correction behavior

The prompt favors reasons, mechanisms, meaning, consequences, and relationships
when the source provides them. When a board-only note supports only a factual
question, the agent may produce that question without inventing an explanation.
The model must not add outside facts, repair unclear text using general knowledge,
or pad the deck with redundant or unsupported filler. Too few supported cards
cannot be silently padded by application code; invalid counts fail validation.

Explicit `note.correction` takes precedence over conflicting `boardText` in what
the card teaches. For a source note at step 4 with boardText `σ = 1.4` and
correction `sigma should be 2`, a suitable card is:

```json
{
  "question": "What corrected value should be used for sigma?",
  "answer": "2, following the explicit spoken correction.",
  "step": 4
}
```

The original note remains unchanged. The prompt prohibits teaching the old value
as correct or silently resolving a disagreement that has no explicit correction.
Correction adherence is a semantic model responsibility; runtime source-step
validation does not parse arbitrary correction text to infer a replacement fact.

`audioOnly` has no agreed board-step mapping, so it is not a card source. The
agent must not fabricate a step to include it. Unresolved/unreadable material is
excluded unless the specific fact and board step are independently clear in the
supplied notes. The summary supplies context, not an invented source reference.

## Agent setup and failure handling

The module follows notesAgent's installed `@google/adk` 2.4.0 lifecycle pattern.
It uses `outputSchema`, `outputKey`, `includeContents: 'none'`, no tools, and
before-agent/before-model/after-model/after-agent callbacks. No dependencies were
added. The shared model setting is `GEMINI_MODEL`, default `gemini-3.8-flash`;
real generation requires server-side `GEMINI_API_KEY`. Importing or constructing
the agent does not make a network request. Offline checks can inject `BaseLlm`.

The before-agent callback clears cardsResult and validates notesResult. The
after-model callback parses and strictly validates final JSON before ADK can
publish it; the after-agent callback checks the saved object again. Thought
parts are excluded from the structured result. Malformed output, invalid card
counts, and unsupported steps cannot become successful saved cardsResult.

`CardsAgentError` uses fixed safe messages with these codes:

| Code | Meaning |
| --- | --- |
| `INVALID_CARDS_INPUT` | Saved notesResult is absent or malformed. |
| `INSUFFICIENT_NOTES` | There is no board step to reference. |
| `INVALID_CARDS_OUTPUT` | JSON, card shape/count/content, uniqueness, or source reference is invalid. |
| `CARDS_MODEL_FAILED` | The model reports an error, interruption, or incomplete generation. |
| `MISSING_API_KEY` | Server model credentials are unavailable. |

The module exports `cardsAgent`, `createCardsAgent`, `cardsOutputKey`,
`cardsOutputSchema`, `prepareCardsInput`, `validateCardsResult`, and
`CardsAgentError`. Callers should consume validated state rather than log raw
framework/provider events. Retry and persistence belong to later build work.

## Local verification

Run `npm run check --prefix backend` for syntax checks, plus the existing root
`npm run check` and `npm run build` commands.

Temporary checks outside the repository confirmed module imports, acceptance of
the existing notesResult without notesInput, 5- and 10-card boundaries, rejection
of malformed results and unsupported steps, and 25 controlled validation failures.
An offline `BaseLlm` ran through the real ADK `InMemoryRunner`, read only saved
notesResult, preserved it, and wrote cardsResult. Malformed JSON, bad counts, and
invalid references left cardsResult cleared. The existing notesAgent was also
run offline to verify that shared validation extraction preserved its behavior.
No live/paid model requests, database operations, or dedicated repository test
files were added. Dedicated cardsAgent tests and semantic quality evaluation
remain separate work.
