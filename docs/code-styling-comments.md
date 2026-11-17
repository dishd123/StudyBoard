# Code Styling and Comments

## Purpose

StudyBoard uses shared conventions to make work from multiple team members
consistent, testable, and traceable to focused issues. This page describes
patterns visible in the repository and practical guidance for new contributions;
it is not a separate JavaScript style guide.

## Naming Conventions

- React component names and their `.jsx` files use PascalCase, such as
  [`AudioRecorder`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/AudioRecorder.jsx)
  and [`SessionWorkspace`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/pages/SessionWorkspace.jsx).
- Functions and variables commonly use camelCase, for example `stopRecording`,
  `elapsedSeconds`, and `onUseRecording`. Factories use `create`, as in
  [`createApiClient`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/services/apiClient.js)
  and [`createBuildService`](https://github.com/dishd123/StudyBoard/blob/main/backend/services/buildService.js).
- Boolean names describe state or capability, such as `known`, `pending`,
  `building`, and `canBuild`. Constants are often descriptive camelCase names,
  such as `maxRecordingSeconds`; fixed error codes use uppercase snake case,
  such as `INVALID_NOTES_INPUT`.
- Backend tests use `.test.js`; React tests use `.test.jsx`. Reusable test data
  lives under directories such as
  [`backend/tests/fixtures`](https://github.com/dishd123/StudyBoard/tree/main/backend/tests/fixtures).

## React Component Structure

Components receive data and actions as props. `SessionWorkspace` selects a tab
and passes session data and callbacks to its children. `MaterialTab` coordinates
local preview state, while `AlignedNotesPanel` renders saved board/notes
alignment and `FlashcardDeck` presents cards and actions.

Use hooks for local UI state and refs for values such as a recorder or timer.
`AudioRecorder` uses an effect cleanup for tracks, timers, pending capture, and
object URLs; `MaterialTab` clears its preview timer. Accessible names, labels,
live status messages, keyboard focus, and explicit loading/error/empty states
appear throughout these components. See
[`StatusMessage`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/StatusMessage.jsx)
for shared status presentation.

Keep network and diagnostic concerns in services where applicable:
[`apiClient.js`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/services/apiClient.js)
encapsulates requests and safe client errors, and
[`clientLogger.js`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/services/clientLogger.js)
emits allowlisted diagnostic metadata. `MaterialTab` currently uses sample
photo/build behavior and local microphone capture; its audio processing is not
connected.

## Backend Service Boundaries

- [`server.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/server.js)
  provides Express setup, `/health`, static serving, and an injection point for
  API routers. Its default app does not automatically mount the audio router.
- [`routes/audio.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/routes/audio.js)
  handles HTTP identity context, ownership lookup, multipart validation, status
  codes, and response shaping. Its factory requires ownership and persistence
  helpers supplied by its caller.
- [`geminiAudioService.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/services/geminiAudioService.js)
  performs the direct Gemini audio operation and validates structured output.
  [`buildService.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/services/buildService.js)
  orchestrates generation, validation, retry, and atomic persistence through
  injected helpers; its adapter contract includes ownership/version checks and
  replacing cards. The factory itself does not create a database.
- [`notesAgent.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/notesAgent.js)
  and [`cardsAgent.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/cardsAgent.js)
  define ADK agents. [`studySetPipeline.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/studySetPipeline.js)
  runs notes before cards in a fresh in-memory session.
  [`notesContract.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/notesContract.js)
  and [`cardsContract.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/cardsContract.js)
  define and validate the structured state exchanged between them.

## Error Handling

Validate input before expensive work. The audio route checks identity, session
ownership, upload type and size before processing; the build service checks
saved sources before running the pipeline. Custom errors such as
`AudioProcessingError`, `NotesAgentError`, `CardsAgentError`, `BuildServiceError`,
and frontend `ApiError` provide codes and messages appropriate to their layer.
The audio route maps errors to HTTP statuses and safe response messages; the
build service records a safe failed state when its persistence helper succeeds.
Provider payloads and credentials should not enter user-facing messages.

Release resources on failure as well as success: the audio route clears its
accessible upload buffer, and the pipeline attempts session deletion in `finally`.
Keep API keys and raw media out of logs. The client logger uses an allowlist of
metadata rather than application content; the general server error handler does
currently call `console.error(error)`, so do not assume every server log is
automatically sanitized.

## Comments

Explain *why* a decision exists or where a significant boundary lies, rather
than repeating the next line of code. Keep comments accurate when behavior
changes. Existing examples include:

- [`AudioRecorder.jsx`](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/AudioRecorder.jsx)
  explains why pending permission requests and queued events are invalidated
  before cleanup.
- [`audio.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/routes/audio.js)
  explains that raw media is released before persistence, and its factory comment
  states the ownership and atomic invalidation requirements.
- [`buildService.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/services/buildService.js)
  describes the atomic session-version comparison and card replacement boundary.
- [`studySetPipeline.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/studySetPipeline.js)
  explains fresh child instances and why session deletion is attempted after
  partially completed creation.
- [`geminiAudioService.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/services/geminiAudioService.js)
  explains MIME normalization and why caller-supplied duration cannot rescue
  invalid model output.

## External Service Calls

Keep provider calls behind a small service or agent boundary and validate the
data crossing it. The Gemini audio service accepts an injectable SDK-shaped
client. The ADK agents accept model overrides for controlled checks; the pipeline
and [`agentCheck.js`](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/agentCheck.js)
use request-scoped in-memory sessions. The audio route and build service accept
persistence helpers with explicit contracts, allowing local mocks and later
integration with real storage.

Model settings and credentials are read from server environment variables, such
as `GEMINI_MODEL` and `GEMINI_API_KEY`. This keeps configuration outside source
code and avoids placing secrets in frontend bundles or committed files. See
[`docs/environment.md`](https://github.com/dishd123/StudyBoard/blob/main/docs/environment.md)
for setup and the distinct settings used by each service.

## Testing Style

Backend tests use Node's built-in runner, `node:assert/strict`, deterministic
fixtures, and injected or mocked dependencies. The audio tests exercise multipart
validation and cleanup with mocked processing and persistence; notes/cards tests
use controlled ADK models; build-service tests cover retry, boundaries, and
atomic persistence behavior. Frontend tests use Vitest and jsdom; the recorder
suite mocks browser media APIs and uses fake timers for lifecycle limits.

Cover failure paths and boundaries as well as success. Keep unit tests repeatable:
avoid live Gemini and Firestore calls. Run `npm test --prefix backend` for backend
tests and `npm run test:frontend` from the root for frontend tests.

## Issue and File Tracking Convention

Assign a feature, component, service, or focused change through a GitHub issue;
develop it on a dedicated branch and use `Closes #<issue>` in its PR description
when the PR completes that issue. Keep unrelated work out of the feature PR.
Tests may have their own issues. This focused file/component ownership and issue
history makes contributions easier to review and trace; a file may participate
in more than one issue.

Examples include #43 for AudioRecorder, #44 for Gemini audio, #45 for the audio
route, #46–#49 for the notes agent, cards agent, pipeline, and build service, and
#72–#76 for their dedicated tests. The history is organized around the scope of
each issue rather than a literal one-issue-per-file rule.

## Representative Source Examples

| Area | Source file | What it demonstrates |
| --- | --- | --- |
| Recording UI | [AudioRecorder.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/AudioRecorder.jsx) | Hooks, browser permissions, cleanup, and playback state |
| Workspace UI | [MaterialTab.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/MaterialTab.jsx) | Props, local state, status messages, and preview boundaries |
| Notes display | [AlignedNotesPanel.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/AlignedNotesPanel.jsx) | Accessible read-only source alignment |
| Card display | [FlashcardDeck.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/components/FlashcardDeck.jsx) | Card state and user actions |
| Client boundary | [apiClient.js](https://github.com/dishd123/StudyBoard/blob/main/frontend/src/services/apiClient.js) | Request handling and safe client errors |
| Audio route | [audio.js](https://github.com/dishd123/StudyBoard/blob/main/backend/routes/audio.js) | Ownership, upload validation, and cleanup |
| Build service | [buildService.js](https://github.com/dishd123/StudyBoard/blob/main/backend/services/buildService.js) | Pipeline orchestration and injected atomic persistence |
| Agent contract | [notesContract.js](https://github.com/dishd123/StudyBoard/blob/main/backend/agents/notesContract.js) | Source-aware structured validation |
| Backend tests | [buildService.test.js](https://github.com/dishd123/StudyBoard/blob/main/backend/tests/buildService.test.js) | Deterministic fixtures, mocks, retries, and persistence failures |
| Frontend tests | [AudioRecorder.test.jsx](https://github.com/dishd123/StudyBoard/blob/main/frontend/tests/AudioRecorder.test.jsx) | Mock media streams, cleanup, and fake timers |

## Current Scope Note

This page documents the repository as it currently exists. Some components and
services are available independently while their application integration remains
future work. Check the relevant issue and source before treating a preview or a
factory as a deployed, end-to-end feature.
