# Frontend services

Huda owns the initial service boundary. `apiClient.js` provides the common
same-origin `/api` request helper under issue #4. Feature components must use
the client for backend calls rather than calling `fetch` directly.

`createApiClient({ getIdToken })` takes an async token provider, so it can be
verified before Firebase exists. The authentication integration will create
and distribute the authenticated client; the default provider fails closed.
The fixture preview does not call the unimplemented backend.

See [API client usage and error contract](../../../docs/api-client.md) for JSON,
audio upload, Photos-token scope, request IDs, cancellation, and retry behavior.

Disha will own Photos authorization; Huda will own Firebase, analytics, and
frontend diagnostics services. Each integration stays in its assigned issue.

Issue #62 adds `createClientLogger()` in `clientLogger.js`. Pass the logger as
`diagnostics` when composing the API client to record sanitized failures in
the browser console. Logging is opt-in; the current fixture App creates no real
API client. It uses fixed operation/code labels and optional UUID request IDs,
never paths, payloads, tokens, or raw errors. See
[frontend diagnostics usage and evidence](../../../docs/frontend-diagnostics.md).
