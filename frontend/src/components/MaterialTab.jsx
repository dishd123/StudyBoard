import React, { useEffect, useRef, useState } from 'react';
import PhotoImportPanel from './PhotoImportPanel.jsx';
import AudioRecorder from './AudioRecorder.jsx';
import StatusMessage from './StatusMessage.jsx';
import { createSamplePhoto } from '../fixtures/materialPreview.js';

export default function MaterialTab({ session, focusTarget, onPhotoChange, onAudioChange, onMockRebuild }) {
  const materialRef = useRef(null);
  const [photoState, setPhotoState] = useState(session.photo ? 'ready' : 'empty');
  const [selection, setSelection] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildFeedback, setBuildFeedback] = useState({
    status: session.errorMessage ? 'error' : 'idle', message: session.errorMessage ?? ''
  });
  const timer = useRef(null);
  const photoFailOnce = useRef(import.meta.env.DEV && new URLSearchParams(window.location.search).get('photoFailOnce') === '1');
  const buildFailOnce = useRef(import.meta.env.DEV && new URLSearchParams(window.location.search).get('buildFailOnce') === '1');
  const busy = photoState === 'processing' || building;
  const canBuild = photoState === 'ready' && Boolean(session.photo && session.audio);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!['photo', 'recording', 'build'].includes(focusTarget)) return;
    const target = materialRef.current?.querySelector(`[data-material-target="${focusTarget}"]`);
    target?.focus();
    target?.scrollIntoView({ block: 'center' });
  }, [focusTarget]);

  function resetBuildFeedback() {
    setBuildFeedback({ status: 'idle', message: '' });
  }

  function selectPhoto() {
    if (busy) return;
    setSelection(createSamplePhoto(session));
    setPhotoState('selected');
    setPhotoError('');
    resetBuildFeedback();
  }

  function cancelPhoto() {
    clearTimeout(timer.current);
    setSelection(null);
    setPhotoState(session.photo ? 'ready' : 'empty');
    setPhotoError('');
  }

  function importPhoto() {
    if (!selection || busy) return;
    setPhotoState('processing');
    timer.current = setTimeout(() => {
      try {
        if (photoFailOnce.current) {
          photoFailOnce.current = false;
          throw new Error('Preview failure');
        }
        onPhotoChange(selection);
        setSelection(null);
        setPhotoState('ready');
        setPhotoError('');
      } catch {
        setPhotoState('failed');
        setPhotoError('The sample photo import failed. Try again or cancel the selection.');
      }
    }, 800);
  }

  function changeAudio(audio) {
    if (busy) return;
    onAudioChange(audio);
    resetBuildFeedback();
  }

  function useRecording(_blob, { duration }) {
    // Only a safe placeholder enters session state; the recorder owns raw audio.
    changeAudio({
      transcript: 'Recording captured locally. Audio processing will be available after backend integration.',
      points: [],
      length: duration
    });
  }

  function rebuild() {
    if (!canBuild || busy) return;
    setBuilding(true);
    timer.current = setTimeout(() => {
      try {
        if (buildFailOnce.current) {
          buildFailOnce.current = false;
          throw new Error('Preview failure');
        }
        onMockRebuild();
        setBuildFeedback({ status: 'success', message: 'Preview rebuild completed. This preview did not generate or save notes and flashcards.' });
      } catch {
        setBuildFeedback({ status: 'error', message: 'The preview rebuild failed. Try again.' });
      } finally {
        setBuilding(false);
      }
    }, 800);
  }

  const missingMessage = !session.photo && !session.audio
    ? 'Add one photo and one recording result before building.'
    : photoState !== 'ready' ? 'Finish selecting and importing a photo before building.'
      : 'Add a recording result before building.';

  return (
    <div ref={materialRef} className="material-tab">
      <p className="workspace-demo-notice">Photo import and study-material building use samples. Recording uses your microphone only when you click Record; audio processing is not connected.</p>
      <div className="row g-4">
        <div className="col-lg-7">
          <PhotoImportPanel
            photo={session.photo}
            selection={selection}
            status={photoState}
            error={photoError}
            disabled={busy}
            onSelect={selectPhoto}
            onImport={importPhoto}
            onCancel={cancelPhoto}
          />
        </div>
        <div className="col-lg-5">
          <AudioRecorder disabled={busy} onUseRecording={useRecording} />
          {session.audio && (
            <div className="mt-3">
              <p>Accepted recording result: {Math.round(session.audio.length)} seconds. Playback is available only while this tab remains open.</p>
              <details className="material-transcript">
                <summary>Recording result (preview)</summary>
                <p>{session.audio.transcript}</p>
                <ul>
                  {session.audio.points.map((point, index) => <li key={index}><strong>{point.kind}:</strong> {point.text}</li>)}
                </ul>
              </details>
              <button type="button" className="btn btn-outline-dark mt-3" disabled={busy} onClick={() => changeAudio(null)}>Clear recording result</button>
            </div>
          )}
        </div>
      </div>
      <section className="workspace-panel material-build" aria-label="Build study material" data-material-target="build" tabIndex={-1}>
        <h2>Make notes and flashcards</h2>
        <p>Preview the build action after one photo result and one recording result are ready.</p>
        <StatusMessage status={!canBuild && !busy ? 'empty' : 'idle'} message={missingMessage} />
        <StatusMessage
          status={building && buildFeedback.status !== 'error' ? 'loading' : buildFeedback.status}
          message={building ? 'Running the preview rebuild…' : buildFeedback.message}
          onRetry={buildFeedback.status === 'error' && canBuild ? rebuild : undefined}
          isRetrying={building && buildFeedback.status === 'error'}
        />
        <button type="button" className="btn btn-primary" disabled={!canBuild || busy} onClick={rebuild}>Make notes and flashcards (preview)</button>
      </section>
    </div>
  );
}
