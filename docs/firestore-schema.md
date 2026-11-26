# Revised Firestore schema — issue #31

Owner: Huda Joad. Related issue: [#31](https://github.com/dishd123/StudyBoard/issues/31).
Source: October 19 revised **Proposal_2_StudyBoard.pdf**, sections 1.3–1.5, 2, 4, and 6, reconciled with the current main branch.

This is the revised schema contract. The repository now contains the Google Cloud/Firebase configuration, Admin SDK adapter, authentication boundary, Firestore rules, index declaration, persistence service, and API routes. Those implementation foundations are present; deployment, integration, automated testing, and runtime evidence remain separate work.

## Scope and ownership

The database contains only user-scoped sessions, their cards, and their typed tutor questions:

```text
users/{uid}/sessions/{sessionId}
users/{uid}/sessions/{sessionId}/cards/{cardId}
users/{uid}/sessions/{sessionId}/questions/{questionId}
```

The revised proposal has no extra `courses`, `runs`, `boards`, `recordings`, `tutor-history`, or note-version collections. `course` is a string field on a session. A session contains one processed photo and one processed runtime audio recording. Raw audio is temporary request data; no Cloud Storage requirement exists. There is no Board Reader or Explanation ADK agent, and tutor questions are typed text questions only.

Every Firestore path is under `users/{uid}`. The UID comes from verified Firebase authentication, not from a browser field, URL owner field, or agent argument. Browser clients call authenticated `/api` routes and do not read or write Firestore directly. `firestore.rules` denies direct client access at every document path, while the backend Admin SDK performs persistence. Admin SDK calls bypass client rules, so backend ownership checks remain required.

## Session document

Path: `users/{uid}/sessions/{sessionId}`.

| Field | Stored type / default | Meaning |
| --- | --- | --- |
| `title` | nonblank string | User-visible session title. |
| `course` | string; defaults to `General` | Course filter value. |
| `status` | string; initially `draft` | `draft`, `ready`, or `failed`. |
| `errorMessage` | string or null; initially null | Safe build error shown to the user. |
| `needsRebuild` | boolean; initially false | True after replacing input when an earlier build exists. |
| `photo` | map or null; initially null | One processed photo result, below. |
| `audio` | map or null; initially null | One processed runtime recording result, below. |
| `summary` | string or null; initially null | Generated study-set summary. |
| `notes` | array or null; initially null | Generated aligned note maps. |
| `cardCount` | nonnegative integer; initially 0 | Number of saved card documents. |
| `builtAt` | Firestore Timestamp or null | Server time of the successful build. |
| `createdAt` | Firestore Timestamp | Server-controlled creation time. |
| `updatedAt` | Firestore Timestamp | Server-controlled last mutation time. |
| `pickerSessionId` | string or null; server-only | Temporary Google Photos Picker state; never returned to the browser. |

The document ID is returned as API `session.id`; it is not a stored identity field. `sessionStore.js` constructs API objects field by field, so this value and raw image bytes cannot leak to the browser.

### `photo` map

| Field | Stored type | Meaning |
| --- | --- | --- |
| `thumbnail` | Firestore Bytes or null | Bounded JPEG thumbnail. |
| `thumbnailType` | string or null | MIME type paired with `thumbnail`, normally `image/jpeg`. |
| `icon` | Firestore Bytes or null | Small session-list image. |
| `iconType` | string or null | MIME type paired with `icon`. |
| `title` | string | Title extracted from the board photo. |
| `steps` | array of `{ number: integer, text: string }` | Ordered positive-numbered board steps. |
| `unreadable` | array of strings | Content the photo processor could not read. |
| `importedAt` | Firestore Timestamp | Server time the processed photo was saved. |

The full source image, access tokens, download URLs, bounding boxes, and image archives are not stored. The thumbnail remains inside the session document; there is no Cloud Storage bucket or media collection requirement. The pipeline must bound the thumbnail and extracted text and reject an oversized Firestore document before reporting success. Firestore's total document limit is 1 MiB.

### `audio` map

| Field | Stored type | Meaning |
| --- | --- | --- |
| `transcript` | string | Gemini transcription of the runtime recording. |
| `points` | array of `{ kind: string, text: string }` | Tagged spoken points, such as `explanation`, `correction`, or `emphasis`. |
| `durationSeconds` | integer, 0–180 | Browser-reported recording duration, clamped by `audio.js`. |
| `recordedAt` | Firestore Timestamp | Server time the processed result was saved. |

One recording replaces the previous result. Audio bytes, blobs, base64 data, playback URLs, and recording documents are not persisted.

### Notes in `session.notes`

Each generated note is an embedded map:

| Field | Type | Meaning |
| --- | --- | --- |
| `stepNumber` | positive integer | Matching `photo.steps[].number`. |
| `boardText` | string | Photo-derived written text for that step. |
| `explanation` | string or null | Matching spoken explanation. |
| `correction` | string or null | Explicit spoken correction. |

`buildService.js` creates one note per photo step, keeps `boardText` from the photo, and discards model notes for unknown step numbers. Agent-only fields such as `emphasis`, `sourcePointIndexes`, `audioOnly`, and `unresolved` are not stored.

## Card documents

Path: `users/{uid}/sessions/{sessionId}/cards/{cardId}`.

| Field | Stored type / default | Meaning |
| --- | --- | --- |
| `question` | nonblank string | Generated typed review question. |
| `answer` | nonblank string | Answer grounded in the saved material. |
| `stepNumber` | positive integer | Source `photo.steps[].number`. |
| `known` | boolean; false on build | Review state. |
| `createdAt` | Firestore Timestamp | Server time the card was created. |

The API adds `id` from the document ID and serializes `createdAt`. A rebuild deletes old card documents, writes new cards, resets `known` to false, and updates `cardCount` atomically. Deleting one card decrements `cardCount` in the same batch. The generation target is 5–10 cards; the validator accepts 3–12 usable cards. User deletion may leave fewer than three cards.

## Question documents

Path: `users/{uid}/sessions/{sessionId}/questions/{questionId}`.

| Field | Stored type | Meaning |
| --- | --- | --- |
| `question` | nonblank string | Typed tutor question. |
| `answer` | string | Parsed tutor answer. |
| `stepsUsed` | array of positive integers | Validated source steps; `[]` for an uncovered answer. |
| `covered` | boolean | Whether the answer is covered by the request-bound material. |
| `askedAt` | Firestore Timestamp | Server time the history record is written. |

The API adds `id` and serializes `askedAt`. The most recent 20 are returned; there is no separate tutor-history collection. Questions remain after material replacement and are deleted with the parent session.

## Time, bytes, and API representation

Firestore stores timestamps at rest as Firestore Timestamp values, created with Admin SDK server timestamps. The API converts `createdAt`, `updatedAt`, `builtAt`, `photo.importedAt`, `audio.recordedAt`, card `createdAt`, and question `askedAt` to ISO 8601 UTC strings. Firestore Bytes are converted to data URLs for the browser, using adjacent `thumbnailType` or `iconType`; raw Bytes remain server-side.

New sessions use `summary: null` and `notes: null`, while absent `photo` and `audio` are null. The API preserves these values until input or a build supplies results.

## Operations and queries

All operations use references built from the verified UID and owned IDs. No collection-group query across users is needed.

| Operation | Required behavior |
| --- | --- |
| Create | Create a draft with server timestamps and the defaults above. |
| List | Return the user's sessions ordered by `createdAt` descending. |
| Course filter | Equality filter on `course`, then `createdAt` descending. |
| Read | Return the session and its cards. |
| Rename/course update | Update only supplied fields and `updatedAt`. |
| Replace photo/audio | Save one processed result, return to `draft`, clear errors, preserve the other input, and set `needsRebuild` when prior notes exist. |
| Build/rebuild | Generate outside the write, replace cards and generated fields atomically, set `ready`, clear errors, set `builtAt`, and clear `needsRebuild`. |
| Build failure | Persist the safe failed status and message. |
| Unknown-card filter | Query this session's cards with `known == false`; sort cards in application code by `stepNumber`. |
| Tutor/history | Save validated typed questions and query `askedAt` descending with limit 20. |
| Delete | Recursively delete the session and nested cards/questions. |

The required compound index is declared in `firestore.indexes.json` for the `sessions` collection: `course` ascending plus `createdAt` descending. This supports the course equality filter followed by newest-first ordering. The unfiltered session list uses `createdAt` descending; question history uses `askedAt` descending with a limit; card filtering does not add a composite index because sorting is performed after the read.

## Implementation-name mappings

These mappings preserve the proposal vocabulary while documenting the current names:

| Revised proposal concept | Current implementation name/source |
| --- | --- |
| Photo step number | `photo.steps[].number`; generated notes and cards use `stepNumber`. |
| Unreadable photo content | `photo.unreadable`, not `unreadableParts`. |
| Card source step | `cards.stepNumber`, not `cards.step`. |
| Audio length/time | `audio.durationSeconds` and `audio.recordedAt`, not `audio.length`. |
| Successful build time | `session.builtAt`; rebuild invalidation state is `session.needsRebuild`. |
| Stored image data | Firestore Bytes plus `thumbnailType` and `iconType`; API data URLs are derived values. |
| Stored/API times | Firestore Timestamp at rest; ISO strings over the API. |
| Picker state | `pickerSessionId` is server-only and must not be returned to the browser. |
| Session persistence/conversions | [`backend/services/sessionStore.js`](../backend/services/sessionStore.js) |
| Firebase server connection | [`backend/services/firebaseAdmin.js`](../backend/services/firebaseAdmin.js) |
| Session/card routes | [`backend/routes/sessions.js`](../backend/routes/sessions.js) |
| Agent/build/question routes | [`backend/routes/agents.js`](../backend/routes/agents.js) |
| Build validation/generation | [`backend/services/buildService.js`](../backend/services/buildService.js) |
| Runtime audio route | [`backend/routes/audio.js`](../backend/routes/audio.js) |
| Client Firebase initialization | [`frontend/src/services/firebase.js`](../frontend/src/services/firebase.js) |
| Client authentication state | [`frontend/src/hooks/useAuth.js`](../frontend/src/hooks/useAuth.js) |
| Direct-client security policy | [`firestore.rules`](../firestore.rules) |
| Compound index declaration | [`firestore.indexes.json`](../firestore.indexes.json) |

The code-alignment table uses only current source files; no deleted frontend model files are part of this contract.

## Acceptance criteria and remaining work

This document preserves the issue acceptance criteria: exact paths, fields, types, defaults, ownership, security boundaries, timestamp and byte representations, required index, operations, and revised scope are specified above. The implementation-name mappings are explicit and the deleted model files are not referenced as current sources.

Implemented foundations in the current branch are the Admin SDK connection, verified-auth route boundary, user-scoped persistence, recursive deletion, Firestore-deny rules, the course/createdAt index, photo/audio processing patches, build persistence, and API serialization. Remaining work is to deploy and configure the project, verify route mounting/auth integration end to end, add or complete persistence/rules/index tests, and collect live database/runtime evidence. These are deployment, integration, testing, and evidence tasks—not reasons to describe the current code foundations as absent.

One deliberate implementation mismatch remains: the revised proposal's concurrency discussion mentions an `expectedUpdatedAt` precondition, but the current `buildService.js` and `sessionStore.js` build path do not implement that field or stale-build comparison. The current code does perform an owned lookup and atomically commits the generated study set; a later integration change is needed if stale-build rejection is required by the proposal.
