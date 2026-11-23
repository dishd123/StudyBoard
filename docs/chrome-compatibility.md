# Chrome Compatibility Test

## Environment

- Deployed URL: https://studyboard-389363739519.us-central1.run.app/
- Chrome version: 157.0.8103.79 (installed Chrome executable)
- OS: Windows NT 10.0, build 26200
- Test date: 2026-11-22 (America/Los_Angeles)

## Results

BLOCKED means the workflow has not yet been fully completed;
it does not mean a failure has been observed.

| Workflow | Result | Evidence / Notes |
| --- | --- | --- |
| Sign in | PASS | The sign-in page loaded; the user completed Google sign-in and the signed-in dashboard appeared. The empty form and cropped dashboard session controls are in `images/application-demo/01-sign-in.png` and `02-session-form.png`. |
| Create session | PASS | Entered title and course; the new test workspace opened automatically. See `02-session-form.png` and `03-session-workspace.png`. |
| Google Photos import | BLOCKED | Google authorization showed `Error 403: access_denied` and said the app had not completed verification and was limited to developer-approved testers. No Photos Picker selection or import was completed. StudyBoard then showed “The Google window was closed before it finished. Try again.” with a retry control; see `13-error-retry.png`. Device upload is tracked separately below. |
| Device photo upload | PASS | Uploaded the supplied Canny board from the device; the preview and five recognized steps appeared. See `04-board-preview.png`. |
| Recording | BLOCKED | Microphone was granted, recording timer advanced, the user manually stopped the first recording, and a second take was stopped and saved. Playback controls appeared (`05b-recording-playback.png`), but audible playback and the automatic three-minute limit were not verified. |
| Build | PASS | The enabled build completed and opened generated Notes. See `07-build-ready.png` and `08-notes-correction.png`. |
| Notes correction | PASS | Step 2 retained board value sigma 1.4 and displayed the spoken correction to 2 separately. See `08-notes-correction.png`. |
| Flashcards | PASS | Six initial cards appeared. Flip, next, previous, Got it, Still learning, and unknown-only filter worked. See `09-flashcards.png`. |
| Covered tutor | FAIL | The sigma answer correctly said 2 instead of 1.4 and mentioned step 2, but the UI also displayed Not covered by your material. See `10-tutor-covered.png`. |
| Uncovered tutor | PASS | An unrelated question about the capital of France received a response that the material did not cover it and the not-covered indicator. See `11-tutor-uncovered.png`. |
| Replace photo | PASS | Replace photo returned to Material. Re-uploading the supplied Canny image in the same session processed five steps and marked the study set for rebuild. A different image was not tested. |
| Re-record | PASS | Recorded a second take, stopped it, and saved the resulting 66-second processed explanation in the same session. A rebuild-needed banner appeared; see `12-rebuild-needed.png`. |
| Rebuild | PASS | Rebuilt after replacing audio; the success message appeared and the regenerated five-card deck showed 0 known and 5 still learning (`12b-rebuilt-cards.png`). A second rebuild also succeeded after re-uploading the same photo. |
| Permission/cancellation | PASS | Closing Google authorization showed a clear window-closed message and retry control. Blocking the microphone showed the microphone-blocked message and retry control. Once permission was restored, a new recording started. |
| Retry behavior | BLOCKED | Google Photos Try again reopened the authorization window, but import remained blocked by the tester restriction. The microphone error offered Try again, but the page reloaded when permission was changed, so that button itself was not exercised; starting a fresh recording succeeded after permission was restored. |
