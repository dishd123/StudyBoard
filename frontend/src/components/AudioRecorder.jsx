// AudioRecorder: records one spoken explanation in the browser and uploads it (issue #43).
// Selects a supported WebM or MP4 format; stops at 3:00; offers playback, Re-record and "Use this recording".
import { useEffect, useRef, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { trackEvent } from '../services/analytics.js';
import { logClientEvent } from '../services/clientLogger.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

const maxSeconds = 180; // 3 minutes, the longest recording the backend accepts

// Formats the browser can record, best first: Chrome and Edge record WebM/Opus, Safari records MP4.
const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

// Shown when the browser can record none of those formats.
const unsupportedMessage = 'This browser cannot record audio for StudyBoard. Use Chrome, Edge or Safari.';

/**
 * Picks the first recording format this browser supports.
 * @returns {string} a MIME type, or '' when the browser supports none of them
 */
function pickMimeType() {
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

/**
 * Formats seconds as mm:ss.
 * @param {number} totalSeconds - whole seconds
 * @returns {string} for example "01:05"
 */
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Turns a getUserMedia error into a plain message.
 * @param {DOMException} error - the error from navigator.mediaDevices.getUserMedia
 * @returns {string} the message to show
 */
function describeMicrophoneError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.';
  }
  if (error.name === 'NotFoundError') {
    return 'No microphone was found. Connect a microphone, then try again.';
  }
  return 'The microphone could not start. Close other apps that use it, then try again.';
}

/**
 * The recorder panel.
 * @param {{ sessionId: string, onUploaded: function }} props - onUploaded(session) receives the updated session
 * @returns {JSX.Element}
 */
export default function AudioRecorder({ sessionId, onUploaded }) {
  // 'idle' | 'starting' (waiting for microphone permission) | 'recording' | 'uploading'
  const [phase, setPhase] = useState('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // The finished recording: { blob, url, durationSeconds }, or null.
  const [take, setTake] = useState(null);
  const [status, setStatus] = useState(idleStatus);
  // Refs hold the live recording objects; changing them must not re-render the panel.
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const urlRef = useRef(null);
  // False once the panel has left the page, so a late microphone permission is not used.
  const mountedRef = useRef(false);

  // Recording needs MediaRecorder and getUserMedia; browsers turn getUserMedia off on plain http pages.
  const canRecord = typeof window.MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /** Turns the microphone off, which also removes the browser's recording indicator. */
  function stopMicrophone() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  /** Throws away the current take and frees its playback URL. */
  function discardTake() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setTake(null);
  }

  // When the panel leaves the page (tab switch, sign-out), stop the timer, the recorder and the microphone.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        // No take is needed once the panel is gone.
        recorder.onstop = null;
        recorder.stop();
      }
      stopMicrophone();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, []);

  /**
   * Asks for the microphone and starts recording.
   * @returns {Promise<void>}
   */
  async function startRecording() {
    discardTake();
    const mimeType = pickMimeType();
    if (!mimeType) {
      setStatus({ kind: 'error', text: unsupportedMessage });
      return;
    }
    setPhase('starting');
    setStatus(idleStatus);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      logClientEvent('WARNING', 'microphone_failed', { errorName: error.name });
      trackEvent('error_shown', { operation: 'microphone' });
      setPhase('idle');
      setStatus({ kind: 'error', text: describeMicrophoneError(error), onRetry: startRecording });
      return;
    }
    streamRef.current = stream;
    // The user may have left the tab while the permission prompt was open; release the microphone at once.
    if (!mountedRef.current) {
      stopMicrophone();
      return;
    }
    chunksRef.current = [];
    let recorder;
    try {
      // A browser can still refuse a format that isTypeSupported accepted.
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stopMicrophone();
      setPhase('idle');
      setStatus({ kind: 'error', text: unsupportedMessage });
      return;
    }
    // The browser hands over the recorded audio in pieces; keep every non-empty piece.
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    // The last piece arrives before onstop, so the take is complete here.
    recorder.onstop = () => finishRecording(recorder.mimeType || mimeType);
    recorderRef.current = recorder;
    recorder.start();
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setPhase('recording');
    trackEvent('recording_start');
    // Update the clock 4 times a second, and stop by itself at 3:00.
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= maxSeconds) {
        stopRecording();
      }
    }, 250); // milliseconds
  }

  /** Stops recording; the recorder then fires onstop, which builds the take. */
  function stopRecording() {
    clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  /**
   * Builds the playable take from the recorded pieces.
   * @param {string} type - the recording's MIME type, sent later as the upload's Content-Type
   */
  function finishRecording(type) {
    // The recorder also stops by itself when the microphone track ends (unplugged or permission removed).
    clearInterval(timerRef.current);
    stopMicrophone();
    recorderRef.current = null;
    setPhase('idle');
    const blob = new Blob(chunksRef.current, { type });
    if (blob.size === 0) {
      setStatus({ kind: 'error', text: 'No sound was recorded.', onRetry: startRecording });
      return;
    }
    const durationSeconds = Math.min(maxSeconds, Math.round((Date.now() - startedAtRef.current) / 1000));
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    setTake({ blob, url, durationSeconds });
  }

  /**
   * Sends the take to the server, which transcribes it with Gemini and saves only the text.
   * @returns {Promise<void>}
   */
  async function uploadTake() {
    trackEvent('recording_submit', { duration_seconds: take.durationSeconds });
    setPhase('uploading');
    setStatus({ kind: 'working', text: 'Listening to your explanation...' });
    try {
      const result = await api.uploadRecording(sessionId, take.blob, take.durationSeconds);
      trackEvent('audio_process_success');
      discardTake();
      setStatus({ kind: 'success', text: 'Your explanation was saved.' });
      onUploaded(result.session);
    } catch (error) {
      trackEvent('audio_process_fail');
      trackEvent('error_shown', { operation: 'audio_upload' });
      setStatus({ kind: 'error', text: error.message, onRetry: uploadTake });
    }
    setPhase('idle');
  }

  // The first button starts, stops or redoes a recording; its label follows the phase.
  let recordLabel = 'Start recording';
  if (phase === 'starting') {
    recordLabel = 'Waiting for the microphone...';
  } else if (take) {
    recordLabel = 'Re-record';
  }

  return (
    <section className="workspace-panel h-auto mb-4" aria-labelledby="recorder-heading">
      <p className="eyebrow">ONE SPOKEN EXPLANATION</p>
      <h2 id="recorder-heading">Record your explanation</h2>
      <p>Explain the board out loud, step by step. Recording stops by itself after 3 minutes.</p>
      {!canRecord && (
        <p>This browser cannot record here. Use Chrome, Edge or Safari, and open StudyBoard from its https address.</p>
      )}
      {phase === 'recording' && (
        <p className="recording-indicator">
          <span className="recording-dot" aria-hidden="true"></span>
          Recording <span role="timer">{formatTime(elapsedSeconds)}</span>
        </p>
      )}
      <div className="material-actions">
        {phase === 'recording' ? (
          <button type="button" className="btn btn-outline-dark" onClick={stopRecording}>Stop recording</button>
        ) : (
          <button type="button" className="btn btn-outline-dark" onClick={startRecording} disabled={!canRecord || phase !== 'idle'}>
            {recordLabel}
          </button>
        )}
        {take && (
          <button type="button" className="btn btn-primary" onClick={uploadTake} disabled={phase !== 'idle'}>
            Use this recording
          </button>
        )}
      </div>
      {take && (
        <audio className="w-100" controls src={take.url}>
          Your browser cannot play this recording.
        </audio>
      )}
      <StatusMessage status={status} />
    </section>
  );
}
