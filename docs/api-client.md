# Frontend API client — issue #4

Owner: Huda Joad. Related issue: [#4](https://github.com/dishd123/StudyBoard/issues/4).
Implementation: `src/services/apiClient.js`.

## Authentication boundary

The client exports `createApiClient` and `ApiError`. It has no Firebase import,
backend dependency, or external base URL. The later authentication integration
creates one client with an async `getIdToken` provider and supplies it to feature
code. The provider is awaited for every request; tokens are not cached or stored
by the client. An unconfigured client rejects protected calls before fetching.

Example for the later Firebase integration (not connected by this issue):

```js
import { createApiClient } from './apiClient.js';

const api = createApiClient({
  getIdToken: async () => auth.currentUser?.getIdToken() ?? null
});
```

Every request sends `Authorization: Bearer <Firebase ID token>` and
`X-Request-ID`. Caller headers cannot override either or directly set
`X-Photos-Token`. Relative `/api` paths are required; external/protocol-relative
URLs, backslashes, fragments, and path traversal outside `/api` are rejected.
Redirects are rejected so these credentials cannot follow an API redirect.
These transport checks do not replace backend token verification/ownership.

## Requests and responses

```js
const sessions = await api.get('/api/sessions?course=Web%20Systems');

const session = await api.post('/api/sessions', {
  json: { title: 'HTTP and APIs', course: 'Web Systems' }
});

await api.patch(`/api/sessions/${encodeURIComponent(session.id)}`, {
  json: { title: 'HTTP review' }
});

await api.delete(`/api/sessions/${encodeURIComponent(session.id)}`);
```

All methods take a path and an **options object**. JSON belongs in `json`;
`body` is reserved for a fetch-compatible raw body such as FormData or Blob.
Passing both is rejected, as is a GET body. Successful JSON is parsed and
returned; a 204/205 or empty successful body returns `null`. Invalid successful
JSON becomes `INVALID_RESPONSE`. The client does not invent session data.

The underlying `request` method also accepts `method`; method helpers select
their own GET/POST/PATCH/DELETE method. Headers, AbortSignal, and per-import
Photos token can be supplied through the options object. Fetch implementation
and request-ID generation can be injected for offline verification.

## Photos and audio

```js
// Photos access token is obtained fresh for this import, separately from Firebase.
await api.post(`/api/sessions/${encodeURIComponent(session.id)}/picker`, {
  photosToken: currentImportToken
});
await api.post(`/api/sessions/${encodeURIComponent(session.id)}/photo`, {
  photosToken: currentImportToken
});

// Field name must match the eventual audio route; this shows the transport only.
const form = new FormData();
form.append('audio', recordingBlob, 'explanation.webm');
await api.post(`/api/sessions/${encodeURIComponent(session.id)}/audio`, {
  body: form
});
```

`photosToken` is accepted only for POST `/api/sessions/:sid/picker` and
POST `/api/sessions/:sid/photo`, with an optional trailing slash. Supplying it
on an unrelated route/method rejects the request before fetching. It is not
cached for later calls. Disha's integration will own the fresh popup token and
drop it after import. This helper does not persist tokens, open a Picker, or
implement OAuth refresh/polling.

FormData is passed through without a manually set Content-Type; the browser
generates its multipart boundary. Audio acquisition, MIME/size checks, processing,
and cleanup remain in their assigned frontend/backend issues.

## Error and retry contract

Every expected request failure is an `ApiError` with `message`, `code`, `status`,
`requestId`, and `retryable`. Status is zero when there is no HTTP response.
The server's `X-Request-ID` takes precedence if present; otherwise the generated
client ID is retained. Raw server response bodies and underlying exception
messages are not exposed to the UI or logged by this module.

| Condition | Code | Retryable |
| --- | --- | --- |
| Invalid path/options, HTTP 400 | `INVALID_REQUEST` | No; fix input/options. |
| Missing token or HTTP 401 | `UNAUTHENTICATED` | No; sign in first. |
| Token provider throws | `AUTH_TOKEN_ERROR` | No; restore authentication first. |
| HTTP 403 | `FORBIDDEN` | No. |
| HTTP 404 | `NOT_FOUND` | No. |
| HTTP 408 | `REQUEST_TIMEOUT` | Yes. |
| HTTP 409 | `CONFLICT` | Yes, after completing the prerequisite (for example picking a photo). |
| HTTP 422 | `VALIDATION_ERROR` | No; correct the input. |
| HTTP 429 | `RATE_LIMITED` | Yes, after waiting. |
| HTTP 5xx | `SERVER_ERROR` | Yes. |
| Other non-success HTTP response | `HTTP_ERROR` | No. |
| Invalid successful JSON | `INVALID_RESPONSE` | No. |
| Fetch/transport failure | `NETWORK_ERROR` | Yes. |
| Caller cancellation | `ABORTED` | No automatic retry. |

`retryable` means the UI can offer another attempt after the cause is addressed;
it does not prove an earlier mutation failed or make replay idempotent. There
are **no automatic retries**. In particular, uploads, builds, and tutor requests
must not be silently replayed after an ambiguous failure.

```js
const controller = new AbortController();
try {
  const result = await api.get('/api/sessions', { signal: controller.signal });
  // The caller owns loading/success state and result rendering.
} catch (error) {
  if (error instanceof ApiError && error.code !== 'ABORTED') {
    // Pass error.message to StatusMessage; offer retry only when appropriate.
    // A 401 requires sign-in; a 403 does not grant access by retrying.
  }
} finally {
  // The caller clears its loading state.
}
// Call controller.abort() when navigation or teardown cancels the operation.
```

StatusMessage is issue #5. Firebase wiring is #25–30; real API usage starts with
the later backend integrations. The fixture UI stays local for now, so there is
no new visual feature or live network call to verify in `/app/` for this issue.

## Optional diagnostics — issue #62

`createApiClient` accepts `diagnostics: createClientLogger()`. When supplied,
each failed request reports one fixed operation label, the normalized error
metadata, and elapsed time. The original error is rethrown unchanged. Successful
requests do not emit failure records, and omitting diagnostics preserves the
original silent behavior. No failure automatically retries.

The logger accepts only UUID v4 request IDs for console correlation. Existing
API error normalization still preserves the server's request ID; nonconforming
IDs are omitted from diagnostics rather than copied as arbitrary text. Backend
logging must use the same UUID convention for actual cross-layer correlation.

See [frontend diagnostics](frontend-diagnostics.md) for composition, record
fields, a controlled browser check, and implementation evidence. This helper
does not give browsers Cloud Logging access or collect GA4 events.

## Acceptance and verification

| Issue #4 requirement | Implementation |
| --- | --- |
| No direct fetch from feature components | Only this service references `fetch`; the current fixture components make no requests. |
| Firebase token support | Injected async provider; fresh Bearer token per request, fail closed when missing. |
| Normalized HTTP errors | `ApiError` codes/status/messages for 401, 403, 404, 409, 500 and other documented cases. |
| Caller-controlled loading/retry | Promise result, cancellation signal, error fields, and no implicit replay. |
| Photos tokens stay on import calls | Explicit per-request option, exact POST endpoint matching, protected headers, no cache. |
| Request IDs | Generated request header; server response ID preferred on errors. |

### Verification results

Codex ran mock checks on November 8, 2026 using Node `v22.23.2` and built the
existing frontend. No live Firebase, Photos, or backend service was called.

| Check | Result |
| --- | --- |
| JSON GET/POST/PATCH | Passed; payload serialization and fresh Firebase token per call verified. |
| DELETE/empty response | Passed; returns null for 204 and empty successful bodies. |
| HTTP 400/401/403/404/408/409/422/429/500/503 and fallback | Passed; expected codes, status, and retryability. |
| Error privacy and request IDs | Passed; raw server text excluded and server correlation ID retained. |
| Invalid paths/options | Passed; external URLs, paths outside API, traversal outside API, fragments, invalid JSON options, and reserved-header overrides rejected before fetch. |
| Photos-token boundary | Passed for both allowed POST endpoints; unrelated endpoints, GET, lookalike routes, and manual header injection rejected. |
| Token carry-over | None; a later sessions request has no Photos header. |
| FormData | Passed through unchanged without a manually forced multipart Content-Type. |
| Missing/failed/malformed authentication | Passed; normalized auth errors without exposing provider details. |
| Invalid successful JSON/network failure | Passed; INVALID_RESPONSE and NETWORK_ERROR respectively. |
| Cancellation | Passed before fetching, during token acquisition, and for transport AbortError. |
| Automatic retries | None; individual failed requests made one fetch attempt. |
| Syntax and production build | Passed; existing App and Login build outputs remain intact. |
| Whitespace/source boundary checks | Passed; feature components have no direct fetch calls. |

These were one-off mock checks for implementation verification. Dedicated
persisted frontend test files remain under issue #12. No dependency, lockfile,
UI, authentication configuration, or backend changes were required. Issue #4
is ready for review in its own PR with `Closes #4`.
