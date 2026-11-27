# Google Database

## 1. Database choice and deployment

StudyBoard uses **Cloud Firestore in Native mode**. The backend uses the
Firebase Admin SDK and stores data in the Google Cloud project configured by
`GOOGLE_CLOUD_PROJECT`. The application does not require a Cloud Storage bucket:
the revised scope stores one bounded processed photo inside the session and
does not store raw audio.

The deployed architecture has one Express service on Cloud Run. The browser
calls authenticated `/api` routes; the backend performs Firestore reads and
writes with the Admin SDK.

> **Disha action required — live project confirmation**
>
> Confirm the actual project and database from the project-owner account. Add
> the output or a redacted screenshot here. Do not include credentials, tokens,
> secret values, email addresses, or private student material.
>
> ```bash
> gcloud firestore databases list \
>   --project gen-lang-client-0800605818
> ```
>
> Confirm that a Firestore Native database exists, normally `(default)`, and
> record the verification date: `TODO — Disha: YYYY-MM-DD`.

## 2. Security and ownership

All persisted paths are beneath the authenticated user's UID:

```text
users/{uid}/sessions/{sessionId}
users/{uid}/sessions/{sessionId}/cards/{cardId}
users/{uid}/sessions/{sessionId}/questions/{questionId}
```

The UID is obtained from a verified Firebase ID token by backend authentication
middleware. It is not accepted from a browser body, URL owner field, or agent
argument. `sessionStore.js` constructs every Firestore path from that verified
UID and the requested session/card IDs.

Browser clients do not directly read or write Firestore. [`firestore.rules`](../firestore.rules)
denies reads and writes at every document depth. The backend Admin SDK performs
persistence, so backend ownership checks remain necessary because Admin SDK
calls bypass client security rules.

The server also validates path IDs and rejects values that could introduce a
path separator. A session read is performed before operations on its cards or
questions, and recursive deletion removes nested documents with the session.

## 3. Stored data structure

### Session document

Path:

```text
users/{uid}/sessions/{sessionId}
```

The session stores:

| Field | Meaning |
| --- | --- |
| `title` | User-visible session title. |
| `course` | Course string used by the course filter; defaults to `General`. |
| `status` | `draft`, `ready`, or `failed`. |
| `errorMessage` | Safe build error or null. |
| `needsRebuild` | Whether replacement input made an earlier build stale. |
| `photo` | One processed photo map or null. |
| `audio` | One processed runtime recording map or null. |
| `summary` | Generated study-set summary or null. |
| `notes` | Generated aligned note maps or null. |
| `cardCount` | Number of saved card documents. |
| `builtAt` | Firestore Timestamp for the successful build or null. |
| `createdAt` | Firestore Timestamp set by the server. |
| `updatedAt` | Firestore Timestamp set by the server. |
| `pickerSessionId` | Temporary server-only Google Photos state; never returned to the browser. |

The photo map contains `thumbnail` and `icon` as Firestore Bytes with adjacent
`thumbnailType` and `iconType` MIME fields, plus `title`, `steps`, `unreadable`,
and `importedAt`. Each step is `{ number, text }`.

The audio map contains `transcript`, tagged `points`, `durationSeconds`, and
`recordedAt`. Audio bytes are never persisted.

Generated notes use `stepNumber`, `boardText`, `explanation`, and `correction`.
Generated cards are separate documents rather than an array inside the session.

### Card documents

Path:

```text
users/{uid}/sessions/{sessionId}/cards/{cardId}
```

Each card stores:

| Field | Meaning |
| --- | --- |
| `question` | Generated review question. |
| `answer` | Material-grounded answer. |
| `stepNumber` | Source photo step. |
| `known` | Review state; new/rebuilt cards start false. |
| `createdAt` | Firestore Timestamp. |

The API adds the document ID as `id`. Rebuild replaces old cards atomically,
resets their known state, and updates the session's `cardCount`.

### Question documents

Path:

```text
users/{uid}/sessions/{sessionId}/questions/{questionId}
```

Each typed tutor question stores:

| Field | Meaning |
| --- | --- |
| `question` | User's typed question. |
| `answer` | Parsed tutor answer. |
| `stepsUsed` | Validated source step numbers; empty for uncovered material. |
| `covered` | Whether the saved material covered the answer. |
| `askedAt` | Firestore Timestamp. |

There is no separate tutor-history collection. The latest 20 questions are
returned from this subcollection.

## 4. Database operations

### Add

Creating a session writes a draft document with server-controlled timestamps
and empty/null input and build fields. Saving a processed photo or runtime
recording updates the same session. The application stores only the processed
photo/audio result; raw media is temporary.

### Update

The API can update the session title or course. Replacing a photo or recording
returns the session to `draft` and sets `needsRebuild` when earlier notes exist.
Successful builds write summary/notes, replace cards, update `cardCount`, set
`ready`, set `builtAt`, clear errors, and clear `needsRebuild`.

Marking a card known updates only that card's `known` field. Asking a typed
tutor question adds one question document.

### Remove

Deleting a card and decrementing `cardCount` occur in one batch. Deleting a
session uses Admin SDK recursive deletion because deleting only a parent
document does not remove its subcollections. Nested cards and questions are
therefore removed with the session.

> **Disha action required — live add/update/remove evidence**
>
> Add redacted screenshots or a short dated evidence record showing:
>
> 1. A session before and after creation.
> 2. A title/course update.
> 3. A built session with cards.
> 4. A card `known` update.
> 5. A card deletion and changed `cardCount`.
> 6. A saved typed question.
> 7. Session deletion with nested cards/questions removed.
>
> Evidence date: `TODO — Disha: YYYY-MM-DD`.

## 5. Queries and indexes

### Sessions by course and creation time

The session list uses newest-first creation time. A course-filtered list adds an
equality filter:

```text
where course == selectedCourse
orderBy createdAt descending
```

The required composite index is in [`firestore.indexes.json`](../firestore.indexes.json):

```text
course ascending + createdAt descending
```

### Unknown cards

The unknown-card view queries the current session's cards with:

```text
where known == false
```

The backend sorts the returned cards by `stepNumber` in application code, so
this filter does not require another composite index.

### Recent tutor questions

The history view queries:

```text
orderBy askedAt descending
limit 20
```

The limit applies to the returned history window, not to the number of stored
question documents.

> **Disha action required — query evidence**
>
> Add redacted evidence for the course query, unknown-card query, and recent
> question query. Include the verification date and indicate whether each
> screenshot is from the Firestore Console, Cloud Logging, or the application.
>
> Evidence date/source: `TODO — Disha: YYYY-MM-DD / source`.

## 6. Timestamp and image representation

Firestore stores timestamps at rest as Firestore Timestamp values. The API
serializes them as ISO 8601 UTC strings. This applies to session, photo, audio,
card, and question timestamps.

Images are stored as Firestore Bytes with `thumbnailType` or `iconType`. The
backend converts them to browser data URLs in API responses. Raw Bytes and the
server-only `pickerSessionId` are not returned to the browser.

## 7. Evidence and limitations

The repository source establishes the schema, ownership checks, rules, index,
and persistence operations. Source inspection alone does not prove that the
deployed project has a database, that a Cloud Run runtime identity has the
required permissions, or that a live operation succeeded.

> **Disha action required — deployment/access evidence**
>
> Complete this section with:
>
> - Firestore Native database existence and database ID.
> - Cloud Run service name and region.
> - Confirmation that the runtime service account can access Firestore.
> - Redacted screenshots for the required operations and queries.
> - Dates for all live evidence.
>
> Do not include secret values, access tokens, private keys, or unredacted
> personal data.

## 8. Source references

- [`docs/firestore-schema.md`](firestore-schema.md) — revised schema contract.
- [`backend/services/sessionStore.js`](../backend/services/sessionStore.js) — Firestore paths, persistence, conversions, and queries.
- [`backend/services/firebaseAdmin.js`](../backend/services/firebaseAdmin.js) — Admin SDK and Firestore connection.
- [`backend/routes/sessions.js`](../backend/routes/sessions.js) — session/card HTTP routes.
- [`backend/routes/agents.js`](../backend/routes/agents.js) — typed tutor-question routes.
- [`firestore.rules`](../firestore.rules) — direct-client deny policy.
- [`firestore.indexes.json`](../firestore.indexes.json) — course/createdAt composite index.
