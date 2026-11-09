# Project 2 frontend workspace structure

Owner: Huda Joad. Related issue: [#2](https://github.com/dishd123/StudyBoard/issues/2).

## Entry points and component tree

The existing Vite entry points and static pages are retained. The `frontend/`
directory relocation is tracked separately under issue #15.

```text
src/
  SiteNav.jsx                    Shared React site navigation
  app/
    main.jsx                     CSS import and React root mounting
    App.jsx                      Selected session and dashboard/workspace state
  login/
    main.jsx                     Existing mock Sign In/Create Account entry point
  pages/
    Dashboard.jsx                Sample-session selection and existing overview
    SessionWorkspace.jsx         Back action and Material/Notes/Study navigation
  components/
    SessionCard.jsx              Select a sample session
    SessionList.jsx              Filtered session list and empty state (#6)
    SessionDialog.jsx            Local New/Rename/Delete dialogs (#6)
    StatusMessage.jsx            Shared accessible feedback (#5)
    BoardPreview.jsx             Labelled Project 1 sample image
    FlashcardDeck.jsx            Existing sample flip/Previous/Next behavior
    TutorPanel.jsx               Typed-question demo acknowledgement
    MaterialTab.jsx              Sample board and disabled integration placeholders
    NotesTab.jsx                 Placeholder for the aligned-notes view
    StudyTab.jsx                 Flashcards and tutor side by side
  services/
    README.md                    API/integration ownership boundary
    apiClient.js                 Shared protected request helper (#4)
  models/
    README.md                    Model ownership and contract documentation
    session.js                   Session and temporary operation shapes
    material.js                  Processed photo/audio shapes
    note.js                      Aligned step/explanation/correction
    card.js                      Card with source step and known state
    question.js                  Typed tutor history record
  fixtures/
    workspaces.js                Synthetic scenarios added under issue #3
```

`app/index.html` still loads `src/app/main.jsx`; `login/index.html` still loads
`src/login/main.jsx`. Home, About, Contact, their `js/site.js` navigation, and
the existing shared `SiteNav.jsx` are unchanged. No client router is added.
Dashboard and session navigation use local React state at `/app/`; refresh
returns to the dashboard and clears demo interactions.

`App` owns local workspace data, course filter, selected sample session, and
whether its workspace is open. `Dashboard` receives selection, mutation, and
filter callbacks. `SessionWorkspace` owns the active
section. Components receive data through props, and no component calls a backend.
Issue #3 replaces the transitional `demoData.js` with independent synthetic
workspace fixtures. Each ready session has its own deck, while the bundled
thumbnail remains a labelled visual stand-in.
The old multiple-board counts, capture/region claims, named-user greeting, and
voice-question control are removed from the preview to match the revised scope.
The actual Firebase sign-in replacement remains issue #27.

## Ownership and follow-up boundaries

Huda owns every initial file/change in this issue. The following are later
integration owners, not additional assignees for issue #2.

| File or boundary | Initial owner | Later work and owner |
| --- | --- | --- |
| `src/app/main.jsx`, `App.jsx` | Huda | Keep root composition separate from feature logic; fixtures are selected under #3. |
| `src/models/*.js`, `src/fixtures/workspaces.js` | Huda | Revised contracts and synthetic fixtures under #3; backend validation and API connection are later work. |
| `src/pages/Dashboard.jsx`, `src/components/SessionCard.jsx`, `SessionList.jsx`, `SessionDialog.jsx` | Huda | Local dashboard actions under #6 and API connection under #36, Huda. |
| `src/pages/SessionWorkspace.jsx` | Huda | Preserve the three-section composition as feature implementations arrive. |
| `src/components/BoardPreview.jsx` | Huda | Real selected-photo preview with Photos integration, Disha; coordinate edits through its own issue. |
| `src/components/MaterialTab.jsx` | Huda | Detailed shell under #7, Huda; recording/build integration under #54, Venkatesh. |
| `src/components/NotesTab.jsx` | Huda | Detailed notes shell under #8, Huda; saved-note integration under #55, Venkatesh. |
| `src/components/StudyTab.jsx`, `FlashcardDeck.jsx` | Huda | Detailed study behavior under #9, Huda; generated-card integration under #56, Venkatesh. |
| `src/components/TutorPanel.jsx` | Huda | Detailed study shell under #9 and real tutor under #57, Huda. |
| `src/services/README.md`, `src/models/README.md` | Huda | API client under #4 and contracts/fixtures under #3, Huda. |
| `css/site.css` workspace additions | Huda | Coordinate future shared-style edits with feature owners. |
| `src/SiteNav.jsx`, `src/login/main.jsx` (unchanged) | Huda | Authentication/navigation integration under #26–28, Huda. |

`NotesTab` is the current shell name; issues referring to NotesPanel should extend
or compose this component rather than create competing views. Services contains
#4's request helper; models contains issue #3's contracts. See
[frontend data contracts](frontend-data-contracts.md) for the current shapes and
fixture URLs. No API client, Firestore schema, agent, recorder, or photo importer
is implemented by the workspace-structure issue. See [dashboard behavior and
evidence](dashboard.md) for issue #6's local session operations.

## Verification checklist

Run `npm run build` from the repository root, then `npm run dev` for manual checks.

| Check | Expected result |
| --- | --- |
| `/`, `/about.html`, `/contact.html` | Existing marketing pages and navigation still load. |
| `/login/` | Existing mock login/account interaction still renders. |
| `/app/` | Dashboard shows labelled sample sessions and the existing overview. |
| Select a different session | Selected styling and preview title change. |
| Open selected session | Session title matches selection; Material is initially shown. |
| Notes | Notes placeholder appears; active-section styling updates. |
| Study | Sample flashcards and typed tutor appear side by side on desktop. |
| Card flip, Previous, Next | Existing local sample-deck interactions work. |
| Submit a typed demo question | Clearly labelled acknowledgement appears without a generated answer. |
| Back to dashboard | Previous session selection is retained. |
| Refresh `/app/` | Returns to the dashboard; no persistence is implied. |
| Narrow viewport and keyboard | Sections wrap; buttons remain reachable and focus is visible. |

## Verification results — issue #2 baseline

Codex ran the following checks on November 8, 2026, using Linux Node
`v22.23.2` for the build and headless Chrome through Playwright for browser
checks. The temporary Vite server used port `4175` to avoid taking over Huda's
development server. No project dependencies or lockfiles were changed.

| Check performed | Result |
| --- | --- |
| `npm run build` | Passed; both React entries built and static pages were copied. |
| Five page routes in the checklist | Passed; HTTP success and navigation rendered. |
| Select Web Systems, open workspace | Passed; workspace heading matched the selected session. |
| Notes and Study navigation | Passed; expected section content rendered. |
| Card flip, Next, Previous | Passed; answer and next question rendered, then navigation returned. |
| Typed demo question | Passed; explicit acknowledgement appeared without claiming an AI answer. |
| Study at 390 × 844 | Passed; no document horizontal overflow. |
| Keyboard activation of Material | Passed; focused section button activated with Enter. |
| Back to dashboard | Passed; Web Systems remained selected. |
| Reload `/app/` | Passed; dashboard rendered again. |
| Browser runtime errors during the workflow | None observed. |
| `git diff --check` | Passed. |

These are issue #2 smoke checks, not the later cross-browser acceptance suite.
Huda can use the checklist above for a visual review on her own dev server and
attach screenshots if desired. Automated frontend test files remain assigned
to issue #12.

## Issue #2 acceptance mapping

| Acceptance criterion | Evidence |
| --- | --- |
| App and Login entry points continue to work. | Unchanged HTML entry paths; successful build and browser route checks. |
| Components have clear ownership boundaries. | Component tree, props/state description, and ownership table above. |
| Home, About, and Contact keep their purpose. | Their source is unchanged; browser route checks passed. |
| Initial shell needs no backend. | Local sample data and React state; no API calls or cloud configuration. |
| File ownership is documented. | Initial ownership and later integration responsibility table above. |

This issue is ready for Huda's review and a dedicated PR with `Closes #2`.
It does not complete the detailed feature issues #3–9 or the relocation in #15.
