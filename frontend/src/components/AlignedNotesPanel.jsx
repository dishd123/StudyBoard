import React, { useId } from 'react';
import StatusMessage from './StatusMessage.jsx';

/** Read-only saved alignment. Never infer explanations or rewrite board text. */
export default function AlignedNotesPanel({ steps = [], notes = [], pending = false }) {
  const headingId = useId();
  const noteByStep = new Map(notes.map((note) => [note.step, note]));
  const hasNotes = notes.length > 0;
  const rows = steps.map((step) => {
    const note = noteByStep.get(step.step);
    const explanation = typeof note?.explanation === 'string' ? note.explanation.trim() : '';
    const correction = typeof note?.correction === 'string' ? note.correction.trim() : '';
    const alignment = pending ? 'pending' : !hasNotes ? 'not-generated'
      : !explanation ? 'unmatched' : correction ? 'corrected' : 'aligned';
    const missingExplanation = pending ? 'Waiting for generated notes.'
      : !hasNotes ? 'No explanation has been generated yet.'
        : note ? 'No matching explanation was saved for this step.'
          : 'No aligned note was saved for this board step.';
    return { step, explanation, correction, alignment, missingExplanation };
  });
  const correctionCount = rows.filter((row) => row.correction).length;
  const unmatchedCount = rows.filter((row) => row.alignment === 'unmatched').length;

  return (
    <section className="workspace-panel notes-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>Step-by-step notes</h2>
      {steps.length === 0 ? (
        <StatusMessage status="empty" message="No board steps are available yet. Add a photo in Material first." />
      ) : (
        <>
          <p className="notes-counts">{rows.length} steps · {correctionCount} spoken corrections · {unmatchedCount} unmatched explanations</p>
          <div className="notes-table-scroll" role="region" aria-label="Scrollable aligned notes table" tabIndex={0}>
            <table className="notes-table">
              <caption>Written board text is preserved. Shaded rows show spoken corrections separately.</caption>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Board text</th>
                  <th scope="col">Spoken explanation</th>
                  <th scope="col">Correction</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ step, explanation, correction, alignment, missingExplanation }) => (
                  <tr key={step.step} className={correction ? 'notes-row--corrected' : undefined} data-alignment={alignment}>
                    <th scope="row">Step {step.step}</th>
                    <td>{step.text}</td>
                    <td>
                      {explanation || <span className="notes-unmatched">{missingExplanation}</span>}
                      {alignment === 'unmatched' && <span className="notes-flag">Unmatched</span>}
                    </td>
                    <td>
                      {correction ? <><span className="notes-flag notes-flag--correction">Spoken correction</span><p>{correction}</p></>
                        : <span className="notes-no-correction">No correction recorded.</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
