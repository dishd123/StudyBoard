# Audio upload and replacement — issue #45

`backend/routes/audio.js` exports `createAudioRouter`. It implements
`POST /api/sessions/:sid/audio` using Express and Multer memory storage, then calls
the existing [direct Gemini service](gemini-audio-service.md). It does not create
an application server or connect the frontend.

## Request

The caller must send a Firebase ID token through the shared authentication
middleware. That middleware must verify the token and set `req.user.uid` before
this router runs. The route never derives identity from multipart fields, a raw
token, or a user-supplied UID header. Missing identity returns 401. It checks the
owned session before parsing or buffering the upload; inaccessible and missing
sessions both return 404.

Use `multipart/form-data` with these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `audio` | Yes | Exactly one nonempty recorded audio file, at most 10,485,760 bytes (10 MiB, the route's 10 MB limit). |
| `durationSeconds` | No | One decimal number in seconds, from 0 through 180, including fractional seconds. |

Other fields, repeated fields, additional files, and malformed multipart bodies
are rejected. The client must let its HTTP library supply the multipart boundary.
The optional text field is limited to 64 bytes.

Supported MIME types are `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`,
`audio/x-wav`, `audio/mpeg`, `audio/aac`, `audio/flac`, `audio/mp3`, `audio/m4a`,
and `audio/aiff`. `audio/x-wav` is normalized to `audio/wav`; codec parameters are
removed before the service call. File extensions are not used for acceptance.

The MIME check validates the declared type, not the entire media bitstream.
Gemini must be able to decode the supplied bytes. There is no media decoder or
transcoder in this issue. Duration metadata is range-checked but is not proof of
the recording's actual length. When supplied, it has the existing service's
documented precedence over the model estimate. Without it, the service checks
the model's estimated length against the same 180-second maximum.

## Mounting and persistence boundary

There is no shared Express app, Firebase middleware, or Firestore session helper
on this branch. A future app can mount the router at its root after verified
authentication:

```js
import { createAudioRouter } from './routes/audio.js';

app.use(verifyFirebaseIdToken);
app.use(createAudioRouter({ getOwnedSession, saveAudioResult }));
```

The auth function and persistence helpers in this example are dependencies to
be supplied by the shared backend work, not implementations added here. Mount
at the application root because the router already includes the `/api` prefix.
Factory creation fails if either persistence helper is absent. There is no
in-memory fallback or unauthenticated default.

| Helper | Contract |
| --- | --- |
| `getOwnedSession({ uid, sid })` | Return the authenticated user's session, including `id === sid`, or null when missing/inaccessible. Scope the lookup using the verified UID; never return another user's session. |
| `saveAudioResult({ uid, sid, sessionUpdate, invalidateGeneratedMaterial })` | Recheck session ownership/existence and atomically commit the update plus generated-material invalidation. Resolve `true` only after a successful commit, `false` if the session is no longer accessible, and throw on persistence failure. |

The save must apply only the supplied session patch, retaining the photo and
unrelated session metadata. The patch contains:

```js
{
  audio: { transcript, points, length },
  status: 'draft',
  errorMessage: null,
  summary: '',
  notes: [],
  cardCount: 0,
  updatedAt: 'ISO 8601 UTC timestamp'
}
```

`invalidateGeneratedMaterial` is always `true`, for initial audio and replacement.
The persistence adapter must invalidate/remove the old generated cards and their
known marks along with this patch before acknowledging success. Merely setting
`cardCount` to zero is insufficient. Shared persistence/pipeline code must also
prevent an older build from committing stale material after this replacement.
No Firestore or card-deletion implementation is added here. Lookup, processing,
or save failure must leave the previous committed audio and study material
intact; the adapter is responsible for transactional failure behavior.

## Processing, response, and cleanup

The default analyzer is `analyzeAudio` from Issue #44. The router also runs that
service's exported `validateAudioResult` on the return value, including when an
analyzer is injected for tests. No Gemini request or schema logic is duplicated.

Successful upload/replacement returns HTTP 200:

```json
{
  "session": {
    "id": "session-id",
    "audio": {
      "transcript": "The speaker's explanation...",
      "points": [{ "text": "An explicitly spoken correction.", "kind": "correction" }],
      "length": 12.5
    },
    "status": "draft",
    "errorMessage": null,
    "summary": "",
    "notes": [],
    "cardCount": 0,
    "updatedAt": "2026-11-09T12:00:00.000Z"
  },
  "rebuildRequired": true
}
```

`session` is the updated material state, not a full session document. Success
does not generate study material or mark the session ready. It is sent only after
the persistence adapter confirms the atomic save/invalidation.

Audio is buffered in RAM only. After processing, the router zeroes the accessible
upload buffer and deletes `req.file` before calling persistence. A final cleanup
also handles validation, processing, and persistence failures; Multer releases
its partially accepted files on parser errors. The router writes no temporary
files, retains no recording archive, and logs no audio, base64, provider errors,
or credentials. Only the validated structured audio result crosses the save
boundary or appears in a successful response.

Errors use `{ "error": { "code": "...", "message": "safe text" } }`:

| Status | Codes |
| --- | --- |
| 400 | `INVALID_SESSION_ID`, `MISSING_AUDIO`, `EMPTY_AUDIO`, `INVALID_DURATION`, `INVALID_UPLOAD` |
| 401 | `UNAUTHENTICATED` |
| 404 | `SESSION_NOT_FOUND` (also covers access lost before commit) |
| 413 | `AUDIO_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 500 | `SESSION_LOOKUP_FAILED`, `PERSISTENCE_FAILED`, `AUDIO_UPLOAD_FAILED` |
| 502 | `AUDIO_PROCESSING_FAILED`, `INVALID_AUDIO_RESULT` |
| 503 | `AUDIO_SERVICE_UNAVAILABLE` (missing Gemini configuration) |

## Verification

Install dependencies with `npm install --prefix backend`. Only Express `5.3.0`
and Multer `2.5.0` are added for this issue. `npm run check --prefix backend`
syntax-checks the service, route, and existing live-verification utility.

One-off Node HTTP checks with mocked dependencies exercised 51 requests: missing
auth, cross-user/missing sessions, failed ownership lookups, missing/empty/wrong
type/multiple files, malformed multipart data, invalid/duplicate duration, exact
10 MiB acceptance and overflow rejection, all supported MIME types, successful
replacement/invalidation, failed persistence, access lost before commit, invalid
service results, and safe provider failures. Checks confirmed that failures
preserved prior material, successful replacement retained the photo, and upload
buffers were cleared before persistence and released after completion. The
default production analyzer's missing-key path was also checked. No live Gemini
request, Firebase connection, or disk recording was used. The full persisted
test suite remains in Issue #73.
