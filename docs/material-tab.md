# Material tab shell — issue #7

Owner: Huda Joad. Related issue: [#7](https://github.com/dishd123/StudyBoard/issues/7).
Scope: one photo and one recording result. Photo import and builds remain samples;
issue #43 replaces the recording placeholder with a local browser recorder.

## Files and ownership

| File | Responsibility |
| --- | --- |
| `src/components/MaterialTab.jsx` | Photo selection/import states, local recording handoff, build prerequisites, mock loading/failure/retry/completion, and timer cleanup. |
| `src/components/PhotoImportPanel.jsx` | Controlled one-photo preview, actions, recognized sample steps, unreadable flags, and StatusMessage feedback. |
| `src/components/AudioRecorder.jsx` | Runtime microphone capture, three-minute limit, playback, re-recording, Blob callback, and resource cleanup. |
| `src/components/RecordingPlaceholder.jsx` | Original sample slot, retained unused. |
| `src/fixtures/materialPreview.js` | Independent synthetic photo/audio results copied from the selected session or a ready fallback fixture. |
| `src/pages/SessionWorkspace.jsx` | Passes material callbacks from App into the Material tab. |
| `src/app/App.jsx` | Applies committed input changes to the correct local session and invalidates derived results. |
| `css/site.css` | Responsive photo, action, transcript, flag, and build presentation. |

All initial shell work belongs to Huda. Disha will connect the Photos OAuth,
Picker, image processing, and real photo import. Issue #43 adds runtime recording;
audio processing and the actual build pipeline remain later work. Microphone
permission is requested only after clicking Record or Re-record. No Google
access, Firebase, upload input, polling, or API dependency is added.

## Photo states

| State | Behavior |
| --- | --- |
| Empty | No saved photo; Select sample photo stages one synthetic result. |
| Selected | Shows one pending thumbnail; Use sample photo begins the mock import, Cancel discards the selection. Build is unavailable while selection is pending. |
| Processing | Shows loading for 800 ms; conflicting actions are disabled. Cancel import clears the timer and returns to the prior saved state. |
| Failed | Shows a plain error and Try again; selection remains available. A failed replacement does not overwrite the previous photo or discard its study results. |
| Ready | Shows one accepted photo result, ordered sample steps, and explicit unreadable parts. Replace photo stages its replacement. |

PhotoImportPanel is controlled through `photo`, `selection`, `status`, `error`,
`disabled`, `onSelect`, `onImport`, and `onCancel`. Its image is a bundled
stand-in; the synthetic text does not claim to have been extracted from it.
There is no multi-photo list or archive. Pending and saved photo are distinct:
selection/cancellation is local UI state, and only a successful acceptance
replaces `session.photo`.

## Runtime recording — issue #43

`AudioRecorder` uses MediaRecorder and requests an audio-only stream on click.
It checks supported WebM/Opus, WebM, MP4, and Ogg/Opus formats in that order,
falling back to the browser default. Unsupported browsers and denied, missing,
or unavailable microphones receive useful messages.

The UI shows recording state and elapsed time. Stop ends capture manually;
a separate timeout stops capture at 180 seconds. Playback uses one local Blob
URL. Re-record discards that recording and requests a replacement. Use this
recording calls `onUseRecording(blob, { mimeType, duration })`, with duration
in seconds. No upload or processing request is made.

MaterialTab puts only a duration, empty points, and the explicit message
"Recording captured locally. Audio processing will be available after backend
integration." into the existing session audio shape. This message is a
placeholder, not a transcript. Existing sample results remain viewable and
clearable; the build action remains an explicitly non-generating preview.

Raw audio stays in component memory. Tracks and timers stop on completion,
failure, or unmount; old playback URLs are revoked on replacement and unmount.
Unmount also invalidates pending microphone requests and queued recorder events.
A stream granted after leaving the tab is immediately stopped. Raw audio and
playback are discarded when leaving Material; only the safe session placeholder
survives navigation. Refresh discards all local preview edits.

## Parent callbacks and stale output

The current callbacks are synchronous local-preview operations:

- `onPhotoChange(photo)` commits one processed photo result.
- `onAudioChange(audioOrNull)` replaces or clears one recording result.
- `onMockRebuild()` checks that the target session has both saved inputs; it
  generates no notes or cards and changes no stored processing status.

App binds callbacks to the session ID. A committed material change clears its
summary, notes, cards, card count, and error, returns the session to draft, and
updates its timestamp. It also clears a stale processing snapshot for that
session. Other sessions remain unchanged; missing/deleted session callbacks are
ignored. Existing question history remains historical data rather than new
answers, and this issue adds no history UI.

The mock rebuild is disabled until a photo has finished acceptance and an audio
result exists. Missing-input messages explain what is needed. Busy operations
disable conflicting controls. Mock rebuild failure exposes Try again; retries
show disabled pending controls through StatusMessage. Success explicitly says
that no notes/cards were generated or saved. A draft is not marked ready merely
because the UI simulation finished. Real pipeline validation/persistence stays
in #46–54.

Committed inputs survive tab changes and returning to the dashboard because App
owns them. Pending selection, operation feedback, and timers live in MaterialTab;
switching tabs/leaving the workspace discards pending work. Cleanup cancels the
timer so a later callback cannot overwrite another session. Refresh restores
the selected fixture and discards all preview edits.

## Manual review

Start `npm run dev` and open `/app/?fixture=draft`. Open the session's Material
tab, then:

1. Verify the empty photo/recording feedback and disabled build action.
2. Record an explanation, stop, play it back, then click Use this recording;
   build must remain disabled without a photo.
3. Select a sample photo; cancel once, then select and use it.
4. Observe processing followed by the one-photo result and recognized steps.
5. Clear the recording result; build must become unavailable again. Click Use
   this recording to accept it again, or Re-record to capture a replacement.
6. Run Make notes and flashcards (preview); observe loading and explicit mock
   completion. This does not populate the Notes or Study tab.
7. Replace the photo; cancel to retain existing material or accept to invalidate
   old generated results. Revisit the dashboard to see the draft/card-count state.

Development-only failure previews:

```text
http://localhost:5173/app/?fixture=draft&photoFailOnce=1&buildFailOnce=1
```

The first photo import and first mock build fail once per MaterialTab mount;
Try again then succeeds. These flags are ignored in production builds and
are not API settings. The timer is a local simulation, not Picker polling.
Switching away and remounting starts a fresh failure-preview attempt.

## Preview evidence

Captured from the actual local preview on November 9, 2026 using headless Chrome.
These screenshots show sample frontend states, not live integrations.

### Ready material and recording-result placeholder

![Material preview with one photo, steps, unreadable flags, and synthetic recording results](images/issue-7-material-ready.png)

### Failed photo replacement with retry

![Failed sample photo replacement retaining one pending image and offering retry](images/issue-7-material-photo-failed.png)

## Acceptance mapping

| Issue #7 requirement | Evidence |
| --- | --- |
| Empty/selected/processing/failed/ready photo | Controlled PhotoImportPanel plus mock selection/import and development failure preview. |
| Clear recording placeholder | Disabled actual recorder; explicitly labelled synthetic result controls. |
| Mock rebuild | Prerequisite checks, loading, failure/retry, and explicit non-generating completion. |
| Replace photo | Separate pending result; cancel/failure preserve saved input, successful acceptance replaces it. |
| One photo | Singular saved field and at most one visible preview image. |
| Missing-input checks | Missing photo or recording disables build and displays an explanatory message. |

## Historical issue #7 verification results

Codex ran the following checks on November 9, 2026 with Linux Node `v22.23.2`
and headless Chrome through Playwright. The temporary dev server used port
`4175`, without taking over Huda's normal server. No dependency/lockfile changes
were needed.

| Check | Result |
| --- | --- |
| Production build | Passed for App/Login and the static pages. |
| Photo states | Empty/selected/processing/failed/ready rendered through the fixture-driven workflow. |
| Photo replacement | At most one preview image; accepted replacement updates steps and clears stale cards. |
| Cancellation/failure | Cancelled selection and failed/cancelled replacement preserve the previous session deck. Cancel import prevents a later commit. |
| Missing photo/audio | Build stays disabled with an explanatory message for each missing-input case and while photo selection is pending. |
| Recording slot | Actual Record disabled; sample transcript, length, and point tags render; clearing its result invalidates derived output. |
| Mock build | Loading disables conflicting actions; injected failure shows retry; retry has a disabled pending state and ends with an explicit non-generating completion. |
| Committed inputs/navigation | Accepted material survives tab changes; pending timers are cancelled on unmount and do not modify a newly selected session. |
| Session isolation | Replacement clears only the selected session's cards; another session's deck is unaffected. |
| Processing snapshot | Committed material changes clear the old processing badge/status line rather than inheriting a stale run. |
| Fixture integrity | Node assertions passed for independent clones, unchanged source fixtures, missing-input fallbacks, and replacement with no recognized steps. |
| Keyboard/mobile | Space selection and Enter retry passed; no horizontal overflow observed at 390 × 844. |
| Existing pages | Home/About/Contact/Login rendered; dashboard session creation still works. |
| External side effects | No backend requests or Google popups observed; recorder permission was not requested. No browser runtime errors observed. |
| Evidence/formatting | Two actual Material screenshots captured; whitespace checks passed. |

These were one-off implementation checks. Dedicated persisted frontend tests
remain under issue #12; full browser/assistive-technology testing remains later
QA work. At the time of issue #7, real Photos, runtime audio, Gemini, and ADK
remained separate integration issues. Issue #7 is ready for review in its own
PR with `Closes #7`.

## Issue #43 verification

On November 9, 2026, `npm install`, `npm run check`, and `npm run build` passed
on Windows with Node `v26.8.2`. No dependencies or lockfile changes were needed.
One-off Playwright CLI checks used headless Chromium and a synthetic microphone
against a temporary local Vite server. No real microphone audio was collected.

The checks covered click-only permission requests, duplicate clicks, elapsed
time, manual stop, a nonempty MediaRecorder Blob and working playback, local
acceptance, clearing/reusing a recording, and re-recording. The 179/180-second
boundary was simulated by advancing the measured clock and invoking the stop
timeout; this was not a three-minute wall-clock recording.

Injected denied/missing/busy microphone errors, unsupported MediaRecorder,
browser-default MIME fallback, MIME-specific constructor failure, and recorder
runtime failure all behaved as expected. Unmount during capture or a pending
permission request released tracks and timers; late stream grants were stopped.
Replacement/unmount revoked playback URLs. Final checks found no active tracks,
recorder timers, playback URLs, browser runtime errors, or non-GET requests.
The 390px viewport had no horizontal overflow. Physical microphones and other
browser engines still need manual acceptance checks.
