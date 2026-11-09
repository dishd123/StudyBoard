# Shared StatusMessage — issue #5

Owner: Huda Joad. Related issue: [#5](https://github.com/dishd123/StudyBoard/issues/5).
Implementation: `src/components/StatusMessage.jsx`; styling: `css/site.css`.

## Interface and variants

The component provides one reusable message block for sessions, photo import,
recording, processing, cards, and tutor operations. It has no API, Firebase,
timer, or operation-specific logic. Callers control the current state and retry.

| Prop | Meaning |
| --- | --- |
| `status` | `idle` (default), `loading`, `success`, `empty`, `validation-error`, `error`, or `service-error`. |
| `message` | Plain display string; omitted/blank strings use a meaningful default. React escapes text. Pass `ApiError.message`, not an error object or raw server body. |
| `onRetry` | Optional callback shown as a native button for error variants only. Omit for non-retryable errors or when no operation can run. |
| `isRetrying` | Caller-controlled boolean; shows loading feedback and disables the existing retry button. |
| `retryLabel` | Optional button label; defaults to `Try again`. |
| `id` | Optional root ID for associating messages with form fields. |

Unknown statuses fall back to the generic error variant. Idle has no visible
content or retry action but keeps the live region mounted for later updates.
Labels and text convey the state in addition to color. Loading uses a decorative
spinner that stops animating when reduced motion is requested.

| State | Announcement behavior |
| --- | --- |
| Loading, success, empty, idle | `role="status"`, polite live region. |
| Validation/service/generic error | `role="alert"`, assertive live region. |
| Retrying | Loading/polite feedback; retry button stays visible and disabled. |

The live message is atomic. The retry button sits outside the live-text region
and uses native keyboard activation. Focus is not moved automatically. There
is no second enclosing live region in the tutor, avoiding duplicate feedback.
Screen-reader-friendly markup does not replace later testing with assistive
technology.

## Usage

```jsx
<StatusMessage status="loading" message="Importing your photo…" />
<StatusMessage status="success" message="Your recording is ready." />
<StatusMessage status="empty" message="No sessions yet." />
<StatusMessage status="validation-error" message="Choose a photo first." />
```

API errors and retries are explicitly coordinated by the caller:

```jsx
<StatusMessage
  status={error ? 'service-error' : loading ? 'loading' : 'idle'}
  message={error?.message ?? 'Building notes and flashcards…'}
  onRetry={error?.retryable ? handleRetry : undefined}
  isRetrying={retrying}
/>
```

`handleRetry` must set the caller's retrying state before awaiting the request,
retain the error status while retrying, catch and update any error, then clear
retrying in `finally`. Clearing the error/changing to a non-error status also
removes the retry button. The component does
not automatically retry, catch callback failures, change stored session status,
or assume a failed request can safely be repeated. Callers should also disable
their original operation button while a request is in progress.

## Current integration and manual preview

Start `npm run dev` and visit the existing fixture URLs:

- `/app/?fixture=processing`: loading feedback on the dashboard.
- `/app/?fixture=empty`: empty-session feedback.
- `/app/?fixture=draft`: missing-photo and empty-card feedback.
- `/app/?fixture=failed`: service-error feedback.
- `/app/`: submit an empty tutor question for validation feedback, then a typed
  question for a success acknowledgement explicitly labelled as a local demo.

The failed snapshot has no real build operation, so it intentionally has no
retry callback/button. The optional retry interaction can be verified with a
mock caller; real import/record/build/tutor retries belong to their integration
issues. No demo button claims to repair backend data. Detailed StatusMessage
use on future slow operations remains the responsibility of each feature owner.

The tutor field sets `aria-invalid` on empty submission and clears validation
when edited. Marketing pages and the separate login entry point are unchanged.

## Acceptance and verification

| Issue #5 requirement | Evidence |
| --- | --- |
| Loading/error variants | Generic, service, validation, loading, success, and empty variants in one component. |
| Readable errors | Plain defaults and supplied safe API messages; no stack traces or raw objects. |
| Optional keyboard retry | Native button, custom label, visible focus, disabled pending state. |
| Accessible announcement | Stable atomic live region with polite/status or assertive/alert semantics. |
| Reuse across operations | Generic props and existing dashboard, board, card, and tutor integrations. |

## Verification results

Codex ran the production build with Linux Node `v22.23.2` and component/browser
smoke checks using headless Chrome through Playwright. A temporary Vite server
used port `4175`, leaving Huda's usual development server alone. No dependency
or lockfile changes were required.

| Check | Result |
| --- | --- |
| Production build | Passed for both React entries and existing static pages. |
| Loading/success/empty/validation/error/service-error | Passed isolated browser component renders for all six visible variants. |
| Idle and defaults | Passed; idle remains mounted with no visible text/action; unsupported status has a readable fallback. |
| Announcement markup | Passed role, live priority, and atomic-region checks for each variant. |
| Optional retry | No button without callback; error callback exposes a native button with a nonempty label. |
| Keyboard retry | Passed Enter and Space activation against a mock caller. |
| Pending retry and completion | Passed; button disabled after caller sets pending, repeated activation did not duplicate the callback, success removes retry. |
| Message escaping | Passed; HTML-like message displayed as text rather than an image/element. |
| Reduced motion | Passed; spinner animation is disabled when reduced motion is requested. |
| Narrow layout | Passed at 390 × 844 with a long unbroken message and retry control; no document horizontal overflow. |
| Existing fixtures | Processing, empty, draft, and failed messages render through the shared component. |
| Tutor validation/success | Blank question produces an alert, invalid/described-by field association is set, editing clears validation, typed demo submission shows a clearly labelled acknowledgement. |
| Existing Home/About/Contact/Login pages | Passed route/render checks. |
| Runtime/whitespace | No browser runtime errors in the completed checks; whitespace check passed. |

The retry test used a mock parent that updates pending/success state; it did not
call an actual backend. These one-off checks did not add a test harness to the
product. Dedicated persisted frontend tests remain under issue #12. Full
cross-browser and assistive-technology testing remain later QA work. Issue #5
is ready for review in its own PR with `Closes #5`.
