# Application Demonstration

This page is a draft walkthrough of one StudyBoard session, from sign-in and
source material to notes, flashcards, and the study tutor. It describes the
current application and plans the evidence to capture; generated results and
browser outcomes have not been asserted by this draft.

> Final browser screenshots will be added after compatibility verification.

## 1. Sign In

1. Open **Sign in** from the navigation. Use **Continue with Google**, or sign in
   with an existing email and password. The page also offers account creation
   and password reset.
2. After successful authentication, the application opens the workspace at
   `/app/`. A user who is already signed in can choose **Go to your sessions**.

> **Screenshot TODO — Sign in:** Capture the sign-in page showing the available
> actions, and the signed-in dashboard showing the session controls. Use two
> screenshots if needed; do not expose account credentials.

## 2. Create a Study Session

1. On the dashboard, enter a **Title** and a free-text **Course**, then choose
   **New study session**. Course suggestions are available, and a blank course
   becomes `General`.
2. The new session opens immediately in its workspace. Use **Back to your
   sessions** to return to the dashboard and reopen its entry when needed.

> **Screenshot TODO — Create session:** Capture the Title and Course fields and
> **New study session** control, then the resulting workspace or dashboard entry
> with the chosen title and course visible.

## 3. Add One Board Photo

Open the session's **Material** tab. Choose one whiteboard or handwritten-page
photo by either route below.

### Upload from Device

Choose **Upload a photo** and select an image from the phone or computer. The
browser makes JPEG copies for the upload; after processing, the board preview
shows the saved photo and recognized steps.

> **Screenshot TODO — Device upload:** Capture the **Upload a photo** control
> and the processed board preview with at least one numbered step visible.

### Import from Google Photos

This option is shown for Google sign-ins. Google Photos access is requested
separately from account sign-in.

1. Expand **Or import from Google Photos** and select **Choose a photo in Google
   Photos**. Allow the requested Photos permission to start the Picker session.
2. Select **Open Google Photos**, choose one board photo in the Picker, and
   return to StudyBoard.
3. Select **Import my picked photo** and wait for processing and the board
   preview. The Picker interaction still needs browser verification.

> **Screenshot TODO — Google Photos import:** Capture the import controls and
> selected-photo/Picker state without exposing unrelated photos, then the
> processed board preview and its numbered steps.

## 4. Record the Spoken Explanation

1. In Material, choose **Start recording** and allow microphone access. The
   panel shows elapsed time and stops automatically after three minutes.
2. Choose **Stop recording** to stop sooner. Play back the take, or choose
   **Re-record** to replace it. Recording is made with the microphone at runtime;
   the panel does not offer an audio-file upload alternative.
3. Choose **Use this recording** to process and save it. The saved material shows
   a transcript and spoken points tagged `explanation`, `correction`, or
   `emphasis`.

> **Screenshot TODO — Recording:** Capture either the active recording indicator
> and timer or the completed playback and **Use this recording** controls, plus
> the saved transcript and tagged points after processing.

## 5. Demonstrate a Spoken Correction

For the final browser demonstration, use a board that says **`σ = 1.4`**. In the
spoken explanation, explicitly say that sigma should be **2**, not **1.4** as
written. After building, check the Notes tab: the original board value should
remain visible, and the spoken correction should appear separately rather than
silently replacing it. The generated result must be inspected; this is a plan,
not a claim that the model has already produced that result.

> **Screenshot TODO — Spoken correction:** Capture the Notes table row with
> `σ = 1.4` in **On the board** and the separate correction to `2` in the shaded
> **Correction** cell, with the step number visible.

## 6. Build Notes and Flashcards

With processed photo and audio present, choose **Make notes and flashcards** on
Material. The server makes notes and then flashcards. The build status is shown
while it runs; a completed result opens the **Notes** tab. The server also
requires readable board steps and a nonempty transcript.

> **Screenshot TODO — Build:** Capture the ready board and saved recording with
> the enabled **Make notes and flashcards** control or its in-progress status,
> followed by the generated Notes view after success.

## 7. Review Generated Notes

The **Notes** tab shows a summary and a table with **Step**, **On the board**,
**What you said**, and **Correction**. Board text remains as written; a spoken
correction is displayed in a shaded cell. A step without a saved explanation
shows **Not explained in the recording.**

> **Screenshot TODO — Notes:** Capture the summary and table headings, including
> the sigma row showing `1.4` on the board and the separately shaded correction
> to `2`. Include an unexplained-step fallback if the demonstration has one.

## 8. Study with Flashcards

Open **Study** to review the saved generated cards. Click a card to flip between
question and answer; the card displays its source **Step**. Use **Previous** and
**Next card**, mark it **Got it** or **Still learning**, or select **Only cards I
don't know yet** to load the backend's unknown-card view. **Delete card** asks
for confirmation before deletion. An empty deck shows an explanatory message.

> **Screenshot TODO — Flashcards:** Capture a generated card with its question
> or answer, source step, Previous/Next controls, and Got it/Still learning
> controls. Include the unknown-only filter if it fits legibly.

## 9. Ask the Study Tutor

In **Study**, type a question under **Ask your notes.** and send it. The tutor is
intended to answer from the current session's saved material. It displays the
answer and either source steps or a not-covered indicator. Earlier questions are
available under **Earlier questions**; the current history is limited to the
latest 20.

### Covered Question

For the sigma demonstration, ask: **“What correction was made to sigma?”** The
final evidence should show the submitted question, the actual generated answer,
and **Steps used:** with the relevant board step. Check the answer against the
saved notes; do not assume the model's result in advance.

> **Screenshot TODO — Covered tutor question:** Capture the sigma question, the
> tutor's actual answer, and the visible **Steps used:** line with its step number.

### Uncovered Question

Ask a question deliberately unrelated to the selected board, such as **“What is
the capital of France?”**, provided that fact is absent from the session. Check
that the response reflects the saved material's limits and displays **Not covered
by your material**. The exact generated answer is not prescribed here.

> **Screenshot TODO — Uncovered tutor question:** Capture the unrelated question,
> the actual tutor response, and the **Not covered by your material** indicator.

## 10. Replace Material and Rebuild

### Replace Photo

From Notes, select **Replace photo** to return to Material. Upload or import a
replacement board photo in the same session. When notes already exist, saving
changed material marks them as needing a rebuild.

### Re-record

Select **Re-record** on Notes to return to Material, then make and save a new
microphone recording with **Use this recording**. This replaces the session's
saved processed recording; it does not create another session.

### Rebuild

Return to Notes and choose **Rebuild** to generate notes and cards from the
currently saved material. A successful rebuild replaces the generated card set;
the new cards start as not known, so earlier review marks do not carry over.
These steps still need the final browser pass.

> **Screenshot TODO — Replacement and rebuild:** Capture a sequence showing
> (1) the existing built session, (2) the changed photo or recording and the
> needs-rebuild banner, and (3) rebuilt notes and cards after success. Show the
> same session title and the reset review state where practical.

## 11. Error and Retry Behavior

Use safe, reversible examples during the final pass:

1. **Microphone permission denied:** Start recording and deny access. The source
   displays **Microphone access is blocked. Allow the microphone for this site in
   your browser settings, then try again.** The status includes **Try again**;
   allow access before retrying.
2. **Photos permission or Picker not finished:** If Photos permission is denied,
   the panel displays the authorization error and **Try again**. If import is
   attempted before selection is finished, it displays the server error and
   retains **Open Google Photos** so the user can finish selection, then retry.
3. **Build failure:** If a build fails naturally, the Material or Notes status
   displays the returned message and **Try again**. Do not damage saved data or
   change cloud configuration merely to force an error.

These are source-based expectations, not observations from this draft.

> **Screenshot TODO — Error and retry:** Capture one actual error message and its
> **Try again** control, then capture the subsequent outcome after a safe retry.
> Hide account details and unrelated personal material.

## 12. End-to-End Demonstration Checklist

- [ ] Sign in.
- [ ] Create a session with title and course.
- [ ] Import a board photo, including the Google Photos path when available.
- [ ] Record and save an explanation.
- [ ] Build notes and flashcards.
- [ ] Show `σ = 1.4` on the board and a separate correction to `2`.
- [ ] Review notes.
- [ ] Review flashcards and their source steps.
- [ ] Ask a covered tutor question and show source steps.
- [ ] Ask an uncovered question and show the not-covered indicator.
- [ ] Replace the photo.
- [ ] Re-record the explanation.
- [ ] Rebuild and inspect reset review state.
- [ ] Capture a representative error.
- [ ] Demonstrate its retry behavior.

Final verification fields, to be completed after the browser pass:

- Chrome version:
- Chrome test date:
- Safari version:
- Safari test date:
- Deployed application URL:
- Final screenshot pass completed:
