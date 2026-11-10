# Build service — Issue #49

`backend/services/buildService.js` orchestrates the existing
[studySetPipeline](study-set-pipeline.md), validates its output, and commits the
generated state through required persistence helpers. It implements
[Issue #49](https://github.com/dishd123/StudyBoard/issues/49). The future agent API
route belongs to Issue #53; this service adds no HTTP route or media processing.

## Calling the service

```js
import { createBuildService } from './services/buildService.js';

const buildStudySet = createBuildService({ getOwnedSession, saveBuildState });
const result = await buildStudySet({ uid, sid });
```

`uid` must come from verified authentication; `sid` is the requested session ID.
The service rejects blank identities and invalid session IDs before lookup.
`getOwnedSession({ uid, sid })` must load only a session owned by that user,
returning the saved session with `id === sid`, or null if inaccessible. Ownership
is enforced by this required helper, consistent with the existing audio route.
There is no default or in-memory persistence implementation. An optional
`runPipeline` function defaults to the existing `runStudySetPipeline` and permits
controlled offline verification.

The loaded session must contain saved `photo` and `audio` results. Missing/null
values produce `MISSING_PHOTO` or `MISSING_AUDIO`. `prepareNotesInput(session)`
then validates and selects the existing course, photo steps/unreadable parts,
and audio transcript/tagged points/duration. At least one readable board step
is required for flashcards. Malformed saved results produce
`INVALID_NOTES_INPUT`. The session also needs a valid ISO UTC `updatedAt` string,
as specified by the existing session contract. All these precondition failures
occur before generation or writes.

Only saved processed text enters ADK. Callers cannot substitute photo/audio
inputs, raw media, or prior generated results through the service context.
Photo thumbnails and other metadata are excluded. Stored status remains one of
`draft`, `ready`, or `failed`; no additional processing status is introduced.

## Validation and retry

Each attempt invokes the complete existing pipeline: notesAgent, then
cardsAgent. Its execution wrapper allocates and discards a fresh ADK session
on every invocation. The service reuses `validateNotesResult` against the
original saved input, preserving board text, correction provenance, point
coverage, ordering, and the two-sentence summary contract.

`validateBuildCardsResult` shares the existing card validator with a 3–12 count
range, inclusive. It rejects malformed/extra fields, blank questions/answers,
duplicates, and steps absent from `notesResult.notes`. `step` remains the agreed
source-reference field. The cardsAgent prompt, schema, and
`validateCardsResult` retain their 5–10 range. Thus the default pipeline still
returns 5–10; the build boundary independently supports the broader 3–12
tolerance without weakening agent validation.

The explicit loop allows two pipeline calls maximum. Invalid returned notes or
cards retry once. A `StudySetPipelineError` retries only when its safe
`retryable` flag is true: missing/invalid output, typed agent generation/output
failures, and recognized transient model error events. ADK reports callback
validation errors as `UNKNOWN_ERROR`, which is treated as retryable generation
failure. Numeric authentication/request errors (400/401/403), missing model
configuration, invalid inputs, ADK session failures, and unclassified thrown
errors do not retry. Ownership, lookup, and persistence failures never cause
another pipeline call. No provider message is returned or stored.

If a second retryable attempt fails, the service throws
`BUILD_RETRY_EXHAUSTED`; a nonretryable generation failure throws
`PIPELINE_FAILED`. There is no third attempt or service-level database retry
loop.

## Required atomic persistence contract

The repository has no Firestore foundation or database helper implementation.
The required `saveBuildState` adapter is the integration point for that work:

```text
saveBuildState({
  uid, sid, expectedUpdatedAt,
  sessionUpdate,
  cards: [{ id, question, answer, step, known }],
  replaceCards: true
}) -> true | false | 'conflict'
```

For both ready and failed writes, the adapter must atomically:

1. Recheck existence and ownership under the authenticated user's session path.
2. Compare the current saved `updatedAt` with `expectedUpdatedAt` from lookup.
3. Patch the existing session with `sessionUpdate` and replace **all** cards
   belonging to that session with the supplied array, including an empty array.
4. Commit all changes together and return `true` only after success.

Return `false` for an inaccessible/deleted session, or `'conflict'` for a changed
version, without writing anything. Throw on database failure. Any other return
value is a failed acknowledgement. A future Firestore adapter must implement
the ownership/version check and replacement in an atomic transaction; independent
session/card writes or append-only behavior do not satisfy this contract.

All writers of processed inputs, build state, or other versioned session
material must advance `updatedAt`. The service advances it beyond the loaded
timestamp even for same-millisecond builds. The version comparison prevents an
older build from replacing newer input or a concurrently committed build. An
ownership/version conflict is returned without a subsequent failed-state write.

On success the session patch contains `summary`, stored `notes` with the existing
four fields (`step`, `boardText`, `explanation`, `correction`), `cardCount`,
`status: 'ready'`, `errorMessage: null`, and `updatedAt`. Existing photo/audio and
other session fields remain intact. Every new card receives a fresh UUID and
`known: false`. Rebuilds replace the complete old deck, discarding its IDs and
review marks. Full validated notes metadata remains available in the returned
`notesResult`; stored notes follow the existing session schema.

## Failures and return value

After final generation failure, the same atomic helper stores `status: 'failed'`
and a fixed plain `errorMessage`, clears summary/notes, replaces cards with an
empty array, and sets `cardCount: 0`. This removes stale generated material while
retaining saved sources. If the ready commit fails, the service attempts this
failed-state commit once, without regenerating. When storage itself is
unavailable, the service cannot guarantee a failed-status update; it reports a
safe persistence error instead of claiming the failure was saved.

Errors are `BuildServiceError` instances with `code`, a fixed safe `message`,
`attempts` (0–2), and `failureStored` (true only after an acknowledged failed
commit). `failureCode`, when present, identifies the preceding safe failure
category. Errors contain no provider payload, raw cause, or ADK internals.
Additional codes cover authentication, invalid session ID/state, inaccessible
session, lookup failure, missing/invalid input, `BUILD_CONFLICT`, and
`PERSISTENCE_FAILED`.

The exact successful return shape is:

```text
{
  session: {
    id, summary,
    notes: [{ step, boardText, explanation, correction }],
    cardCount, status: 'ready', errorMessage: null, updatedAt
  },
  notesResult: validated complete notesAgent output,
  cardsResult: { cards: [{ question, answer, step }] },
  cards: [{ id, question, answer, step, known: false }]
}
```

`session` is the committed generated-state projection, not the whole saved
record. `cards` contains the persisted IDs and review flags; `cardsResult`
retains the agreed agent output. All returned data is detached from pipeline
state and excludes raw media, source metadata, secrets, and runner/session
internals.

## Local verification

Run `npm run check --prefix backend`, `npm run check`, `npm run build`, and
`git diff --check`. Temporary checks outside the repository covered required
inputs/ownership, successful commits, both card-count boundaries, bad note/card
output and step references, retry success/exhaustion, failed-state storage,
replacement/reset on rebuild, persistence failure, and concurrent input/owner
changes. They also exercised malformed-output retry through the real ADK
SequentialAgent/InMemoryRunner with controlled local models and two fresh ADK
sessions. No live model/database calls or dedicated Issue #76 tests were added.
The checks included 28 controlled failure cases; real ADK request/authentication
errors (400/401/403) and missing API configuration stopped after one attempt.
