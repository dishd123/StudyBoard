# Safari compatibility testing for Issue #84

## Test environment

| Item | Observed value |
| --- | --- |
| Test date | November 26–27, 2026 (America/New_York) |
| Browser | Apple Safari 26.6 (21624.4.5.11.5), reported from About Safari |
| Operating system | macOS 26.6 (25G72), reported by `sw_vers` |
| Mac model | MacBook Air (Mac17,4), Apple M5, reported by System Information |
| Application | <https://studyboard-389363739519.us-central1.run.app/> |
| Test material | [Canny edge detection board](images/application-demo/00-canny-board-material.png) |
| Spoken correction | The board shows sigma 1.4. The correct value should be 2. |

## Results

Results include direct Safari observations and tester confirmations.

| Check | Result | Observation |
| --- | --- | --- |
| Google sign-in and popup | PASS | The tester saw the Google sign-in popup, completed sign-in, and returned to the StudyBoard page in Safari. |
| Session access after reload | PASS | The tester reloaded StudyBoard in Safari and could still access the signed-in dashboard. |
| Session and navigation | PASS | Created Safari Compatibility Test in Browser Testing. Material, Notes and Study were available. |
| Device upload and board extraction | PASS | The tester selected the demonstration image. Safari displayed five extracted steps, including sigma 1.4 in step 2. |
| Google Photos import | PASS | The tester completed authorization and selection. StudyBoard reported the photo imported and displayed five extracted steps. |
| Safari recording and manual stop | PASS | Microphone recording started, displayed 00:38, and stopped manually. The recording was uploaded, processed and saved. Playback and replacement recording are reported separately below. |
| Replacement recording | PASS | A second recording was captured, submitted and processed into a new saved correction. |
| Audible playback | PASS | The tester played a separate recording and confirmed speech was audible and clear. |
| Recording MIME format | BLOCKED | The chosen format was not observed. |
| Microphone denial and recovery | PASS | Denial displayed an actionable blocked-access message and retry. After permission was restored and the Safari prompt was handled, recording resumed and the timer reached 00:39. |
| Build and sigma correction | PASS | Notes and five cards were generated. Notes kept sigma 1.4 in step 2 and displayed the spoken correction to 2 separately. |
| Covered tutor question | PASS | The answer identified the correction from 1.4 to 2 and cited step 2. |
| Uncovered tutor question | PASS | The response said the saved material did not cover the question and displayed the not-covered label. |
| Replacement and rebuild | PASS | Photo import and the replacement recording each triggered a rebuild notice. Both rebuilds completed with updated notes and a success message. |
| Rebuilt flashcards | PASS | The rebuilt deck displayed five cards, including updated question text. |
| Flashcard interactions | PASS | Flip showed the answer. Next and Previous changed cards. Got it and Still learning updated counts, and unknown-only excluded the known card. |
| Notes at 390 CSS pixels | PASS | The Safari viewport measured 390 CSS pixels. The tester reported that the Notes layout and horizontal scrolling looked good. |
| Material keyboard navigation | PASS | The tester reported Tab, Shift+Tab and activation worked without a focus trap. |
| Material at 390 CSS pixels | PASS | The tester confirmed the text and upload and recording controls were readable and reachable. |
| Study at 390 CSS pixels | PASS | The tester reported the flashcard and tutor layout worked at a 390 CSS pixel viewport. |
| Dashboard at 390 CSS pixels | PASS | The tester confirmed the dashboard text and session controls were reachable. |
| Dashboard, Notes and Study keyboard navigation | PASS | The tester confirmed visible focus, Tab, Shift+Tab and activation without a focus trap, including flashcard and tutor controls. |
| Sign-out | PASS | Sign-out returned the app to its signed-out screen. |
| Photos Picker cancellation | PASS | After closing the Picker, the tester saw “Finish picking in the Google Photos tab first” and confirmed that the Picker could be opened again. |

## Observed problems

Safari returned an error requiring “Allow JavaScript from Apple Events” when automation attempted to inspect the StudyBoard page. Enabling the setting allowed Apple Events automation in the regular authenticated Safari session. Safari WebDriver opened an isolated window that prevented manual Google sign-in. The tester reported a message asking them to finish picking in the Google Photos tab after closing the Picker. The tester confirmed that the Picker could be opened again. No application compatibility failure was observed in the checks above. These checks cover representative keyboard and responsive interactions and do not constitute a complete accessibility or security audit.

## Screenshots

The tester captured these images in the regular Safari session. The original Notes screenshot was captured during testing, and the remaining images were captured from the existing session on November 27.

- [Workspace and Notes correction after rebuild](images/safari-compatibility/notes-correction.png)
- [Board image, extracted steps and saved recording](images/safari-compatibility/material-board.png)
- [Flashcard and uncovered tutor response](images/safari-compatibility/study-uncovered.png)
- [Covered tutor response with step 2 citation](images/safari-compatibility/tutor-covered.png)

The sign-in and Google Photos popups and the active recording were not captured at the time of testing. Their results are recorded from the observed interactions above. A WebDriver screenshot captured during initial page loading was blank and was excluded.

## Issue #84 readiness

The recorded Safari checks meet the stated compatibility acceptance criteria and are ready for PR review. The exact selected recording MIME type remains unobserved because the command to inspect it was rejected. The successful upload, processing, playback and replacement recording establish the tested recording workflow without identifying that MIME value. No issue has been closed.
