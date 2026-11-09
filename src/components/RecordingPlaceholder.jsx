import React, { useId } from 'react';
import StatusMessage from './StatusMessage.jsx';

/** Venkatesh's runtime recorder will replace this explicitly labelled sample slot. */
export default function RecordingPlaceholder({ audio, disabled, onUseSample, onClear }) {
  const headingId = useId();
  return (
    <section className="workspace-panel" aria-labelledby={headingId}>
      <p className="eyebrow">ONE SPOKEN EXPLANATION</p>
      <h2 id={headingId}>Recording</h2>
      <p>The browser recorder will appear here with a three-minute limit. This preview does not access your microphone or contain an audio file.</p>
      <button type="button" className="btn btn-outline-dark" disabled>Record explanation</button>
      <StatusMessage
        status={audio ? 'success' : 'empty'}
        message={audio ? `Sample recording result available (${audio.length} seconds).` : 'No recording result yet. Use a sample result to preview the next step.'}
      />
      <div className="material-actions">
        <button type="button" className="btn btn-outline-dark" data-material-target="recording" onClick={onUseSample} disabled={disabled}>{audio ? 'Replace sample recording result' : 'Use sample recording result'}</button>
        {audio && <button type="button" className="btn btn-outline-dark" onClick={onClear} disabled={disabled}>Clear sample recording result</button>}
      </div>
      {audio && (
        <details className="material-transcript">
          <summary>Sample transcript and tagged points</summary>
          <p>{audio.transcript}</p>
          <ul>
            {audio.points.map((point, index) => <li key={index}><strong>{point.kind}:</strong> {point.text}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
