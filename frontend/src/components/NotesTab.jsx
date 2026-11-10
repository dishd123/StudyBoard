import React, { useId } from 'react';
import AlignedNotesPanel from './AlignedNotesPanel.jsx';
import StatusMessage from './StatusMessage.jsx';

export default function NotesTab({ session, operation, onEditMaterial }) {
  const headingId = useId();
  const steps = session.photo?.steps ?? [];
  const pending = operation?.status === 'processing';
  const hasNotes = session.notes.length > 0;
  const unreadableParts = session.photo?.unreadableParts ?? [];
  const feedbackStatus = pending ? 'loading' : session.status === 'failed' ? 'service-error'
    : hasNotes ? 'idle' : 'empty';
  const feedbackMessage = pending ? 'Sample processing is pending. Saved explanations are not available yet.'
    : session.status === 'failed' ? session.errorMessage || 'Notes could not be built. Review the material and try again.'
      : !session.photo || !session.audio ? 'Add one photo and one recording result in Material before building notes.'
        : 'No aligned notes yet. Open Material to review the inputs and preview rebuilding.';

  return (
    <div className="notes-tab">
      <section className="workspace-panel notes-overview" aria-labelledby={headingId}>
        <p className="eyebrow">ALIGNED NOTES · SAMPLE DATA</p>
        <h2 id={headingId}>The board and its explanation.</h2>
        <p>This view uses saved sample results. It does not generate or edit notes.</p>
        <h3>Session summary</h3>
        {session.summary ? <p className="notes-summary">{session.summary}</p> : <p>No summary has been generated yet.</p>}
        <StatusMessage status={feedbackStatus} message={feedbackMessage} />
        <div className="material-actions">
          <button type="button" className="btn btn-outline-dark" onClick={() => onEditMaterial('photo')}>Replace Photo</button>
          <button type="button" className="btn btn-outline-dark" onClick={() => onEditMaterial('recording')}>Re-record</button>
          <button type="button" className="btn btn-primary" onClick={() => onEditMaterial('build')}>Rebuild</button>
        </div>
        <p className="notes-action-hint">These controls open the corresponding Material preview. Recording and generation are not connected.</p>
      </section>
      <AlignedNotesPanel steps={steps} notes={session.notes} pending={pending} />
      {unreadableParts.length > 0 && (
        <aside className="notes-unreadable" aria-label="Unreadable board content">
          <h3>Unclear board content</h3>
          <p>These parts were marked unreadable; no missing text has been guessed.</p>
          <ul>{unreadableParts.map((part, index) => <li key={index}>{part}</li>)}</ul>
        </aside>
      )}
    </div>
  );
}
