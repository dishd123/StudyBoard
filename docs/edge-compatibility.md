# Edge Compatibility Test

## Environment

- Application: https://studyboard-389363739519.us-central1.run.app/
- Browser: Microsoft Edge 158.0.4370.45 (Official build) (64-bit), from edge://settings/help
- Operating system: Windows NT 10.0, build 26200
- Test date: 2026-11-26 (America/Los_Angeles)

## Results

PASS means verified; FAIL means observed incorrect behavior; BLOCKED means verification remains incomplete or needs a prerequisite.

| Test | Result | Evidence / Notes |
| --- | --- | --- |
| Sign in | PASS | Google popup opened and user completed sign-in. Email/password and sign-out are not verified. |
| Create session | PASS | Created Edge Compatibility Test in Browser Testing and opened its workspace. |
| Device photo upload | PASS | Uploaded the repository Canny image; five steps recognized, including sigma 1.4. [Screenshot](images/edge-compatibility/03-board-upload.png). |
| Google Photos import | PASS | On retry, the user completed the Photos picker and supplied a screenshot of StudyBoard reporting “Your board photo was imported.” The user reported that the resulting preview showed five Canny steps, including sigma 1.4. An earlier attempt displayed an unverified-app warning and was cancelled. |
| Microphone permission | PASS | Allowing access started recording. Blocking access produced a clear error and retry control; after permission was restored and the page reloaded, a fresh recording started. The original retry button itself was not exercised. [Screenshot](images/edge-compatibility/12-microphone-blocked.png). |
| Recording | PASS | Timer advanced, recording stopped manually, and the explanation was saved. [Screenshot](images/edge-compatibility/04-recording.png). MIME type not observed. |
| Playback | PASS | User played the second take and confirmed the speech was audible and understandable. |
| Re-record | PASS | A second take was recorded and saved; the new 61-second processed explanation contained the spoken sigma correction and triggered the rebuild banner. |
| Build | PASS | Build completed and opened generated notes; six cards were generated. |
| Notes correction | PASS | Step 2 retained sigma 1.4 and separately displayed the correction to 2. [Screenshot](images/edge-compatibility/05-notes-correction.png). |
| Flashcards | PASS | Flip, previous/next, Got it, Still learning, counts, and the unknown-only filter worked. Rebuilt cards showed 0 known, 5 still learning. |
| Covered tutor question | PASS | Answer said sigma was corrected from 1.4 to 2 and cited step 2, without the not-covered label. [Screenshot](images/edge-compatibility/07-tutor-covered.png). |
| Uncovered tutor question | PASS | France question received a not-covered response without an outside answer. [Screenshot](images/edge-compatibility/08-tutor-uncovered.png). |
| Replace/re-record/rebuild | PASS | Re-uploaded the same board and rebuilt, then saved a replacement recording and rebuilt again. The regenerated deck showed 0 known and 5 still learning. A different board was not tested. |
| Keyboard navigation | PASS | Tab and Shift+Tab reached dashboard, navigation, session tabs, Material, card and tutor controls. Space opened the navigation menu and flipped a card; Enter opened the existing session and Notes, and Space opened Study. Focus was visibly identifiable; typing in the tutor and tabbing to submit worked. This was a usability check, not a full accessibility audit. |
| Responsive layout | PASS | At 390 CSS px, the dashboard and navigation, Material, Notes, Study cards and tutor remained readable and controls accessible. The Notes table scrolls horizontally; its rightmost correction column was reachable. This is an Edge viewport check, not physical-device testing. [Notes screenshot](images/edge-compatibility/11-narrow-notes.png). |
| Error/retry behavior | PASS | Closing the Google popup displayed a useful window-closed message. Try again reopened authorization; an earlier attempt encountered an unverified-app warning. A later user-performed retry succeeded as described above. [Screenshot](images/edge-compatibility/10-error-state.png). |

The tested core workflow, recording and popup behavior, keyboard navigation, and responsive layouts met the Issue #85 criteria. Microsoft Edge was used as the modern replacement for retired Internet Explorer.