import React, { useEffect, useId, useRef, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';

const maxRecordingSeconds = 180;
const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function createRecorder(stream) {
  const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
    ? mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) : '';
  if (mimeType) {
    try {
      return new MediaRecorder(stream, { mimeType });
    } catch {
      // A supported type can still fail at construction; try the browser default.
    }
  }
  return new MediaRecorder(stream);
}

function formatTime(seconds) {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function clearTimers(capture) {
  clearInterval(capture.interval);
  clearTimeout(capture.timeout);
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function releaseCapture(capture) {
  if (!capture) return;
  clearTimers(capture);
  const recorder = capture.recorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } finally {
      stopTracks(capture.stream);
    }
  } else {
    stopTracks(capture.stream);
  }
}

export default function AudioRecorder({ disabled = false, onUseRecording }) {
  const headingId = useId();
  const captureRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recording, setRecording] = useState(null);
  const [error, setError] = useState('');
  const [used, setUsed] = useState(false);
  const supported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => () => {
    const capture = captureRef.current;
    // Invalidate pending permission requests and queued recorder events first.
    captureRef.current = null;
    releaseCapture(capture);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  function failRecording(capture, message) {
    if (captureRef.current !== capture) return;
    captureRef.current = null;
    releaseCapture(capture);
    setPhase('idle');
    setError(message);
  }

  function stopRecording() {
    const capture = captureRef.current;
    if (!capture?.recorder || capture.duration !== undefined) return;
    capture.duration = Math.min(maxRecordingSeconds, (performance.now() - capture.startedAt) / 1000);
    clearTimers(capture);
    setElapsedSeconds(capture.duration);
    setPhase('stopping');
    try {
      if (capture.recorder.state !== 'inactive') capture.recorder.stop();
      stopTracks(capture.stream);
    } catch {
      failRecording(capture, 'Unable to finish this recording. Please record it again.');
    }
  }

  async function startRecording() {
    if (disabled || !supported || captureRef.current) return;
    const capture = { chunks: [] };
    captureRef.current = capture;
    setPhase('requesting');
    setError('');
    setUsed(false);
    setElapsedSeconds(0);
    setRecording(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (captureRef.current !== capture) {
        stopTracks(stream);
        return;
      }
      capture.stream = stream;
      const recorder = createRecorder(stream);
      capture.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (captureRef.current === capture && event.data.size > 0) capture.chunks.push(event.data);
      };
      recorder.onerror = () => failRecording(capture, 'Audio recording was interrupted. Please try again.');
      recorder.onstop = () => {
        if (captureRef.current !== capture) return;
        const duration = capture.duration ?? Math.min(maxRecordingSeconds, (performance.now() - capture.startedAt) / 1000);
        const blob = new Blob(capture.chunks, { type: recorder.mimeType || capture.chunks[0]?.type || '' });
        captureRef.current = null;
        releaseCapture(capture);
        if (!blob.size) {
          setPhase('idle');
          setError('No audio was captured. Please record again and speak into your microphone.');
          return;
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setRecording({ blob, url, duration });
        setElapsedSeconds(duration);
        setPhase('ready');
      };

      recorder.start();
      capture.startedAt = performance.now();
      setPhase('recording');
      capture.interval = setInterval(() => {
        const seconds = (performance.now() - capture.startedAt) / 1000;
        setElapsedSeconds(Math.min(maxRecordingSeconds, seconds));
        if (seconds >= maxRecordingSeconds) stopRecording();
      }, 250);
      capture.timeout = setTimeout(stopRecording, maxRecordingSeconds * 1000);
    } catch (err) {
      const message = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
        ? 'Microphone access was denied. Allow access in your browser settings, then click Record again.'
        : err?.name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone and try again.'
          : err?.name === 'NotReadableError'
            ? 'The microphone is unavailable. Close other apps using it and try again.'
            : 'Unable to start audio recording. Check your microphone and try again.';
      failRecording(capture, message);
    }
  }

  function useRecording() {
    if (disabled || !recording || typeof onUseRecording !== 'function') return;
    onUseRecording(recording.blob, { mimeType: recording.blob.type, duration: recording.duration });
    setUsed(true);
  }

  const pending = phase === 'requesting' || phase === 'stopping';
  return (
    <section className="workspace-panel h-auto" aria-labelledby={headingId}>
      <p className="eyebrow">ONE SPOKEN EXPLANATION</p>
      <h2 id={headingId}>Recording</h2>
      <p>Record a spoken explanation of your board or notes. Recording automatically stops after three minutes.</p>
      <p>Microphone access is requested when you click Record. Audio stays in this browser; processing is not connected yet.</p>
      <div className="material-actions">
        {phase === 'recording' ? (
          <button type="button" className="btn btn-outline-dark" data-material-target="recording" onClick={stopRecording}>
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-outline-dark"
            data-material-target="recording"
            onClick={startRecording}
            disabled={disabled || !supported || pending}
          >
            {phase === 'requesting' ? 'Waiting for microphone access...' : phase === 'stopping' ? 'Finishing recording...' : recording ? 'Re-record' : 'Record explanation'}
          </button>
        )}
        {recording && (
          <button type="button" className="btn btn-primary" onClick={useRecording} disabled={disabled || typeof onUseRecording !== 'function'}>
            Use this recording
          </button>
        )}
      </div>
      <StatusMessage
        status={!supported ? 'error' : error ? 'error' : phase === 'requesting' ? 'loading' : 'idle'}
        message={!supported ? 'Audio recording requires a supported browser on HTTPS or localhost, with microphone access available.' : error || 'Allow microphone access in your browser to begin recording.'}
      />
      <StatusMessage
        status={phase === 'recording' || phase === 'stopping' ? 'loading' : recording ? 'success' : 'idle'}
        message={phase === 'recording' ? 'Recording in progress.' : phase === 'stopping' ? 'Finishing recording...' : used ? 'Recording captured locally. Audio processing will be available after backend integration.' : 'Recording ready. Play it back, re-record, or use this recording.'}
      />
      {(phase === 'recording' || phase === 'stopping' || recording) && (
        <p role="timer" aria-label="Recording duration">{formatTime(elapsedSeconds)} / 3:00</p>
      )}
      {recording && (
        <audio className="w-100" controls src={recording.url} aria-label="Recorded explanation">
          Your browser does not support audio playback.
        </audio>
      )}
    </section>
  );
}
