# Venkatesh Source Review

## Scope

This review for [#99](https://github.com/dishd123/StudyBoard/issues/99)
describes the current implementation of the recording, audio, agent, build,
and study-interface work. Earlier branches and their tests are historical
evidence; they should not be used as a substitute for the current source.

Git history shows that Venkatesh implemented the original #23 and #43–#49
work and the #72–#76 tests. Later integration commits by Disha rewrote or
combined several of those files, including #53–#56 integration. The #79 router
testability change and route tests were committed by Venkatesh. The mapping below
therefore describes issue responsibility and shared contribution history, not
exclusive authorship of every current line.

## Source-to-Issue Traceability

| Current source on `main` | Issue | Responsibility |
| --- | --- | --- |
| [AudioRecorder.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/AudioRecorder.jsx) | [#43](https://github.com/dishd123/StudyBoard/issues/43), [#54](https://github.com/dishd123/StudyBoard/issues/54) | Browser recording, playback, re-record and upload |
| [geminiAudioService.js](https://github.com/dishd123/StudyBoard/blob/main/backend/services/geminiAudioService.js) | [#44](https://github.com/dishd123/StudyBoard/issues/44) | Direct audio transcription and tagged-point cleanup |
| [testGeminiAudio.js](https://github.com/dishd123/StudyBoard/blob/main/backend/scripts/testGeminiAudio.js) | [#44](https://github.com/dishd123/StudyBoard/issues/44) | Local live-audio verification utility; originally added with #44 and later revised |
| [audio.js](https://github.com/dishd123/StudyBoard/blob/main/backend/routes/audio.js) | [#45](https://github.com/dishd123/StudyBoard/issues/45) | Authenticated recording upload, ownership and processed-result save |
| [agentCheck.js](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/agentCheck.js) | [#23](https://github.com/dishd123/StudyBoard/issues/23) | Request-scoped ADK tool smoke check |
| [notesAgent.js](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/notesAgent.js) | [#46](https://github.com/dishd123/StudyBoard/issues/46) | Board/explanation alignment and correction-aware notes |
| [cardsAgent.js](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/cardsAgent.js) | [#47](https://github.com/dishd123/StudyBoard/issues/47) | Flashcards from saved agent notes |
| [studySetPipeline.js](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/studySetPipeline.js) | [#48](https://github.com/dishd123/StudyBoard/issues/48) | Sequential notes-then-cards ADK pipeline |
| [buildService.js](https://github.com/dishd123/StudyBoard/blob/main/backend/services/buildService.js) | [#49](https://github.com/dishd123/StudyBoard/issues/49) | Build validation, retry, and persistence orchestration |
| [agents.js](https://github.com/dishd123/StudyBoard/blob/main/backend/routes/agents.js) | [#53](https://github.com/dishd123/StudyBoard/issues/53), [#79](https://github.com/dishd123/StudyBoard/issues/79) | Agent HTTP wiring and injected test seam |
| [MaterialTab.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/MaterialTab.jsx) | [#54](https://github.com/dishd123/StudyBoard/issues/54) | Saved material and build controls |
| [NotesTab.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/NotesTab.jsx) | [#55](https://github.com/dishd123/StudyBoard/issues/55) | Saved summary, alignment and rebuild/navigation actions |
| [FlashcardDeck.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/FlashcardDeck.jsx) | [#56](https://github.com/dishd123/StudyBoard/issues/56) | Saved cards, review, filtering and deletion |

Related shared integration is in [runAgent.js](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/runAgent.js)
([#163](https://github.com/dishd123/StudyBoard/issues/163)), added in the later
integration commit, and [sessionStore.js](https://github.com/dishd123/StudyBoard/blob/main/backend/services/sessionStore.js),
which owns the Firestore persistence used by the build and audio services.
These are dependencies of the reviewed features, not claims of sole ownership.

### Supporting Tests

The original dedicated suites for #72–#75 were removed in later integration;
the links below point to the historical commits, not files currently on `main`.
The present #76 and #79 files are linked to `main`.

| Test evidence | Issue | Current status |
| --- | --- | --- |
| [AudioRecorder.test.jsx](https://github.com/dishd123/StudyBoard/blob/57e5fbd/frontend/tests/AudioRecorder.test.jsx) | [#72](https://github.com/dishd123/StudyBoard/issues/72) | Historical lifecycle suite; absent from current `main` |
| [audio.test.js](https://github.com/dishd123/StudyBoard/blob/5e70908/backend/tests/audio.test.js) | [#73](https://github.com/dishd123/StudyBoard/issues/73) | Historical audio suite; absent from current `main` |
| [notesAgent.test.js](https://github.com/dishd123/StudyBoard/blob/0539918/backend/tests/notesAgent.test.js) | [#74](https://github.com/dishd123/StudyBoard/issues/74) | Historical alignment suite; absent from current `main` |
| [cardsAgent.test.js](https://github.com/dishd123/StudyBoard/blob/e4a75e4/backend/tests/cardsAgent.test.js) | [#75](https://github.com/dishd123/StudyBoard/issues/75) | Historical card-output suite; absent from current `main` |
| [buildService.test.js](https://github.com/dishd123/StudyBoard/blob/main/backend/tests/buildService.test.js) | [#76](https://github.com/dishd123/StudyBoard/issues/76) | Current `validateStudySet` checks; the earlier orchestration suite was replaced |
| [agentsRoutes.test.js](https://github.com/dishd123/StudyBoard/blob/main/backend/tests/agentsRoutes.test.js) | [#79](https://github.com/dishd123/StudyBoard/issues/79) | Current isolated HTTP wiring tests |

The current `backend/scripts/testAgents.js` and its edge-detection fixture were
added with the later integration ([#164](https://github.com/dishd123/StudyBoard/issues/164),
[#165](https://github.com/dishd123/StudyBoard/issues/165)); they are not a
replacement claim for the historical suites above.

## Runtime Recording and Browser Formats

`AudioRecorder` records through `getUserMedia`; it has no audio-file upload
alternative. It asks `MediaRecorder.isTypeSupported` in this order: WebM/Opus,
WebM, then MP4. WebM/Opus is the intended Chrome/Edge choice; MP4 is the intended
Safari choice. Support still depends on the browser and device, and the code
shows an error when none of these formats is supported. This ordering is not
evidence that every browser/version has completed compatibility testing.

The recorder displays elapsed time and stops at the three-minute limit. The
finished Blob is playable and may be replaced with Re-record; **Use this
recording** uploads it through the API. For Gemini, the backend strips codec
parameters and maps browser `audio/mp4` to `audio/m4a`.

Finishing stops the microphone tracks, releasing the microphone and its privacy
indicator. Unmount clears the interval, stops an active recorder and tracks, and
revokes the playback URL, avoiding continued capture, timer and URL leaks after
navigation. Re-record also revokes the old URL. If permission resolves after
unmount, the newly granted stream is stopped instead of being used.

## Audio Processing and Persistence

The authenticated audio route accepts an `audio/*` raw request body, limits it
to 10 MB, checks the mapped MIME type and nonempty bytes, then looks up the
owned session before calling the model. `durationSeconds` is rounded and clamped
to 0–180; missing, negative, or nonnumeric input becomes 0. This is the current
route behavior, not the stricter multipart validation of the earlier prototype.

`readRecording` sends the raw audio directly to Gemini through the shared
`generateJson` service. Its instruction treats recording content as study
material, not instructions. It returns a transcript and points tagged
`explanation`, `correction`, or `emphasis`; it trims and caps text and drops
invalid or excess points. The route rejects an empty transcript and saves only
the processed text, points, and duration. Raw audio is not saved by this path.
The current route does not explicitly zero the request buffer; it becomes
eligible for release with the request lifecycle. The saved result is returned to
the UI and replacing audio marks generated material for rebuilding.

## Agent State and Validation

```text
saved photo/audio text -> buildService -> fresh studySetPipeline
  -> notesAgent -> state.notes -> cardsAgent -> state.cards
  -> buildService validation -> sessionStore Firestore batch
```

The notes agent reads `state.photo` and `state.audio` via instruction
placeholders and writes `{ summary, notes }` to `state.notes`. The cards agent
reads that notes state and writes `{ cards }` to `state.cards`. The pipeline is a
real ADK `SequentialAgent`: notes runs before cards. A fresh pipeline and fresh
children are created per attempt because an ADK child can have only one parent;
`runAgent` creates and deletes an in-memory session per run.

The agents request structured output through schemas and instructions. The
notes prompt requests a two-sentence summary and preserved board/correction
values; the cards prompt requests 5–10 cards and corrected understanding. These
are model constraints, not a proof that the content is semantically correct.

At the backend trust boundary, `validateStudySet` accepts objects or JSON text,
requires a nonblank summary and notes/cards arrays, then reconstructs notes from
the saved photo. It keeps the first model note for each valid step, drops unknown
steps, sorts by photo step number, uses the saved board text, and fills missing
notes with null explanation/correction. Cards with an unknown step or blank
question/answer are dropped. Fewer than three usable cards fails validation;
more than twelve are truncated to the first twelve. The backend checks a
nonblank summary, not its sentence count, and does not prove semantic alignment
or detect every incorrect correction.

The build service requires saved photo steps and a nonempty transcript. It makes
at most two generation attempts; unusable output and retryable generation
failures may be tried once more. Non-502 `HttpError` failures, including busy or
unconfigured model errors, are propagated without that retry. After two failed
attempts it asks the store to mark the session failed with a plain message and
returns a 502. The current `markBuildFailed` updates status and error; it does
**not** clear old notes or cards.

On success, `saveStudySet` deletes old cards and writes the new cards plus the
ready session update in one Firestore batch. New card documents receive fresh
IDs and `known: false`; session summary, notes and card count are updated. This
batch behavior should not be mistaken for an optimistic version check against
concurrent edits: the current implementation reads existing cards before its
batch and does not compare a session version during the commit.

## Agent Routes

After `requireUser`, the agents router passes verified `req.uid` and relevant
session/GA context to its services:

- `GET /api/agent-check` -> `runAgentCheck`.
- `POST /api/sessions/:sid/build` -> `buildStudySet`.
- `POST /api/sessions/:sid/questions` -> `askTutor`.
- `GET /api/sessions/:sid/questions` -> `listQuestions`; the store owns the
  20-record history limit.

The routes are HTTP wiring, not implementations of the agents or storage.
`createAgentsRouter()` allows service and rate-limiter injection for #79 tests;
`export default createAgentsRouter()` still uses the real production defaults.
The smoke check returns the requested value, model answer and `toolCalled` flag;
the caller must inspect that flag to know whether ADK reported a tool call.

## Study Interface

`MaterialTab` displays the processed board, saved transcript and tagged points,
with correction tags shaded. Build is enabled when both saved photo and audio
exist, calls the real build API, and offers a retry after failure. The backend
also checks for readable steps and a nonempty transcript.

`NotesTab` renders the saved summary and step, board text, explanation, and
correction columns. A correction cell is shaded, keeping the board value and
spoken correction visible separately. Rebuild calls the workspace action;
Replace photo and Re-record both navigate to Material. There is no note-editing
or version-history workflow in this component.

`FlashcardDeck` displays saved cards and source steps, supports flip and
Previous/Next, persists Got it/Still learning, and deletes through the API after
confirmation. Its unknown-only toggle requests backend-filtered cards; it also
shows an empty-deck state.

## Review Notes

The current implementation and history differ from several earlier design docs:
state keys are `notes`/`cards`; the audio route uses a raw body and clamps
duration; build validation normalizes results rather than strictly rejecting
every malformed card; and final failure does not clear previous generated data.
The historical #72–#75 suites are no longer present on `main`. These differences
are recorded here rather than presented as completed guarantees. Browser
compatibility and live provider behavior still require their own verification.
