// NotesTab: the saved notes of one session, each board step next to what was said about it (issue #55).
// Shows the summary, a Step | On the board | What you said | Correction table, and Rebuild, Replace photo, Re-record.
import { useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { trackEvent } from '../services/analytics.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

/**
 * The Notes tab.
 * @param {{ session: object, onRebuild: function, onGoToMaterial: function }} props
 *   onRebuild() returns a promise that rejects with an ApiError when the build fails;
 *   onGoToMaterial() switches to the Material tab
 * @returns {JSX.Element}
 */
export default function NotesTab({ session, onRebuild, onGoToMaterial }) {
  const [status, setStatus] = useState(idleStatus);
  const notes = session.notes || [];
  // A rebuild runs the agents again on the saved photo steps and transcript.
  const canRebuild = Boolean(session.photo && session.audio);

  /**
   * Builds the notes and flashcards again.
   * @returns {Promise<void>}
   */
  async function rebuild() {
    setStatus({ kind: 'working', text: 'Rebuilding your notes and flashcards. This can take up to a minute...' });
    try {
      await onRebuild();
      setStatus({ kind: 'success', text: 'Your notes and flashcards were rebuilt.' });
    } catch (error) {
      trackEvent('error_shown', { operation: 'rebuild' });
      setStatus({ kind: 'error', text: error.message, onRetry: rebuild });
    }
  }

  return (
    <section className="workspace-panel h-auto" aria-labelledby="notes-heading">
      <p className="eyebrow">YOUR NOTES</p>
      <h2 id="notes-heading">The board and its explanation.</h2>
      {notes.length === 0 ? (
        <p>No notes yet. Add a board photo and a recording on the Material tab, then click Make notes and flashcards.</p>
      ) : (
        <>
          <p className="notes-summary">{session.summary}</p>
          {/* The wrapper scrolls sideways on small screens instead of squeezing the table. */}
          <div className="notes-table-scroll" role="region" aria-label="Notes table" tabIndex={0}>
            <table className="notes-table">
              <caption>Board text stays as written. A shaded cell is a spoken correction.</caption>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">On the board</th>
                  <th scope="col">What you said</th>
                  <th scope="col">Correction</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.stepNumber}>
                    <th scope="row">{note.stepNumber}</th>
                    <td>{note.boardText}</td>
                    <td>{note.explanation || 'Not explained in the recording.'}</td>
                    <td className={note.correction ? 'note-correction' : undefined}>{note.correction || 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="material-actions">
        <button type="button" className="btn btn-primary" onClick={rebuild} disabled={!canRebuild || status.kind === 'working'}>Rebuild</button>
        <button type="button" className="btn btn-outline-dark" onClick={onGoToMaterial}>Replace photo</button>
        <button type="button" className="btn btn-outline-dark" onClick={onGoToMaterial}>Re-record</button>
      </div>
      <StatusMessage status={status} />
    </section>
  );
}