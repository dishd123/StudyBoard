# Analytics event and metric plan — issue #58

Owner: Huda Joad. Related issue: [#58](https://github.com/dishd123/StudyBoard/issues/58).
Baseline: `6a9b6ac`. Scope follows the October 19 revised StudyBoard PDF,
especially its logging/analytics flow and simplified one-photo/one-recording app.

**This is a plan, not instrumentation or evidence of collected data.** Cloud
setup (#19), secrets (#20), client tracking (#59), server tracking (#60), and
delivery verification (#80) are not completed by this document. The repository
currently has no GA4 helper/tag. Huda owns this plan and the analytics work;
feature owners review integrations affecting their code.

## Implementation ownership and current boundaries

| Work | Owner / issue | Boundary |
| --- | --- | --- |
| Event names, triggers, fields, metrics, identity limitations | Huda, #58 | This document; no cloud configuration required. |
| Google tag, safe page views and client actions | Huda, #59 | Proposed `frontend/src/services/analytics.js`; existing React/static entry points. |
| Measurement Protocol event construction/delivery | Huda, #60 | Proposed `backend/services/ga4Service.js`; verified request context and server-only secret. |
| External-call JSON logs and request correlation | Huda, #61 | Separate from analytics; proposed `backend/services/logCall.js`. |
| Safe frontend diagnostics | Huda, #62 | Separate future issue; proposed `frontend/src/services/clientLogger.js`. |
| Payload tests, client/server delivery evidence | Huda, #80 | Mocked checks plus later actual GA4 verification. |
| Report and wiki evidence | Huda, #93/#94 | Actual measurements with dates, units, denominators, and limitations. |

Existing `App`, Dashboard, Material/Notes/Study, and tutor behavior is primarily
local fixture data. `AudioRecorder` captures actual microphone audio, but
accepting it currently saves an unprocessed local placeholder. Existing backend
audio/ADK/build modules do not imply authenticated live integration is complete.
An observer must not mistake preview completion for Gemini or database success.

Verified source boundaries: [App state/actions](../frontend/src/app/App.jsx),
[workspace navigation](../frontend/src/pages/SessionWorkspace.jsx),
[API client/error contract](../frontend/src/services/apiClient.js),
[direct audio processing](../backend/services/geminiAudioService.js),
[ADK pipeline](../backend/agents/studySetPipeline.js), and
[build retries/persistence boundary](../backend/services/buildService.js).

## Event contract

Names below are fixed lowercase identifiers. Each emitter constructs a new
allowlisted parameter object; it must not spread component props, request
objects, errors, or model output into an event. Unlisted parameters are dropped.

Common application parameters:

| Parameter | Allowed value / type | Applies to |
| --- | --- | --- |
| `event_source` | `client` or `server` | Every planned event. |
| `app_env` | `development`, `test`, or `production` | Every event; deployment configuration, not a user's field. |
| `data_mode` | `preview`, `test`, or `live` | Every event; default current workspace is preview. |
| `schema_version` | Integer `1` | Every event; change the plan if semantics change. |
| `outcome` | `success`, `failure`, or `cancelled` | Terminal actions; omit for view events. Server generation uses success/failure. |
| `duration_ms` | Finite nonnegative number | Timed actions/runs only, measured with a monotonic clock. |
| `attempt_type` | `initial` or `retry` | A user request or server generation attempt where applicable. |
| `error_category` | `auth`, `access`, `validation`, `prerequisite`, `rate_limit`, `network`, `service`, or `unknown` | Failures only; derived from known codes, never raw error text. |
| `debug_mode` | Boolean true during explicit verification; omitted otherwise | Verification only, also labelled development/test so report filters exclude it. |

`preview` describes the workspace/results, even when its microphone capture is
real. Current fixture builds, simulated tutor answers, and local session/card
mutations remain preview events. Switch an operation to live only when its real
integration confirms the result. Tests use mocked transport; they send no events
to Google. Production deployment alone does not change fixtures into live data.

### Client event catalogue — implementation #59

Each row has exactly one client emitter. Do not also emit the same client
outcome from `apiClient` or a rendered `StatusMessage`.

| Event | Exact trigger | Extra allowlisted parameters | Existing integration location |
| --- | --- | --- | --- |
| `page_view` | One physical page load after tag initialization; see page rules below. | Sanitized `page_location`, fixed `page_title`, sanitized/empty `page_referrer`. | Static HTML/`js/site.js`, App/Login entry points. |
| `workspace_view` | Dashboard first shown or active Material/Notes/Study section actually changes. Re-selecting the active section emits nothing. | `section`: `dashboard`, `material`, `notes`, `study`. | `App.jsx`, `SessionWorkspace.jsx`. |
| `login` | User-initiated Google sign-in succeeds. Auth restoration on refresh is not another login; Photos reauthorization is not this event. | `method`: fixed `Google`. | Future `useAuth`/login integration; sample forms emit no real login. |
| `sign_out` | Explicit sign-out settles. | None. | Future `useAuth`/navigation integration. |
| `session_action` | Accepted create/rename/delete/open/filter action settles. Confirmed API success for live mutations; no event for every keystroke. | `action`: `create`, `rename`, `delete`, `open`, `filter`; `filter_state`: `all` or `filtered` only for filtering. | Dashboard handlers/App callbacks; later API integration. |
| `photos_picker` | Photos authorization/Picker creation attempt settles, including explicit popup cancellation. Opening a Picker is not a successful photo import. | None. | Future Photos import controller. |
| `photo_import` | Import-picked-photo request finishes processing/saving, fails, or is explicitly cancelled. A 409 unfinished pick is a prerequisite failure. | None. | `PhotoImportPanel`/Material import controller. |
| `recording_capture` | Capture finishes with a nonempty playable recording, fails, or is explicitly cancelled after capture starts. Merely rendering the recorder emits nothing. | `recording_seconds`: finite 0–180 on completed capture. | `AudioRecorder.jsx`. |
| `audio_submit` | Use this recording upload/process/save attempt settles; current local acceptance is preview only. | None. | Material recording callback/integration. |
| `study_build` | Make notes and flashcards/Rebuild request settles. Live success requires validated saved notes/cards, not a successful button animation. | `card_count`: integer 3–12 only on confirmed live generation success. | Material build controller. |
| `card_review` | Flip/navigation/filter action is accepted, or mark-known/delete operation settles. Cancelled deletion does not emit a successful delete. | `action`: `flip`, `next`, `previous`, `mark_known`, `mark_learning`, `delete`, `filter`; `filter_state`: `all` or `unknown` only for filtering. | `FlashcardDeck.jsx` actions and persisted callbacks. |
| `tutor_question` | One nonblank typed question attempt settles. Uncovered material is successful answering, not a service failure. | `coverage`: `covered` or `uncovered` on live success; `unavailable` for a preview no-match only. | `TutorPanel.jsx` controller. |
| `request_retry` | An enabled explicit Try again starts another attempt. Repeated clicks on a disabled button emit nothing. | `operation`: `photo_import`, `audio_submit`, `study_build`, or `tutor_question`. | Owning controller's retry callback. |

`study_build` includes both initial builds and rebuilds; it does not require a
new persisted run/history field to distinguish them. The generation card count
is not a minimum remaining deck size after users delete cards.

Cancel outcomes are emitted only for explicit cancellation observed by the
controller. Do not infer a cancellation merely because a user stops interacting
with a Picker tab. Do not count a disabled control or rejected blank form as an
accepted request. A manual retry is a new attempt: record its `request_retry`
and subsequent terminal action, with `attempt_type=retry`.

Closing a confirmation dialog before submitting is not a completed mutation.
Cancellation after submission describes the client's observation; it does not
prove a server mutation was rolled back or make another submission idempotent.

`duration_ms` on request actions is elapsed time from accepted submission to
terminal response, including network/save time. It excludes typing and time
spent choosing in Google's Picker. `recording_seconds` measures captured audio;
it is not a transcript or an engagement-time measurement.

### Page views, duplicate prevention, and preview separation

Retain physical page paths `/`, `/about.html`, `/contact.html`, `/app/`, and
`/login/`. Normalize `/index.html` to `/`. Send only origin plus an allowlisted
path, with no query string, hash, user/session ID, or course. Use fixed titles
such as `StudyBoard — App`; never derive titles from a session's name.
Set the referrer to empty or a sanitized same-site origin/path.

Use manually controlled page views with `send_page_view=false` on every page's
tag configuration. Disable Enhanced Measurement's automatic page/history
tracking for this stream, as well as automatic form/site-search/outbound-link
collection that could introduce unreviewed URLs or duplicate events. Check the
real network payloads, including automatic events; sanitized explicit parameters
alone do not prove all tag metadata is safe. See Google's
[manual page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites)
and [page metadata configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config).

Material/Notes/Study are local views within `/app/`: they emit `workspace_view`,
not another physical `page_view`. Use the owning state transition or accepted
event handler, not every render/effect. Guard tag initialization and initial
view effects against React Strict Mode's development re-execution. Dashboard's
embedded Study preview is not a second workspace navigation event. A repeated
real visit/action is counted; duplicate dispatch for that same action is not.

### Server event catalogue — implementation #60

The revised proposal's server event name is **`gemini_call`**. It records one
terminal event per logical direct Gemini call, ADK child-agent run, or pipeline
run. Add common parameters plus:

- `operation`: one value in the table below.
- `call_kind`: `gemini`, `agent`, or `pipeline` as specified below.
- `duration_ms`, `outcome`, and `attempt_type`; safe `error_category` on failure.

| `operation` | `call_kind` | Emission boundary |
| --- | --- | --- |
| `photo_read` | `gemini` | Direct Gemini photo processing invocation, including provider failure. Photos/Vision calls are separate logging operations. |
| `audio_process` | `gemini` | Direct Gemini recording processing invocation in the audio service. |
| `notes_agent` | `agent` | One `notesAgent` execution, including output-validation failure. |
| `cards_agent` | `agent` | One `cardsAgent` execution, including output-validation failure. |
| `tutor_agent` | `agent` | One request-bound `tutorAgent` execution, including its tool/model rounds. |
| `agent_check` | `agent` | The initial authenticated ADK agent/tool smoke-check execution, when implemented. |
| `study_set_pipeline` | `pipeline` | One pipeline execution attempt enclosing the dependent notes/cards runs. |

Capture the verified user identity in request context and carry it to the
analytics adapter. Do not use the current executor's internal `study-set-build`
ADK user label, a model argument, an unverified body UID, or a fixture ID as the
caller. The middleware's `req.uid` versus audio router's `req.user.uid` adapter
must be reconciled when auth is integrated.

Rejecting an unauthorized/invalid input before invoking generation produces no
fabricated successful model event. A child agent never invoked after an earlier
failure produces no child event. If the build service retries generation once,
each pipeline/child execution actually attempted gets its own terminal event;
the browser still emits one terminal `study_build` per submitted build request.

One owner emits at each boundary. Do not repeat a direct-call event in both a
route and its service, or emit a second copy for ADK's underlying model hooks.
The agent event aggregates its internal tool/model rounds. These are logical
operation measurements, not a count of every provider HTTP call, SDK retry,
token, or billable request. Pipeline duration overlaps its child durations;
exclude pipeline records from child-call totals and never sum parent/child time
as if it were independent elapsed time.

Stop operation timers before analytics delivery. Buffer safe completed records
in request memory and flush them through #60 with a bounded timeout before the
response, without a new queue/database collection. A delivery failure preserves
the original application result/error; no unhandled rejection or endless retry.
Do not rely on unawaited work after a Cloud Run response to prove delivery.
The helper must not log its URL containing the Measurement Protocol secret.

## Identity mapping and its limitations

The proposal uses the verified Firebase UID as backend `client_id`. Keep this
mapping for #60; derive it from verified request context, not the model or body.
UID is transport identity, not an extra custom parameter. Exclude emails,
display names, tokens, and Google provider identities.

**Compatibility check before live enablement:** Google documents numeric/cookie
web client-ID formats. An opaque Firebase UID is not established as compatible.
#80 must validate the proposed mapping and actual report ingestion; a string
type or HTTP success is insufficient. If it fails, document the discrepancy
and agree a proposal adjustment before changing identity strategy. See the
[web Measurement Protocol reference](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag).

Browser instance IDs and backend UIDs do not automatically join. Report client
and server metrics separately; claim no combined unique-user count, person-level
funnel, attribution, or adoption rate. This plan adds neither frontend User-ID
nor browser cookie forwarding.

Firestore session IDs are not GA4 `session_id`; model duration is not
`engagement_time_msec`. Do not fabricate either. GA session/engagement metrics
and inferred user geography/device conclusions are outside this report plan.

## Allowed configuration and excluded data

These names are a proposed configuration contract for #17/#59/#60, not values
already provisioned. Confirm their names during implementation; no environment
file or secret value is added by this issue.

| Name | Location | Meaning |
| --- | --- | --- |
| `VITE_GA4_MEASUREMENT_ID` | Public frontend build setting | Placeholder `G-EXAMPLE`; web stream measurement ID, not an API secret. |
| `VITE_ANALYTICS_ENABLED` | Frontend build setting | Explicit `true` enables collection; default false/missing disables it. |
| `GA4_MEASUREMENT_ID` | Backend setting | Same selected web stream as frontend collection. |
| `GA4_API_SECRET` | Backend-only Secret Manager binding | Measurement Protocol API secret from #20. No value belongs in source or a `VITE_` variable. |
| `ANALYTICS_ENABLED` | Backend setting | Explicit `true` after configuration/compatibility validation; otherwise disabled. |

Environment/mode labels are supplied deliberately by the deployment/test
configuration, not inferred solely from a Vite production build. Debug mode is
only for verification and is removed/excluded from report collection. Missing
configuration and blocked/unavailable tag transport must not break the app.

Never send photo/audio bytes, thumbnails, filenames, URLs from Picker, notes,
OCR text, transcripts, questions/answers, session titles, course names, source
steps, record IDs, raw error/stack text, credentials, request/response bodies,
or OAuth/Firebase tokens. Keep request correlation IDs in #61/#62 diagnostics,
not high-cardinality GA4 dimensions. This plan adds no user properties,
advertising signals, or content-derived labels. See Google's
[PII and URL/title guidance](https://support.google.com/analytics/answer/6366371?hl=en).

The only planned backend UID disclosure is the proposal's `client_id` mapping
discussed above; it is a persistent pseudonymous identifier, not anonymous data.
Use the verified opaque Firebase UID only, never a name/email-derived custom UID.

## Metrics and collection periods

Use America/Los_Angeles for report windows and record the GA4 property's actual
reporting timezone. Planned comparison windows are November 10–16 and November
17–23, 2026, inclusive local calendar days; the Nov 19 feature freeze still
applies. A window starts collecting only after instrumentation and delivery
are verified. Record the actual first/last timestamps, missing days, release
changes, and debug/test exclusions. Do not backfill events or claim observations
for dates before collection began. Prepare the report during Nov 24–30.

For every metric, filter `app_env=production`, `data_mode=live`, schema version 1,
and the stated client/server source. Publish preview results separately if
useful, labelled as preview. Exclude debug, automated-test, and explicit
verification traffic. Count real repeated submissions as attempts, not new
people. A zero denominator is **N/A**, not zero percent success or coverage.

| Metric | Definition | Unit / grouping | Collection and limitations |
| --- | --- | --- | --- |
| Build completion rate | Client `study_build` successes / (successes + failures) × 100; report cancellations separately. | Percent and numerator/denominator; per actual window. | User-visible saved outcome, including persistence. Client delivery losses bias the denominator. |
| Mean generation-operation duration | Sum server `gemini_call.duration_ms` / count of records with valid duration, grouped by `operation` and `outcome`; exclude `call_kind=pipeline`. | Milliseconds plus event count; per operation/window. | Logical direct-call/agent duration; not browser wait time or model billing. Do not combine unlike operations. |
| Generation-operation failure rate | Server failures / (successes + failures) × 100, grouped by `operation`; exclude pipeline parents from child totals. | Percent and counts; per operation/window. | Counts attempted runs, including eligible retries. Report configuration/validation failures distinctly when relevant. |
| Tutor covered-answer share | Client successful `tutor_question` with coverage covered / successful covered-or-uncovered answers × 100. | Percent and denominator; per actual window. | Exclude failures/preview unavailable results; coverage is the saved-material classification, not an independent accuracy score. |
| Study-section views | Count client `workspace_view` where section is study. | Views per local day and per actual window. | Counts actual view transitions, not unique users, study sessions, learning gains, or card previews on Dashboard. |

At least three metrics above must be supported by actual collected data in
#93. If verified collection starts late, use the real shorter period and explain
why two complete comparison windows are unavailable. Small group/test-account
traffic is not evidence of broad adoption or statistically reliable improvement.

Before report collection, register the needed event-scoped custom dimensions
for the categorical parameters and `duration_ms` as a numeric custom metric
with documented millisecond units. Use GA4 event counts, filtered Explorations,
and an exported aggregate table for the formulas above. This plan requires no
new BigQuery export or cloud database. Confirm custom definitions and event
availability in #80; delayed/unregistered reporting is a limitation, not a
reason to invent a metric result.

## Verification and report evidence — later #80/#93

1. Offline tests check exact allowlists/types, sanitized URLs, missing config,
   nonfatal transport failure, one dispatch per accepted action, and no calls
   to Google from unit tests. Use synthetic inputs containing marker text and
   confirm the markers never enter constructed payloads.
2. Verify client page/action events in the appropriate GA4 debugging view and
   inspect network payloads. Exercise refresh, tab switches, Strict Mode, retry,
   failed API calls, and the current preview/live distinction.
3. Validate server payloads with the Measurement Protocol validation endpoint,
   including the UID `client_id` compatibility check. Validation requests do
   not populate reports and do not independently prove credentials/ingestion.
4. Separately send controlled real server events through the collection endpoint
   and confirm they appear in reporting. HTTP 2xx alone does not prove valid
   processed analytics. DebugView, validation responses, and report ingestion
   are different evidence. See Google's
   [validation guidance](https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events?client_type=gtag).
5. Verify a build retry: one client request outcome, separate actual pipeline/
   child attempts, no event for a child that never ran, and no double-counted
   pipeline parent in operation totals. Test empty/failed/uncovered cases too.
6. Save dated client/server evidence and aggregate metric tables with filters,
   timezone, actual collection interval, units, sample counts, and limitations.
   Screenshots must exclude secret-bearing request URLs and student content.

Current evidence for #58 is the revised proposal/current-source comparison and
review of this plan. No GA4 property, tag, API secret, event delivery, dashboard,
or measurement result was created or verified by this documentation issue.
Reviewer sign-off belongs in the dedicated PR with `Closes #58`.
