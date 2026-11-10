# Sanitized frontend diagnostics — issue #62

Owner: Huda Joad. Related issue: [#62](https://github.com/dishd123/StudyBoard/issues/62).
Baseline: `01796a8`, after the analytics-plan merge. Scope is frontend diagnostic
metadata and API request correlation. GA4 events remain #59/#60; backend Cloud
Logging and deployed evidence remain #61/#81. No cloud setup is assumed complete.

## Files and activation

- [clientLogger.js](../frontend/src/services/clientLogger.js) exports
  `createClientLogger({ write?, now? })`, returning `apiFailure(operation, error,
  { durationMs? })`.
- [apiClient.js](../frontend/src/services/apiClient.js) accepts an optional
  `diagnostics` instance, classifies paths to fixed labels internally, and
  reports one failure record before rethrowing the original error.

When the real authenticated client is composed (later auth/API integration),
pass the logger explicitly. For composition from the services directory:

```js
import { createApiClient } from './apiClient.js';
import { createClientLogger } from './clientLogger.js';

const diagnostics = createClientLogger();
const api = createApiClient({
  getIdToken: async () => auth.currentUser?.getIdToken() ?? null,
  diagnostics
});
```

`auth` above is the future Firebase Auth instance, not a new mock user or a
dependency added by this issue. Components continue to display the API client's
safe `error.message` using `StatusMessage`. The logger neither replaces that
message nor decides whether a retry or authenticated operation is allowed.

Without `diagnostics`, API requests retain the original silent behavior. The
current fixture App does not call the API, so normal sample interactions do not
produce invented API failure records. No automatic global error listeners,
network exporter, local storage, or console interception are installed.

## Record contract

The default writer prints a static label plus JSON through `console.warn`;
caller cancellation uses `console.info`. A custom writer receives a frozen
record. The logger returns that record, or null if constructing/writing it
fails. Throwing/rejecting writers and hooks are contained, with no recursive
logging or unhandled rejection.

| Field | Allowed content |
| --- | --- |
| `severity` | `WARNING`, or `INFO` for `ABORTED`. |
| `event` | Fixed `frontend_api_failure`. |
| `timestamp` | Generated ISO UTC timestamp from the browser clock. |
| `operation` | Fixed label below; unrecognized input becomes `unknown`. |
| `code` | Known API-client code; unrecognized input becomes `UNKNOWN_ERROR`. |
| `category` | `validation`, `auth`, `access`, `prerequisite`, `rate_limit`, `network`, `service`, `cancelled`, or `unknown`. |
| `status` | Integer HTTP status 100–599, or 0 when absent/invalid. |
| `requestId` | Canonical lowercase UUID v4, or null. |
| `retryable` | Boolean true only when the error explicitly supplies true. |
| `durationMs` | Rounded finite nonnegative elapsed milliseconds, or null. |

Route classification produces only `session_list`, `session_create`,
`session_read`, `session_rename`, `session_delete`, `cards_list`, `card_update`,
`card_delete`, `photos_picker`, `photo_import`, `audio_submit`, `study_build`,
`tutor_question`, `question_history`, `agent_check`, or `unknown`. Paths and
query values are used to select a label but are never sent to the logger.

Known codes are the API client's `INVALID_REQUEST`, `VALIDATION_ERROR`,
`UNAUTHENTICATED`, `AUTH_TOKEN_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, `REQUEST_TIMEOUT`, `NETWORK_ERROR`, `SERVER_ERROR`, `HTTP_ERROR`,
`INVALID_RESPONSE`, and `ABORTED`.

The logger reads only own scalar metadata fields, not Error messages/stacks or
arbitrary enumerable properties. It constructs the record field-by-field;
there is no object spread, generic recursive error serializer, or substring
redactor that can accidentally retain new application fields. Getters are not
invoked to obtain error metadata; hostile descriptor/proxy failures are contained.

No photo/audio, thumbnail, filename, title, course, notes, OCR, transcript,
question/answer, student identity, token, credential, request/response body,
raw URL, headers, raw message, or stack is emitted. A UUID request ID is the
only correlation identifier. There is no GA4 UID/client-ID mapping here.

## Correlation and limitations

`apiClient` generates `X-Request-ID` with `crypto.randomUUID()`. On a response,
the server's `X-Request-ID` takes precedence in the API error as before.
Diagnostics records that ID only if it conforms to UUID v4, normalized lowercase.
It does not invent a replacement ID and imply that the server logged it.

Issue #61/server middleware must validate/use that same convention and include
the canonical value in backend log records and the response header. A developer
can then match the browser's `requestId` to the backend request. Legacy/example
IDs such as `server-request`, missing IDs, or arbitrary header text produce null
in diagnostics while the API error itself remains unchanged. Actual deployed
cross-layer correlation is not verified until those backend logs exist.

`durationMs` covers the client's failed request, including token acquisition,
network wait, and response handling. It is not a backend model duration. The
timestamp is browser time and may have clock skew. These records stay in the
local console; they are not automatically uploaded to Cloud Logging, stored
in Firestore, or sent as GA4 events. No browser Google Cloud credentials are used.
Vite may mirror console messages into its local development terminal; that is
not evidence of Express logging or a deployed Cloud Logging correlation.

## Controlled manual browser check

Start `npm run dev` from the repository root. Open `/app/`, then DevTools Console.
The following uses an injected transport and synthetic data; it calls no real
backend. It should emit one warning with safe metadata, without the synthetic
token/body/course appearing in that warning:

```js
const { createClientLogger } = await import('/src/services/clientLogger.js');
const { createApiClient } = await import('/src/services/apiClient.js');
const demoApi = createApiClient({
  getIdToken: async () => 'SYNTHETIC_TOKEN_NOT_LOGGED',
  createRequestId: () => 'd9428888-122b-4b57-8b05-66ac149d5a11',
  diagnostics: createClientLogger(),
  fetchImpl: async () => new Response('SYNTHETIC_BODY_NOT_LOGGED', {
    status: 503,
    headers: { 'X-Request-ID': 'e8cf5f46-8666-4a40-8f41-c6dfe89924e9' }
  })
});
await demoApi.get('/api/sessions?course=SYNTHETIC_COURSE_NOT_LOGGED')
  .catch(error => ({ code: error.code, message: error.message }));
```

The return value should retain `SERVER_ERROR` and the understandable message
"The service could not complete the request. Try again." The warning's
operation is `session_list`, status 503, category `service`, and request ID
`e8cf5f46-8666-4a40-8f41-c6dfe89924e9`. This is reproducible synthetic evidence,
not an observed outage or a Cloud Logging record. `/src/` imports here are for
the Vite development server, not the production preview.

## Verification — November 10, 2026 (America/Los_Angeles)

Codex ran temporary implementation checks outside the repository, preserving
the separation from the later committed logging test/evidence work in #81.

| Check | Result |
| --- | --- |
| `npm run test:frontend` | Passed: existing 107 tests across 10 files. |
| `npm run build` | Passed; both React entries and static pages remain buildable. |
| Fixed record schema/privacy | 45 synthetic records contained only the ten allowlisted fields; private-field markers were excluded. |
| Route/method integration | 16 cases classified safely, including unknown routes; one failure record per attempt. |
| Request correlation and messages | Valid server UUID retained; invalid metadata excluded; original API message/error preserved. |
| Failure containment | Throwing/rejecting writers, clocks, hooks, and hostile metadata did not replace the original error or cause unhandled rejection. |
| Success, validation, and cancellation | Success emitted no failure; invalid input did not fetch; cancelled request used informational severity and did not fetch. |
| Chrome console | Controlled warning/info records, redaction, request-ID match, and unchanged safe message verified with injected transport; no actual API requests or browser runtime errors. |
| Whitespace and local links | Checked before PR handoff. |
| Actual backend/Cloud Logging correlation | Pending #61/#81; not claimed by this issue. |

Huda owns this implementation and its dedicated PR with `Closes #62`. Capture
any real client/backend correlation evidence later with the actual deployed
request; label controlled console checks accurately.
