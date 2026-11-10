# Frontend states and navigation — issue #11

Owner: Huda Joad. Related issue: [#11](https://github.com/dishd123/StudyBoard/issues/11).
Code baseline: `b33d7a7` (PR #126, including the merged runtime recorder).
Reviewed against the October 19, 2026 revised **Proposal_2_StudyBoard.pdf**,
especially sections 1.2–1.5, 2, 4, and 6. The original DOCX is historical context.

This document describes both the UI that exists and the behavior required when
the integrations are connected. **Current** means present in this baseline;
**planned** means an integration requirement, not a completed feature.
Use the [manual review checklist](#manual-review-checklist) for review and the
[review record](#review-record) to distinguish verification from pending sign-off.

## Scope and implementation boundaries

Each session has a free-text course, one photo, and one runtime recording result.
Photo reading and audio processing are direct Gemini calls. The ADK build runs
`notesAgent` followed by `cardsAgent`; the typed tutor uses `tutorAgent` and the
read-only `getSessionNotes` tool. There is no Board Reader or Explanation ADK
agent. No multi-file media archive, file-upload audio input, spoken tutor,
editable note versions, stage-progress dashboard, or Picker polling is planned.

| Area | Current implementation | Planned integration and owner |
| --- | --- | --- |
| Navigation and login | Project 1 page links; explicitly labelled login/account previews; no authenticated identity. | Huda: Firebase Google sign-in, signed-in menu and Sign out. Replace both sample forms with one Google button; remove Create Account. |
| Dashboard | Fixture sessions, free-text courses, local New/Rename/Delete/filter. | Huda: authorized session/card persistence and API-backed dashboard. |
| Photo | Bundled thumbnail and synthetic selection/import results. | Disha: fresh Google Photos authorization per import, one-photo Picker, Vision hint, direct Gemini image processing. |
| Recording | Venkatesh's `AudioRecorder` captures real microphone audio locally, with playback and a 180-second limit. | Venkatesh: connect the recorder Blob to the audio route and display its processed transcript/tagged points. |
| Build and Notes | A timed preview checks inputs but generates nothing; Notes renders saved fixtures. | Venkatesh: connect the implemented build service/pipeline to the UI through the authenticated API and persistence adapters. |
| Study cards UI | Local flip, navigation, known state, unknown filter, and confirmed deletion. | Venkatesh: generated-card UI integration. |
| Session/card persistence | Local React state and fixtures; no browser database connection. | Huda: Firestore and authorized session/card API persistence. |
| Tutor | Typed exact fixture lookup, explicit no-match response, simulated loading/failure/retry. | Huda: saved-material tutor, request-scoped tool, answers/source steps, and last-20 question history. |

Backend modules for audio, notes/cards agents, the pipeline, and the build service
are already present. Their presence does not mean the frontend calls them:
`MaterialTab` and `TutorPanel` still use local callbacks/timers. The audio route
and build service require verified identity and persistence adapters; the
Express server/auth/database wiring remains separate work. Feature components
currently make no `/api` requests. The later API integrations must use
[`apiClient`](api-client.md), rather than add direct fetch calls to components.

## State model

Authentication, persisted session state, and individual operation state are
separate. Do not add `processing`, `retrying`, `signed-out`, or `unauthorized`
to Firestore's `Session.status`.

| Required state | Current representation and behavior | Production behavior to connect |
| --- | --- | --- |
| Signed out | `/login/` is a labelled preview; `/app/` is publicly accessible fixture data. This does not test access control. | Resolve Firebase auth before loading private data. Signed-out users see Google sign-in; clear private in-memory data on sign-out/account change. |
| Empty dashboard | `?fixture=empty`; New available, Rename/Delete/Open disabled. | Successful session list with zero results. Show create guidance; distinguish this from a failed list request. |
| Draft session | Stored `status: 'draft'`; missing material and no generated output in the draft fixture. | New or changed input leaves the session draft until a validated build is saved. Explain missing prerequisites. |
| Photo selected | `MaterialTab.selection` holds one staged sample; saved `session.photo` is separate. | Stage one picked photo. Picking is not successful processing/saving. Cancel/failed replacement must retain the previous committed result. |
| Recording selected | `AudioRecorder.phase: 'ready'` holds one local Blob, duration, and playback URL. | A recording is ready to submit, not processed or saved. Use this recording uploads it; only a confirmed response replaces `session.audio`. |
| Processing | Temporary workspace `operation.status: 'processing'` for a build fixture; photo/build/tutor also have local pending states. | The initiating operation shows one pending status line and prevents duplicate submission. Persist only draft/ready/failed. |
| Ready | `status: 'ready'` fixture with processed photo/audio, summary, notes, cards, and example questions. | Show ready only after the backend confirms a validated, saved build; render returned/reloaded saved data. |
| Failed | `status: 'failed'` fixture with safe error and retained processed inputs; local operations have their own errors. | A build failure can mark the session failed. A cancelled popup, denied microphone, or failed rename is an operation error, not automatically a failed session. |
| Retrying | Photo/build/tutor failure previews expose Try again and pending feedback. | User explicitly retries after addressing the cause. Disable repeat submission until settled; do not silently replay mutations. |
| Unauthorized / inaccessible | `apiClient` normalizes auth/permission errors, but screens are not wired to them. | Handle 401 with sign-in, 403 with access-denied guidance, and missing/inaccessible sessions with safe not-found guidance. Do not keep another user's session visible. |

The saved contract is defined in [`frontend/src/models/session.js`](../frontend/src/models/session.js):
`draft | ready | failed`. The initial build operation is a separate
`{ status: 'idle' | 'processing', name: null | 'build' }` object. Photo selection,
microphone permission/capture, playback, pending requests, and retry flags are
component UI state, not additional database fields or collections.

### Session transitions

| Trigger | Current transition | Production transition |
| --- | --- | --- |
| Create with nonblank title/course | New local draft, selected on Dashboard. | Pending create → confirmed draft or input/service error; no success before save. |
| Select/cancel a replacement photo | Stage/discard selection; committed session unchanged. | Same distinction between pending choice and saved input. |
| Accept a processed photo | Replace local photo → draft; clear generated output. | After successful processing/save, replace photo and invalidate generated output atomically. |
| Record/re-record | Reset local playback, request microphone, capture → stopping → ready; accepted session audio remains unchanged until Use. | Capture remains local until the upload/process/save request succeeds. |
| Use this recording | Accept a placeholder audio result with duration, empty points, and text explicitly saying processing is not connected. | Upload → direct Gemini → saved transcript/tagged points → draft; discard raw audio after processing. |
| Clear accepted recording | Set local audio to null → draft; invalidate generated output. | This is a current preview control, not an additional required production API. Any retained control needs an explicit authorized persistence contract. |
| Make notes and flashcards | Local pending → explicit preview completion/error; no notes/cards generated and no ready transition. | Draft/ready/failed with valid processed inputs → temporary pending → validated save → ready, or terminal build failure → failed. |
| Replace input on ready/failed session | Clear summary, notes, cards, known marks, card count, and old error; return to draft. | Save/invalidate together, on the same session ID. An older build must not overwrite newer inputs. |
| Rename | Change title/timestamp; keep inputs, outputs, status, and creation-date ordering. | Same after confirmed save; show failure without claiming a rename succeeded. |
| Delete session | Confirm → remove local session/cards/questions; choose remaining session or empty Dashboard. | Confirm → pending recursive deletion → update list only after backend confirmation. |
| Review/delete a card | Update local known state/count or confirm deletion. | Pending save/delete → confirmed update or error; rebuild replaces cards and resets known marks. |

An accepted material change currently retains the fixture question map as
historical data. It does not generate new answers; the tutor is disabled while
notes are absent. The revised proposal keeps question history but no note-version
history. A successful rebuild must replace derived results, not append versions.

## Navigation and state lifetime

| From / action | Destination | State behavior |
| --- | --- | --- |
| Site menu: Home, About, Contact, App, Sign in | `/`, `/about.html`, `/contact.html`, `/app/`, `/login/` | Ordinary page navigation. See [entry-point checks](navigation-entry-points.md). |
| Dashboard: select/filter | Dashboard | Exact free-text course filter; selected session resolves to a visible session. Sessions sort newest-created first. |
| Dashboard: Open selected session | Selected session's Material view | Opens only when a visible session exists. |
| Material / Notes / Study section button | Selected section in the same workspace | Buttons use `aria-pressed`; sections do not have separate URLs. |
| Notes: Replace Photo / Re-record / Rebuild | Material | Focus moves to the corresponding photo, recorder, or build control/section. |
| Back to dashboard | Dashboard | App-owned selected session, filter, accepted inputs, and card edits survive. |
| Reopen session | Material | Section-local state starts again. |
| Reload `/app/` or leave and return through a page link | Dashboard | Current preview recreates fixtures and loses local edits. Production must reload the signed-in user's saved data. |

The section buttons do not add browser history entries or session deep links;
browser Back is not an internal tab switch. Keyboard users activate native
buttons with Enter/Space. Keep the existing page and App-launch workflow.

App owns committed local session/card data. Sections mount only while active:

- Leaving Material discards staged photo selection, mock timers, operation
  feedback, and local audio playback. The recorder stops tracks, revokes Blob
  URLs, and invalidates late permission/recorder events. The accepted audio
  placeholder survives in App, but its text is not a real transcript.
- Leaving Study discards the currently displayed tutor answer, draft question,
  pending timer, flipped-card position, and filter. App-owned known/deleted-card
  changes survive until refresh; fixture questions are examples, not a saved
  conversation generated by the preview.
- Later asynchronous integration must cancel or ignore stale responses when
  navigating, switching sessions/users, or replacing inputs. Cancellation is not
  proof that a server mutation did not complete; reload saved state when needed.

The current build button checks that accepted photo/audio objects exist. A local
recording placeholder can satisfy this preview check, but it is not valid
processed audio for a real build. Integration must use confirmed processed
results and the backend's validation. `NotesTab` also retains older helper copy
saying recording is not connected; the recorder now works locally, while audio
processing and generation remain unconnected. Update that copy in the Notes
integration work rather than use it as evidence that capture is missing.

## Slow operations: loading, failure, and recovery

Every integrated slow action needs one status line while running and a safe
plain-language failure. Use [`StatusMessage`](status-message.md) for feedback.
It renders loading/success/empty/error/validation variants and a disabled retry
button during retries; it does not initiate requests or decide authorization.

The following matrix is the integration checklist. An operation marked planned
does not yet have a working UI request in this baseline.

| Operation | Loading state | Failure and recovery | Current coverage |
| --- | --- | --- | --- |
| Resolve auth / Google sign-in / sign-out | Checking sign-in or signing in/out; prevent duplicate popup requests. | Popup cancelled/blocked or auth failed: explain and allow another explicit attempt. Missing auth leads to sign-in, not an endless retry. | Planned; current forms have no auth request. |
| List/filter sessions; open session; load cards/history | Loading requested list/session; distinguish pending from empty. | Safe load error with Try again. Missing/inaccessible session returns to a safe Dashboard/access state. | Fixture rendering only; production reads planned. |
| Create / Rename / Delete session | Saving/deleting; disable duplicate confirmation and keep dialog feedback readable. | Validate blank input locally; service error leaves prior data available and offers another attempt. | Current mutations synchronous; service states planned. |
| Photos Google authorization / create Picker | Requesting access/opening Picker. | Cancelled/blocked popup: retry import explicitly. Expired/rejected Photos authorization starts a new import popup; never reuse a stored Photos token. | Planned. |
| Import picked photo, Vision hint, Gemini extraction, save | Importing one photo; disable conflicting import/build actions. | Picker not finished (409): finish picking, then retry. Unreadable content is marked; no guessed text. Processing/save failure preserves prior committed input/results. | Synthetic 800-ms import with cancel/failure/retry; real request planned. |
| Microphone permission | Waiting for microphone access; Record unavailable while pending. | Denied, missing, busy, or unsupported microphone: useful message and Record again after fixing access/device. | Implemented in `AudioRecorder`. |
| Capture / finish recording | Recording status and timer; Stop available; finishing status while constructing playback. | Capture interruption, empty recording, or stop failure: stop/release resources and offer recording again. | Implemented, including auto-stop at 180 seconds and playback. The proposal's red recording indicator remains a later UI check. |
| Upload/process/save recording | Processing recording; prevent duplicate upload/build against incomplete audio. | MIME/size/duration failure: record supported audio again. Transient processing/save failure: explicit retry when the Blob is still available, otherwise re-record. Keep previous committed audio until success. | Backend route/service exist; frontend currently accepts a placeholder only. |
| Build / Rebuild | Making notes and flashcards; disable repeated build submission. No fabricated stage percentages or polling. | Missing input: return to Material. Invalid/transient generation: backend may retry once, then safe failed state. Conflict: reload changed material before retry. | UI simulation only; backend pipeline/build service exist but are not called by it. |
| Mark known / delete card / unknown-card query | Saving/deleting/loading filtered cards; disable duplicate action. | Failure keeps confirmed state or rolls back any future optimistic change, with safe retry. | Local synchronous actions only; persistence planned. |
| Typed tutor / question history save | Answering from saved session material; disable repeated send. | Blank question: input validation. Missing notes: explain prerequisite. Service failure: retain question for explicit retry. Uncovered answer is a normal result, not an error. | 800-ms fixture response/failure/retry; no AI call or history write. |

The API client never automatically retries a request. The build service's bounded
server-side generation retry is separate: at most two pipeline attempts for
eligible failures, not a second browser POST. Do not replay builds, uploads,
deletes, or questions automatically after an ambiguous response. Do not retry
authorization errors as if they were temporary service failures.

## Authorization and data handling

Planned Firebase state is unknown/checking → signed out or signed in. A real
signed-in menu shows the user and Sign out. Every API call uses a fresh Firebase
ID token; Express derives identity from verification and scopes Firestore paths
to that UID. Frontend session IDs, fixture names, and typed values never prove
ownership. The browser does not access Firestore directly.

- Missing token or HTTP 401: clear access to private views and offer sign-in.
- HTTP 403: show access denied; retry alone cannot grant permission.
- HTTP 404 / inaccessible owned-session lookup: show a safe missing-session
  state without revealing whether another user owns that ID.
- Network/timeout/429/5xx: display the API client's safe message and offer
  appropriate explicit retry, subject to mutation reconciliation above.

These screen transitions are planned. Current error codes can be exercised with
an injected mock client, but there is no unauthorized fixture or real protected
screen yet. A publicly reachable fixture App is not an authorization test.

Photos access is separate from Firebase identity: request a fresh Picker-scope
token per import, send it only on that import's picker/photo calls, then drop it.
Keep only a size-limited 600-pixel JPEG thumbnail plus extracted photo results,
and audio transcript/tagged points. No raw-media archive, saved access tokens,
or additional courses/runs collections are introduced by this state plan.

## Development scenarios and expected results

Run `npm run dev` from the repository root. The URLs below assume port 5173;
use Vite's printed port if different. Query flags are development-only. Built
production currently shows the default ready fixture and ignores these flags;
it is still a preview until authenticated API integration replaces fixtures.

| Scenario URL | Expected visible result |
| --- | --- |
| `/login/` | Preview warning; sample submissions claim neither authentication nor account creation. |
| `/app/?fixture=empty` | No sessions; New enabled, Open/Rename/Delete disabled. |
| `/app/?fixture=draft` | One draft with no inputs, no summary/notes/cards; tutor disabled. |
| `/app/?fixture=processing` | One draft plus a pending build snapshot; Notes says waiting. It never finishes itself. |
| `/app/?fixture=ready` | Three independent sessions with sample material, notes, five cards each, and tutor examples. |
| `/app/?fixture=failed` | Failed badge/safe error; processed photo/audio retained; generated output absent. |
| `/app/?fixture=draft&photoFailOnce=1` | First Use sample photo fails; Try again succeeds. |
| `/app/?fixture=failed&buildFailOnce=1` | First preview build fails; Try again gives explicit preview completion, without generating output or marking ready. |
| `/app/?fixture=ready&notesPreview=unmatched` | Missing explanation rows remain visible and flagged; no inferred explanation. |
| `/app/?fixture=ready&notesPreview=conflict` | Written sigma 1.4 and saved spoken correction to sigma 2 appear separately. This is not a conflict-editing workflow. |
| `/app/?fixture=ready&tutorFailOnce=1` | First nonblank tutor send fails; explicit retry returns a matching fixture or honest no-match result. |

Open the selected session before using its Material/Notes/Study controls. Photo,
build, and tutor fail-once flags reset when their component remounts; retry
without leaving the section to test recovery. The processing fixture is an
independent snapshot, not the result of running the mock build.

## Manual review checklist

These are review instructions, not claims of newly completed browser testing.
Use sample values for login previews and an explanation you intend to record
when testing the real microphone. Earlier evidence is linked below.

| ID | Action | Expected result |
| --- | --- | --- |
| M1 | Follow all five site links on desktop and through the mobile menu. Reload each destination. | Expected page/current marker; menu opens with keyboard; no horizontal page overflow at 390 × 844. |
| M2 | Submit login/account previews; use Open app preview. | Explicit no-auth/no-account feedback; App remains labelled preview. |
| M3 | Load empty fixture. Create a session; submit blank/whitespace values first. | Validation and invalid-field focus; valid free-text course/title creates and selects a draft. |
| M4 | Filter ready sessions, open one, return, rename it, cancel deletion, then confirm deletion. | Selection/filter retained; rename leaves material intact; delete removes only selected session and related local data. |
| M5 | Open draft, processing, ready, and failed fixtures; inspect all three sections. | States match the scenario table; no generated results invented for unfinished sessions; failed inputs remain available. |
| M6 | Stage/cancel a photo replacement, then run a fail-once import and retry without leaving Material. | Cancel/failure retains prior committed photo/results; pending/error/retry/accepted states are distinct. |
| M7 | Allow microphone access, record/stop/play, then Use this recording. Re-record once. | One local recording, duration/playback, explicit unprocessed placeholder; old derived output invalidated only when accepted. |
| M8 | Deny microphone permission, or test with no available input device. | Useful recovery text; no false recording success. Retry after correcting the cause. |
| M9 | Leave Material during recording or after capture; return. | Capture is released and playback discarded; accepted placeholder survives in App. A pending permission grant must not start capture in another view. |
| M10 | With both accepted inputs, trigger build fail-once and retry. | Pending/error/retry/preview-completion status. No generated notes/cards and no false ready status. |
| M11 | Inspect unmatched/correction Notes; activate Replace Photo, Re-record, and Rebuild. | Original board text retained, correction separate, missing explanation explicit; matching Material target receives focus. |
| M12 | Flip/navigate cards with keyboard, mark known, filter unknown, cancel/confirm card deletion. | Correct source step and local review/count/empty states; other session decks unaffected. |
| M13 | Submit blank, covered sample, uncovered sample, arbitrary, and fail-once tutor questions. | Validation; explicit fixture answer/source steps; uncovered result or honest no-match; pending/error/retry with question retained. |
| M14 | Accept changed material on a ready fixture, inspect Notes/Study, return to Dashboard, then refresh. | Draft with stale notes/cards cleared and tutor disabled. Navigation retains App-owned edits; refresh restores fixtures. |
| M15 | Review production-only auth/API requirements using the matrices above. | Signed-out/401/403/404 handling and real loading/save/retry remain clearly marked pending integration, not reported as passed. |

Three-minute auto-stop, recording-format support, and Chrome/Safari/Edge coverage
belong to recording/QA validation; do not claim them from a quick manual pass.
The committed recorder unit tests cover simulated lifecycle/error paths, not a
physical microphone or Safari. Persistent tests for Huda's frontend components
remain issue #12.

## Evidence and review record

Existing implementation evidence:

- [Dashboard states and actions](dashboard.md).
- [Material behavior and runtime recorder update](material-tab.md).
- [Notes, corrections, and unmatched explanations](notes-tab.md).
- [Cards and typed tutor fixture behavior](study-tab.md).
- [Navigation/login evidence and screenshots](navigation-entry-points.md).
- [Data contracts and fixture definitions](frontend-data-contracts.md).
- [API error/retry contract](api-client.md).
- [Build service retry/persistence boundary](build-service.md).

### Verification performed for issue #11

On November 9, 2026 (America/Los_Angeles), Codex checked the revised PDF and the
merged source baseline listed above. Commit `642cc3c` is an ancestor of this
branch; the merge retained Huda's #10 commit. PR #126 is merged and #10 closed.

| Check | Result |
| --- | --- |
| `npm run build` after the team merge | Passed for both React entries and copied static pages. |
| `npm run test:frontend` | Passed: 1 file, 33 recorder tests. This does not establish full frontend coverage. |
| State plan vs. revised PDF/current source | Documented; current recording separated from unconnected processing, auth, persistence, and generation. |
| Markdown local links, scenario names, whitespace | Checked before PR handoff. |
| New browser/manual checklist execution | Not performed for this documentation issue; prior evidence linked above. |
| Live Firebase/Photos/Gemini/Firestore acceptance | Pending their integration issues. |

### Review record

Huda owns this document. Disha is the proposed reviewer; PR review is pending.
The reviewer should verify the state/operation tables, the revised scope, and
the current-vs-planned distinctions against the code. No team sign-off is
implied by this document or its automatic checks.

| Review | Reviewer / date / result |
| --- | --- |
| Huda's manual checklist | Pending; record M1–M15 results and any unavailable device checks in the PR. |
| State-plan team review | Pending; Disha or the actual reviewer records name/date and approval or follow-up in the PR. |

Request review in the dedicated documentation PR with `Closes #11`. Complete
the review record through PR comments before merging; production integrations
and their acceptance tests remain separately tracked.
