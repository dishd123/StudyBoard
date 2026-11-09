import React, { useId } from 'react';
import StatusMessage from './StatusMessage.jsx';

/** Controlled photo shell. The future Photos integration supplies real callbacks. */
export default function PhotoImportPanel({
  photo, selection, status, error, disabled, onSelect, onImport, onCancel
}) {
  const headingId = useId();
  const preview = selection ?? photo;
  const processing = status === 'processing';
  const hasError = status === 'failed' || Boolean(error);
  const messages = {
    empty: 'No photo selected. Choose a sample photo to preview this step.',
    selected: 'One sample photo is selected. Use it to accept the sample processing result.',
    processing: 'Processing the sample photo. No external service is called.',
    ready: 'One sample photo result is ready.',
    failed: 'The sample photo import failed. Try again or cancel the selection.'
  };
  const feedbackStatus = hasError ? 'service-error' : {
    empty: 'empty', selected: 'idle', processing: 'loading', ready: 'success', failed: 'service-error'
  }[status];

  return (
    <section className="workspace-panel photo-import-panel" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div><p className="eyebrow">ONE BOARD PHOTO</p><h2 id={headingId}>Board photo</h2></div>
        <span className="tag">{status}</span>
      </div>
      <p>Sample preview only. Google Photos access is not connected.</p>
      {preview && (
        <figure className="material-photo-preview">
          <img src={preview.thumbnail} alt={`Sample photo preview: ${preview.title}`} />
          <figcaption>{preview.title} · bundled stand-in image</figcaption>
        </figure>
      )}
      {status === 'selected' && <p>{messages.selected}</p>}
      <StatusMessage
        status={feedbackStatus}
        message={error || messages[status]}
        onRetry={hasError && selection ? onImport : undefined}
        isRetrying={processing && hasError}
      />
      <div className="material-actions">
        {!selection && <button type="button" className="btn btn-outline-dark" onClick={onSelect} disabled={disabled}>{photo ? 'Replace photo' : 'Select sample photo'}</button>}
        {status === 'selected' && <button type="button" className="btn btn-primary" onClick={onImport} disabled={disabled}>Use sample photo</button>}
        {selection && <button type="button" className="btn btn-outline-dark" onClick={onCancel}>{processing ? 'Cancel import' : 'Cancel selection'}</button>}
      </div>
      {status === 'ready' && photo && (
        <>
          <h3 className="material-subheading">Recognized steps (sample)</h3>
          <ol className="material-steps">
            {photo.steps.map((step) => <li key={step.step} value={step.step}>{step.text}</li>)}
          </ol>
          {photo.steps.length === 0 && <StatusMessage status="empty" message="No readable steps are available in this sample photo." />}
          {photo.unreadableParts.length > 0 && (
            <aside className="material-unreadable">
              <h3>Unclear parts</h3>
              <ul>{photo.unreadableParts.map((text, index) => <li key={index}>{text}</li>)}</ul>
            </aside>
          )}
        </>
      )}
    </section>
  );
}
