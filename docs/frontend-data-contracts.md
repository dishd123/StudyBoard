# Frontend data contracts and fixtures — issue #3

Owner: Huda Joad. Related issue: [#3](https://github.com/dishd123/StudyBoard/issues/3).
Scope follows the October 19 revised proposal. These plain JavaScript/JSDoc
contracts need no TypeScript compiler, Firebase connection, or model service.

## Data shapes

| Model | Fields | Rules |
| --- | --- | --- |
| Session | `id`, `title`, `course`, `status`, `errorMessage`, `photo`, `audio`, `summary`, `notes`, `cardCount`, `createdAt`, `updatedAt` | Course is free text. Stored status is `draft`, `ready`, or `failed`. A new draft has null photo/audio, empty notes/summary, and zero cards. |
| Photo | `title`, `thumbnail`, `steps`, `unreadableParts`, `visionText` | One processed photo per session. Steps are `{ step, text }` with unique positive numbers. Unreadable parts are explicit strings; OCR is a fallible hint. |
| Audio | `transcript`, `points`, `length` | One processed recording result per session. Points are `{ text, kind }`; kind is `explanation`, `correction`, or `emphasis`. Length is seconds, at most 180. Raw audio is not retained. |
| Note | `step`, `boardText`, `explanation`, `correction` | Step references the same session's photo. Explanation is null if unmatched; correction is null unless explicitly spoken. Session summary is separate. |
| Card | `id`, `question`, `answer`, `step`, `known` | Step references the same session's notes. Known is boolean and resets on rebuild. |
| Question | `id`, `question`, `answer`, `stepsUsed`, `covered`, `askedAt` | Typed question with source steps and coverage. An uncovered answer has no source steps. |

Each model file exports a small factory that supplies defaults and returns the
documented shape. Factories do not validate untrusted input; backend request and
Gemini/ADK schema validation remain separate work. UI/backend code must reject
invalid values before saving. The factory defaults use new arrays per call.

IDs are document IDs exposed in frontend responses. They do not determine the
authenticated owner. The backend derives user identity from a verified Firebase
token; neither UI values nor agent arguments authorize a database path.

Cards and questions are separate session subcollections in the proposal. The
fixture maps `cardsBySession` and `questionsBySession` group them for local UI
use; those maps are not additional fields stored in the Firestore session.
`session.cardCount` must match all cards, not only the unknown-card subset.

Times in frontend JSON are ISO 8601 UTC strings. The backend will serialize its
Firestore timestamps when building responses. This frontend work does not decide
how the Admin SDK writes timestamps or create Firestore collections/indexes.

The real `photo.thumbnail` is a serialized, size-limited JPEG thumbnail; a data
URL is suitable for this frontend string. Fixtures use `/images/app-board.jpg`
as a bundled visual stand-in. No Google Photos download link is retained in the
contract. There is no Cloud Storage archive, raw audio, access token, courses
collection, run history, bounding box, or timestamp-linked playback model.

## Example alignment and source reference

The Computer Vision fixture illustrates the revised proposal's spoken correction:

```json
{
  "step": 2,
  "boardText": "Blur with sigma 1.4.",
  "explanation": "Blurring reduces noise before differentiation.",
  "correction": "Use sigma 2 instead of 1.4."
}
```

Its cards include a question about the corrected sigma and a question about why
blurring precedes gradients. Both reference step 2. A covered tutor example
names a valid step; the uncovered example says the session does not cover the
final exam and has `stepsUsed: []`. These are synthetic records, not real model
outputs or actual tutor responses.

## Fixtures and processing state

`createWorkspaceFixture(name)` returns fresh sessions, card/question maps, and a
temporary `operation` object on every call. No mutable fixture object is shared
between calls. Unsupported fixture names throw explicitly at the factory; URL
selection falls back to `ready` for an unsupported name.

| Scenario | Saved session state | Related data | Temporary operation |
| --- | --- | --- | --- |
| `empty` | No sessions | Empty maps | `idle`, no operation name |
| `draft` | One draft | No photo/audio, notes, cards, or questions | `idle`, no operation name |
| `processing` | One draft with processed photo/audio | No generated notes/cards yet | `processing`, name `build` |
| `ready` | Three ready sessions: Computer Vision, Web Systems, Machine Learning | Each has its own photo/audio results, three aligned notes, five cards, and covered/uncovered questions | `idle`, no operation name |
| `failed` | One failed session with a plain error | Photo/audio results retained for retry; generated notes/cards empty | `idle`, no operation name |

Processing is a UI request state, not a fourth persisted session status. There
is no database runs collection. The processing/failed fixtures represent an
initial build, not a rebuild with old results. Rebuild coordination and persisted
failure handling will be implemented by the assigned backend/integration issues.

Source records use fixed synthetic IDs, dates, and text. The bundled Project 1
image already belongs to the repository; its handwriting is not asserted to
match any fixture's synthetic extraction. No new personal data, credentials,
external image URLs, or recordings are added.

## Previewing the fixtures

Run `npm run dev` and open:

- `http://localhost:5173/app/?fixture=ready`
- `http://localhost:5173/app/?fixture=empty`
- `http://localhost:5173/app/?fixture=draft`
- `http://localhost:5173/app/?fixture=processing`
- `http://localhost:5173/app/?fixture=failed`

The default `/app/` uses `ready`. The query selector exists only in Vite
development mode; a production build always uses the default preview fixture
until the later API integration replaces fixtures. It is not an auth or API
configuration switch. Processing does not start a real request or finish on a
timer; the URL chooses a deterministic snapshot.

Only minimal existing UI adapters change here: session cards read course,
status, and actual card count; board preview reads the optional photo; the deck
reads `question`, `answer`, and `step`; App selects each session's own cards.
The empty workspace renders safely. Detailed dashboard actions, aligned-note
rendering, tutor history, known toggles, import, and recording remain in #6–9
and their later integration issues. These fixture records do not complete those
features or the reusable status component in #5.

## Acceptance mapping

| Issue #3 requirement | Evidence |
| --- | --- |
| Free-text course | `Session.course`; each ready fixture has a course name. |
| One photo and recording | Nullable singular `Session.photo` and `Session.audio`. |
| Notes with explanations/corrections | Three notes per ready session, with a sigma correction in the vision fixture. |
| Cards with sources | Each card's `step` references an existing note/board step in its own session. |
| Questions with sources and coverage | Covered and uncovered history examples per ready session. |
| Empty/draft/processing/ready/failed | Five independent workspace factories and development preview URLs. |
| No secrets or new personal data | Synthetic text records and existing bundled thumbnail only. |

## Verification results

Codex performed these checks on November 8, 2026, using Linux Node `v22.23.2`
and headless Chrome through Playwright. Browser checks used a temporary Vite
server on port `4175`; Huda's usual dev server was not taken over. No dependency
or lockfile changes were needed.

| Check | Result |
| --- | --- |
| Production build | Passed for both React entry points and copied static pages. |
| All five fixture shapes | Passed Node assertions for valid stored statuses, timestamps, singular material, audio duration/tags, and card counts. |
| Note/card/question source references | Passed; references resolve within the containing session. |
| Ready fixture card counts | Passed; each session has five cards, within the proposal's 5–10 generation target. |
| Scenario boundaries | Passed; empty has no sessions, draft has no media, processing retains draft status, failed exposes a safe error. |
| Isolation and determinism | Passed; each call serializes deterministically and mutations do not affect a later fixture call. |
| Invalid scenario and model defaults | Passed; unknown factory scenario rejected, defaults produce draft/null/unknown values as documented. |
| Browser previews for all five scenarios | Passed; empty cannot open a session, missing material/cards render safely, processing and failed messages appear. |
| Distinct session decks | Passed; switching between Web Systems and Machine Learning changes the displayed questions. |
| Flashcard flip/navigation/source step | Passed with the new question/answer/step fields. |
| Existing Home/About/Contact/Login routes | Passed; pages and navigation render. |
| Dashboard at 390 × 844 | Passed; no document horizontal overflow observed. |
| Invalid preview URL and runtime errors | Fallback rendered ready fixtures; no browser runtime errors observed. |
| Whitespace checks | Passed. |

The Node assertions were one-off implementation verification; no test files were
added to this coding PR. Dedicated automated frontend test files remain under
issue #12. Browser checks are a smoke check, not the full later cross-browser
acceptance suite. Issue #3 is ready for review in its own PR with `Closes #3`.
