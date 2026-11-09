export const notesPreviewNames = Object.freeze(['aligned', 'unmatched', 'conflict']);

/** Development snapshots only; apply once at initialization, never after edits. */
export function createNotesPreview(workspace, requested = 'aligned') {
  const preview = structuredClone(workspace);
  const mode = notesPreviewNames.includes(requested) ? requested : 'aligned';
  const session = preview.sessions.find((item) => item.status === 'ready' && item.notes.length && item.photo?.steps.length);
  if (!session || mode === 'aligned') return preview;

  if (mode === 'unmatched') {
    // Show both a completely missing note and an explicitly unmatched explanation.
    const firstStep = session.photo.steps[0].step;
    session.notes = session.notes.filter((note) => note.step !== firstStep);
    if (session.notes.length) session.notes[session.notes.length - 1].explanation = null;
    session.summary = 'This sample contains incomplete alignment. Missing explanations remain visible beside the written board steps.';
  } else if (session.notes.some((note) => note.correction)) {
    // Reuse the saved sigma correction; do not fabricate a new contradiction.
    session.summary = 'This sample includes an explicit spoken correction. Compare the written value with the spoken replacement before reviewing.';
  }
  return preview;
}
