# Frontend data models

Huda owns the initial plain-JavaScript/JSDoc contracts under issue #3:

- `session.js`: session shape, stored statuses, and temporary operation state.
- `material.js`: one processed photo and one processed recording.
- `note.js`: aligned board step, explanation, and spoken correction.
- `card.js`: question, answer, source step, and known state.
- `question.js`: typed tutor question, answer, coverage, source steps, and time.

The revised model supports one photo, one runtime recording, a free-text course,
numbered source steps, and typed questions per session. Factories assemble these
shapes; they are not runtime validators for untrusted API or model output.

See [frontend data contracts](../../docs/frontend-data-contracts.md) for field
names, serialization, examples, and fixture scenarios. Synthetic workspaces are
created by `src/fixtures/workspaces.js`; no real credentials or student data are
included in their text records. The existing Project 1 image is a thumbnail
stand-in, not evidence that the synthetic text was extracted from that image.
