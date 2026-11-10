# Project 2 ignore rules — issue #18

Owner: Huda Joad. Related issue: [#18](https://github.com/dishd123/StudyBoard/issues/18).
Checked on November 9, 2026 (America/Los_Angeles), against baseline `0a124cc`.

## Existing coverage and change

The rules already ignore dependencies, build output, local environment files,
common credential filenames, runtime uploads/recordings, logs, and verification
output. Venkatesh's issue #44 supplied most of that coverage before this issue.
Patterns without a leading slash apply inside both `frontend/` and `backend/`.

Issue #18 adds `tmp/`, `temp/`, `.tmp/`, `*.tmp`, and `*.temp` so temporary image
work is covered alongside audio. Images are not globally ignored: bundled
frontend images and documentation/screenshots must remain trackable.

The environment-template exceptions remain: `.env.example`, `.env.*.example`,
`.env.template`, and `.env.*.template`. They apply within child packages too.
These exceptions allow safe examples to be committed; they do not verify their
contents. Issue #17 remains responsible for supplying placeholder-only examples.

## Verification evidence

Codex used the actual Git ignore matcher with synthetic path names. No sample
credential, media, or environment files were created. `--no-index` checked the
rules independently of whether a path already exists or is tracked.

| Requirement | Representative checked paths | Result |
| --- | --- | --- |
| Dependency directories | `node_modules/example/index.js`, `frontend/node_modules/example/index.js`, `backend/node_modules/example/index.js` | Ignored. |
| Build output | `dist/index.html`, `frontend/dist/app/index.html`, `backend/dist/server.js` | Ignored. |
| Local environment | `.env`, `.env.local`, `frontend/.env.local`, `backend/.env.production` | Ignored. |
| Common local credentials | `.aws/credentials`, `backend/credentials.json`, `backend/serviceAccountKey.json`, `backend/project-firebase-adminsdk-example.json`, local `.pem`/`.key` | Ignored. |
| Temporary images | `uploads/board.jpg`, `backend/uploads/board.png`, `backend/tmp/board.jpg`, `frontend/temp/preview.png`, `.tmp/board.jpeg`, `backend/photo.jpg.tmp`, `frontend/preview.png.temp` | Ignored. |
| Recording files | `recordings/explanation.webm`, `backend/explanation.wav`, `frontend/recording.webm` | Ignored. |
| Verification output | `frontend/coverage/index.html`, `backend/test-results/report.json` | Ignored. |
| Safe configuration examples | Root `.env.example`, `.env.template`, `.env.local.example`; frontend/backend `.env.example`; frontend `.env.development.example` | Trackable. |
| Required frontend images/evidence | `frontend/public/images/home-hero.jpg`, `frontend/public/images/app-board.jpg`, `docs/images/audit-home.jpg`, `docs/images/issue-10-login-desktop.png` | Trackable. |
| Source and lockfiles | Frontend/backend package locks, `frontend/src/fixtures/workspaces.js`, this document | Trackable. |

Summary:

```text
PASS: 28 ignored path checks.
PASS: 14 trackable path checks.
PASS: no currently tracked file matches an ignore rule.
PASS: git diff --check.
```

The tracked-file check used `git ls-files` with the same ignore matcher. It found
no tracked path that should be removed from the index under these rules. This
is a path-pattern check, not a scan of file contents or a credential-history
audit. Gitignore does not remove files that were previously committed.

## Huda's review

From the repository root, inspect the actual matching patterns:

```bash
git check-ignore --no-index -v frontend/.env.local backend/tmp/board.jpg frontend/dist/index.html
git check-ignore --no-index -v frontend/.env.example docs/images/issue-10-login-desktop.png
git diff -- .gitignore
```

The first command should show ignore patterns. In verbose output an example
file can show a matching `!` exception; that means it is allowed, not ignored.
A normal evidence image should show no match. Without verbose output,
`git check-ignore --no-index --quiet PATH` returns zero for an ignored path and
one for a trackable path.

No frontend behavior or dependency changed. The dedicated PR should include
`.gitignore`, this evidence, and `Closes #18`; no application rebuild is required
to verify ignore-pattern changes.
