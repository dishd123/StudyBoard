# Frontend relocation — issue #15

Owner: Huda Joad. Related issue: [#15](https://github.com/dishd123/StudyBoard/issues/15).
Baseline: `8c87304`, the merge of Phase 0 tests PR #129.

The revised October 19 StudyBoard PDF specifies separate `frontend/` and
`backend/` packages. This change relocates the existing frontend rather than
creating another React app. The UI, fixture data, recorder implementation,
models, API helper, static pages, and images are retained.

Issue #15 precedes #13's deployment scripts because those scripts need the
frontend package to exist. Disha's backend package/server work remains #14/#16.
This issue supplies local frontend commands; it does not add a replacement
server or mark Cloud Run deployment complete.

## Current layout

```text
StudyBoard/
  package.json                  Root command delegates; deployment scripts in #13
  package-lock.json             Root package has no application dependencies
  frontend/
    package.json                Original frontend dependencies and scripts
    package-lock.json           Original locked frontend versions
    vite.config.js              Frontend root, App/Login inputs, static-page copies
    vitest.config.js            Discovers tests/ inside the frontend package
    index.html                  Home
    about.html                  About
    contact.html                Contact
    app/index.html              App React entry
    login/index.html            Login React entry
    src/                        Existing React components, models, fixtures, services
    css/site.css                Existing shared styles
    js/site.js                  Existing static-page navigation/footer/contact script
    public/images/              Existing page/sample images
    tests/                      Phase 0 and recorder suites, with updated imports
    dist/                       Generated build output; ignored by Git
  backend/                      Existing backend package/modules; not relocated
  docs/                         Existing evidence and documentation; not relocated
  DockerContainer/              Retained Project 1 static Apache container
```

| Previous path | Current path | Content change |
| --- | --- | --- |
| `src/`, `css/`, `js/` | `frontend/src/`, `frontend/css/`, `frontend/js/` | Relocation only. |
| `public/images/` | `frontend/public/images/` | Relocation only; images preserved byte-for-byte. |
| Root Home/About/Contact HTML and `app/`, `login/` | Corresponding paths under `frontend/` | Relocation only; public URLs retained. |
| Root frontend `package.json` / lockfile | `frontend/package.json` / lockfile | Original dependencies/scripts/locked versions retained. |
| Root Vite config | `frontend/vite.config.js` | Resolve inputs/copies from the config's own frontend directory. |
| Root Vitest config | `frontend/vitest.config.js` | Explicit frontend root; discover `tests/**/*.test.{js,jsx}`. |
| Existing `frontend/tests/` | Same directory | Imports change from `../../src/` to `../src/`; static navigation import similarly changes to `../js/`. |
| Root package | New thin orchestration package | Retains familiar local commands by delegating to `frontend/`; no React/backend dependencies duplicated here. |

HTML and image paths remain URL paths such as `/src/app/main.jsx`, `/css/site.css`,
and `/images/signin.jpg`; they are resolved within the frontend web root. Do not
change them to `/frontend/...` browser URLs. Existing frontend source imports
stay relative to the same internal tree. The test runner runs inside the
frontend package, so its HTML entry-point checks read the relocated HTML files.

## Install and run

From the repository root:

```bash
npm ci --prefix frontend
npm run dev
```

Use Vite's printed port, normally 5173. These public paths remain reachable:

- `/` — Home.
- `/about.html` — About.
- `/contact.html` — Contact.
- `/app/` — Dashboard and Material/Notes/Study workspace.
- `/login/` — Explicitly labelled authentication previews.

Root commands forward their arguments to the frontend package:

```bash
npm run dev -- --port 5174 --strictPort
npm run test:frontend
npm run build
npm run preview
```

For frontend-only work, the original commands also work inside `frontend/`:

```bash
cd frontend
npm ci
npm run test:frontend
npm run build
```

The frontend owns its dependencies; the backend retains its separate package
and lockfile. Root `npm ci` alone installs neither child package. Backend work
uses `npm ci --prefix backend` and its own scripts. Issue #13 will add the root
`gcp-build` and Express `start` flow; #16 supplies the server that must serve
`frontend/dist/` and `/api` from one origin.

## Build and existing container

`npm run build` produces `frontend/dist/`, including App/Login bundles, the
three static HTML pages, copied CSS/JS, and Vite's copied public images.
Older ignored root `dist/` or `node_modules/` folders can remain from previous
local runs; they are not the new build output or required installation target.
Do not deploy the old root `dist/` by accident. Use `frontend/dist/`.

The existing Project 1 [Apache Dockerfile](../DockerContainer/Dockerfile) now
copies the frontend package into its build stage and uses Node 22 and `npm ci`.
Its repository-root build context and final `/build/dist/` copy remain valid.
This preserves the static packaging recipe; it is not the Project 2 Express/API
deployment. No new root Dockerfile or Cloud resource is introduced.

## Documentation and parallel work

The root [README](../README.md) and [test instructions](../frontend/tests/README.md)
describe the current commands. Older frontend feature documents retain their
Phase 0 evidence and filenames: interpret their `src/`, `app/`, `css/`, and
similar frontend paths relative to `frontend/` now. Backend paths do not change.

PR #127 for issue #11 was still open when this relocation began. Its proposed
`docs/ui-state-plan.md` uses the old source link `../src/models/session.js`;
update that to `../frontend/src/models/session.js` when integrating/reviewing
that document, and update its baseline-path note. The pending documentation PR
does not block this relocation and is not treated as merged here.

After this PR merges, feature owners should merge `main` into existing branches
before editing moved frontend files. Resolve imports against `frontend/src/`
and keep the existing frontend components. File ownership is unchanged: Huda
owns this relocation, Disha owns Photos/image integration, and Venkatesh owns
recording/notes/cards integration.

## Verification — November 9, 2026 (America/Los_Angeles)

Codex verified the merged #12 baseline before starting: all 107 frontend tests
passed and the production build passed. The #12 commit `4b22a97` is retained in
`main`; the extra local merge commit on the old #12 branch was not discarded.

After relocation, with Linux Node v22.23.2:

| Check | Result |
| --- | --- |
| `npm ci --prefix frontend --offline --no-audit --no-fund` | Passed using cached locked packages. Normal fresh-checkout command is `npm ci --prefix frontend`. |
| `npm ls --prefix frontend --depth=0` | Passed; frontend dependencies installed in that package. |
| Root `npm run test:frontend` | Passed: 10 files, 107 tests. |
| Root `npm run build` | Passed; generated `frontend/dist/`. |
| Existing frontend source/static pages/assets against baseline | Identical file contents after relocation; config/test path changes documented separately. |
| Existing frontend package and lockfile | Retained without dependency/version changes. |
| Backend source/package against baseline | Unchanged by relocation. |
| Local Markdown links and whitespace | Checked before PR handoff. |
| Actual Docker image build / Cloud Run deployment | Not run by this issue. |

Temporary headless Chrome checks ran against root-command dev server port 4175
and built preview port 4176, leaving Huda's normal dev port alone. Both passed:

- Direct load and reload of all five page routes; expected current-page markers.
- Existing image decoding plus direct CSS/JS/image asset responses, without
  accidental HTML fallback for those assets.
- Home's App launch, course filter, open session, Notes/Study, card flip, and
  Back retaining the filter.
- Login account-preview switch/back and Open app preview.
- Mobile menu activation with Space on all five pages; links visible and no
  document horizontal overflow at 390 × 844.
- No browser runtime errors in those workflows.

These checks validate relocation. They do not establish live Firebase, Gemini,
Firestore, backend integration, deployed authorization, or Safari/Edge behavior.

## Huda's review and PR

1. Run the documented frontend installation, tests, and build from the root.
2. Start Vite and click through the five public routes. Open a session and check
   Material, Notes, and Study; check the mobile menu once.
3. Review the diff: most files should be Git renames; production frontend source
   and static assets should have no content edits.
4. Open a dedicated PR with `Closes #15`, explaining that #15 establishes the
   package layout needed by #13's deployment scripts. Link the passing checks.
5. Have the teammate reviewing PR #127 account for the moved source path above.
