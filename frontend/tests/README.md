# Phase 0 frontend tests

Owner: Huda Joad. Related issue: [#12](https://github.com/dishd123/StudyBoard/issues/12).
The existing recorder suite belongs to Venkatesh's issue #72 and is retained.

## Run the tests

From the StudyBoard repository root, after dependencies have been installed:

```bash
npm run test:frontend
```

For a fresh checkout, install the root dependencies first with `npm ci`.
No development server, browser account, microphone permission, Firebase project,
API key, cloud service, or backend process is needed. The command runs once
and exits with a failure status if any assertion fails. Vitest and jsdom are
already root dev dependencies; this issue adds no dependencies or config changes.

Tests stay in the existing `frontend/tests/` directory because
`vitest.config.js` already discovers it. The issue's original `tests/frontend/`
and `src/**/*.test.jsx` paths were proposed alternatives, not existing directories
that need a second runner. Test files use the current `src/` layout; update
their import/HTML paths when issue #15 relocates the frontend.

## Coverage

| Test file | Cases | Behavior covered |
| --- | --- | --- |
| `Dashboard.test.jsx` | 10 | Empty/draft/processing/ready/failed states, filtered-empty feedback, select/open/back, title/course validation, create, rename, confirmed deletion, recovery from empty. |
| `SessionWorkspace.test.jsx` | 9 | Material/Notes/Study activation, Back callback, Notes-to-Material focus targets, incomplete/failed Notes, unmatched explanations, separate spoken corrections, input acceptance invalidating stale notes/cards in the same session. |
| `MaterialTab.test.jsx` | 6 | Build prerequisites, cancelled selection, import loading/failure/retry, cancellation/unmount cleanup, build failure/retry, safe caller-failure text, audio-clear callback. |
| `FlashcardDeck.test.jsx` | 4 | Flip/source step/navigation, empty/single deck, known/unknown filtering, last-unknown recovery, confirmed deletion and focus restoration. |
| `TutorPanel.test.jsx` | 6 | Missing-note and blank-question validation, loading/disabled send, covered/uncovered fixtures, honest arbitrary-question no-match, failure/retry retaining the question, pending reply cleanup. |
| `StatusMessage.test.jsx` | 7 | Mounted idle live region, loading/success/empty, assertive validation/service/general errors, explicit retry and disabled repeat retry, safe fallback. |
| `navigation.test.jsx` | 10 | Five React navigation destinations/current-page markers, four static-page/alias scenarios, mobile-toggle wiring, HTML React entry scripts, Home App-launch link. |
| `fixtures.test.js` | 6 | Empty/draft/processing/failed shapes, per-session source references and card counts, nested isolation, replacement/unmatched previews, invalid scenarios, covered/uncovered/no-match semantics. |
| `apiClient.test.js` | 16 | Fresh auth tokens, JSON payloads, fail-closed missing identity, normalized HTTP errors, no automatic replay, same-origin paths, import-only Photos tokens, multipart boundary, empty success, transport error and cancellation. |
| `AudioRecorder.test.jsx` (existing) | 33 | Recorder lifecycle, permission/capture errors, format fallback, playback/accept/re-record, three-minute limit and resource cleanup with synthetic media mocks. |
| Total | 107 | 74 new cases plus 33 existing recorder cases. |

These tests assert visible results, allowed actions, callback effects, and data
boundaries. There are no generated snapshots. Fixtures are synthetic, independent
copies; local UI data is not reported as real Gemini output or Firestore data.
Covered and uncovered tutor examples are distinguished from questions with no
matching fixture answer.

## Isolation and limits

`helpers/ui.jsx` mounts React roots inside `act`, dispatches controlled-input and
button events, and cleans up roots, globals, DOM shims, URLs, and fake clocks.
New component suites replace `fetch` with a rejecting spy and assert it was
never called. API tests use an explicitly injected mock transport. Tests do not
contact Google Photos, Firebase, Gemini, Firestore, or a live backend.

jsdom does not implement browser modal focus containment or page layout. The
helper supplies minimal `showModal`, `close`, and `scrollIntoView` behavior;
tests check application validation/focus destinations, not native focus trapping
or scrolling. The Material tests leave the microphone unavailable; the workspace
focus test enables only a stubbed capability without requesting capture. The
existing recorder suite owns the synthetic recording lifecycle checks.

Navigation tests verify links/current-page metadata and Bootstrap toggle target
wiring. They do not load the CDN bundle or prove that its menu expands in a
browser. Native button markup does not prove actual Enter/Space behavior in all
browsers. Mobile layout, physical microphone/playback, assistive technology,
Chrome/Safari/Edge, and deployed authentication/authorization remain browser or
integration checks. See the previous [navigation evidence](../../docs/navigation-entry-points.md)
and [Material evidence](../../docs/material-tab.md).

## Verification evidence

Codex ran the complete suite on November 9, 2026 (America/Los_Angeles) with Linux
Node v22.23.2 and Vitest v5.1.0, on a branch based on `b33d7a7`. Final summary:

```text
Test Files  10 passed (10)
     Tests  107 passed (107)
```

`npm run build` also passed for both React entries and the copied static pages.
Whitespace and local documentation links were checked before PR handoff.
No production source, package, lockfile, runner configuration, or existing
recorder test was changed by issue #12.

## Huda's completion steps

1. Run `npm run test:frontend` yourself and confirm the passing summary above.
2. Run `npm run build` and confirm success.
3. Put the real test output in issue #12 or its PR comment. Include the command,
   pass/fail totals, and any failures encountered; do not report a later browser
   or cloud test as completed from these unit results.
4. Open a dedicated PR into `main` with `Closes #12`, and request teammate review.
   The tests are Huda's work; the existing recorder suite remains unchanged.
5. After approval/merge, issue #12 closes. Issue #11's documentation PR can be
   reviewed independently; these tests do not depend on it being merged.
