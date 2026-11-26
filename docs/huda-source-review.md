# Huda-owned source review

## Scope

This review supports [issue #97](https://github.com/dishd123/StudyBoard/issues/97).
It records the current source on `main` associated with Huda's frontend,
authentication, API-client, diagnostics, analytics, and documentation work. The
mapping describes issue responsibility and current behavior; it does not claim
that Huda authored every current line. Later integration commits may have
rewritten or combined the original issue implementation.

This review is source evidence only. It does not claim live Firebase,
Firestore, GA4, Cloud Run, cross-browser, or instructor-access verification.
Those checks belong to the applicable testing and evidence issues.

## Source-to-issue traceability

| Current source on `main` | Related issue(s) | Current responsibility |
| --- | --- | --- |
| [`frontend/src/services/apiClient.js`](../frontend/src/services/apiClient.js) | [#4](https://github.com/dishd123/StudyBoard/issues/4) | Central browser API client; supplies an ID token for protected requests, normalizes JSON responses, and exposes consistent API errors. |
| [`frontend/src/services/firebase.js`](../frontend/src/services/firebase.js) | [#25](https://github.com/dishd123/StudyBoard/issues/25) | Initializes the Firebase web app, Firebase Authentication, and optional Analytics using the public web configuration. |
| [`frontend/src/hooks/useAuth.js`](../frontend/src/hooks/useAuth.js) | [#26](https://github.com/dishd123/StudyBoard/issues/26) | Tracks Firebase auth state and provides Google/email sign-in, account creation, password reset, sign-out, provider detection, and safe auth messages. |
| [`frontend/src/login/main.jsx`](../frontend/src/login/main.jsx) | [#27](https://github.com/dishd123/StudyBoard/issues/27) | Mounts the sign-in/account-creation page and connects the authentication actions to the login UI. |
| [`frontend/src/SiteNav.jsx`](../frontend/src/SiteNav.jsx) | [#28](https://github.com/dishd123/StudyBoard/issues/28) | Shared navigation for the retained public pages and the authenticated app entry point. |
| [`frontend/src/services/analytics.js`](../frontend/src/services/analytics.js) | [#59](https://github.com/dishd123/StudyBoard/issues/59) | Client-side event helpers and Firebase Analytics user/event coordination. |
| [`frontend/src/services/clientLogger.js`](../frontend/src/services/clientLogger.js) | [#62](https://github.com/dishd123/StudyBoard/issues/62) | Sanitized client diagnostic metadata for API failures and request timing; it excludes tokens, raw response data, and student material. |
| [`frontend/src/components/StatusMessage.jsx`](../frontend/src/components/StatusMessage.jsx) | [#5](https://github.com/dishd123/StudyBoard/issues/5) | Reusable status presentation for loading, success, empty, validation, service, and retryable error states. |
| [`frontend/src/pages/Dashboard.jsx`](../frontend/src/pages/Dashboard.jsx) | [#6](https://github.com/dishd123/StudyBoard/issues/6), [#36](https://github.com/dishd123/StudyBoard/issues/36) | Dashboard/session-list composition, course filtering, session selection, dialogs, and API-backed session actions. |
| [`frontend/src/components/SessionCard.jsx`](../frontend/src/components/SessionCard.jsx) | [#6](https://github.com/dishd123/StudyBoard/issues/6) | Renders a session summary, status, course, creation time, thumbnail/icon, and card count. |
| [`frontend/src/components/MaterialTab.jsx`](../frontend/src/components/MaterialTab.jsx) | [#7](https://github.com/dishd123/StudyBoard/issues/7), [#54](https://github.com/dishd123/StudyBoard/issues/54) | Presents the saved photo and recording, input replacement actions, build prerequisites, and build/rebuild state. |
| [`frontend/src/components/NotesTab.jsx`](../frontend/src/components/NotesTab.jsx) | [#8](https://github.com/dishd123/StudyBoard/issues/8), [#55](https://github.com/dishd123/StudyBoard/issues/55) | Displays the generated summary and aligned notes while preserving board text and spoken corrections. |
| [`frontend/src/components/StudyTab.jsx`](../frontend/src/components/StudyTab.jsx) | [#9](https://github.com/dishd123/StudyBoard/issues/9), [#56](https://github.com/dishd123/StudyBoard/issues/56) | Composes flashcard review and the typed tutor panel. |
| [`frontend/src/app/main.jsx`](../frontend/src/app/main.jsx) | [#15](https://github.com/dishd123/StudyBoard/issues/15), [#159](https://github.com/dishd123/StudyBoard/issues/159) | Current `/app/` entry point for the relocated frontend package. |
| [`docs/firestore-schema.md`](firestore-schema.md) | [#31](https://github.com/dishd123/StudyBoard/issues/31) | Current Firestore paths, field names, security model, timestamp/byte representations, index, scope, and implementation mappings. |

The frontend workspace and root commands are documented in
[`docs/frontend-layout.md`](frontend-layout.md) and
[`docs/frontend-structure.md`](frontend-structure.md). Earlier preparation and
acceptance records are preserved in the issue-specific documents for the audit,
API client, dashboard, tabs, navigation, state plan, analytics, diagnostics,
and Firestore schema.

## Authentication and API boundary

The browser initializes Firebase Authentication in `firebase.js`; `useAuth.js`
reacts to Firebase's verified client session and supplies the UI with the
current user/loading state. Protected API calls are made through
`apiClient.js`, which obtains a current ID token from its configured provider
for each request. The browser does not choose a Firestore owner or directly
read/write Firestore.

The backend verifies the token and derives `req.uid`; current persistence paths
are built beneath `users/{uid}`. This is an integration boundary shared with
the backend owners' authentication, Admin SDK, route, and persistence work. The
frontend source review therefore records the client side of the boundary and
does not claim to replace backend authorization tests.

## Client diagnostics and analytics

`clientLogger.js` creates fixed operation metadata for failed API calls and
optional durations. It must not include authorization headers, tokens, raw
response bodies, secret-bearing URLs, or student material. `analytics.js`
provides the client event surface and delegates supported events to Firebase
Analytics when available; analytics failure must not prevent the application
from loading.

The client code alone does not prove that GA4 received an event. Secret
Manager, server-side Measurement Protocol delivery, Cloud Logging, deployment,
and report-ingestion evidence remain separate infrastructure/integration work.

## Dashboard and session UI

The dashboard and workspace components render API-backed session data while
retaining the issue-era state and feedback boundaries. Session actions include
create, rename/course update, delete, select, course filter, and refresh. The
Material, Notes, and Study tabs represent the one-photo/one-recording scope and
surface draft, ready, failed, rebuild, and empty states returned by the API.

Current production integration is not the original fixture-only Phase 0
implementation: the dashboard and workspace now call the authenticated API
and use backend session/card/question representations. The components still
own presentation and interaction state; Firestore persistence belongs to the
backend store.

## Verification record

The following checks are appropriate for this source review and do not require
secret values:

```bash
npm test --prefix backend
npm run build
npm run test:frontend
git diff --check
```

These commands establish local test/build results only. They do not establish
live Firebase Authentication, Firestore isolation, GA4 delivery, Cloud Run
deployment, multiple-account behavior, browser compatibility, or instructor
access.

## Related open work and handoff

The source mapping is complete independently of the remaining runtime checks.
Current related work includes:

| Issue | Relationship to this review |
| --- | --- |
| [#63](https://github.com/dishd123/StudyBoard/issues/63) | Live frontend states and API-client behavior; needs browser/runtime evidence beyond source inspection. |
| [#65](https://github.com/dishd123/StudyBoard/issues/65) | Firestore persistence and rules; needs project/database access. |
| [#66](https://github.com/dishd123/StudyBoard/issues/66) | Sessions/cards route tests; exercises the backend boundary represented by the client. |
| [#86](https://github.com/dishd123/StudyBoard/issues/86) | Multiple-account and instructor-access verification; needs configured Firebase users/access. |
| [#88](https://github.com/dishd123/StudyBoard/issues/88) | Issue-board screenshots; separate dated evidence task. |
| [#92](https://github.com/dishd123/StudyBoard/issues/92) | Google Database wiki/evidence; depends on the deployed Firestore setup. |
| [#97](https://github.com/dishd123/StudyBoard/issues/97) | This source-review document. |

The repository already records that issue #20's Secret Manager setup was
performed by the project owner. This review does not duplicate that cloud
configuration or expose its values.
