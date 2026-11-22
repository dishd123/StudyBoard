// MaterialTab: the photo and the recording of one session, and the button that builds the study set (issue #54).
// Shows the photo upload, the Google Photos import, the board preview, the recorder, the saved transcript,
// and "Make notes and flashcards".
import { useState } from 'react';
import PhotoUploadPanel from './PhotoUploadPanel.jsx';
import PhotoImportPanel from './PhotoImportPanel.jsx';
import BoardPreview from './BoardPreview.jsx';
import AudioRecorder from './AudioRecorder.jsx';
import StatusMessage from './StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { auth } from '../services/firebase.js';
import { usesGoogle } from '../hooks/useAuth.js';
import { trackEvent } from '../services/analytics.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

/**
 * The Material tab.
 * @param {{ session: object, onSessionChange: function, onBuilt: function }} props
 *   onSessionChange(session) stores an updated session; onBuilt({ session, cards }) receives a finished build
 * @returns {JSX.Element}
 */
export default function MaterialTab({ session, onSessionChange, onBuilt }) {
  const [buildStatus, setBuildStatus] = useState(idleStatus);
  // The agents need both inputs: the board steps and the spoken explanation.
  const canBuild = Boolean(session.photo && session.audio);

  /**
   * Runs the notes and flashcards agents on the server.
   * @returns {Promise<void>}
   */
  async function buildStudySet() {
    trackEvent('build_start');
    setBuildStatus({ kind: 'working', text: 'Making your notes and flashcards. This can take up to a minute...' });
    try {
      const result = await api.buildStudySet(session.id);
      trackEvent('build_success', { card_count: result.cards.length });
      setBuildStatus(idleStatus);
      // The workspace stores the result and switches to the Notes tab.
      onBuilt(result);
    } catch (error) {
      trackEvent('build_fail');
      trackEvent('error_shown', { operation: 'build' });
      // 502: the server gave up after two attempts and marked the session failed, so show its banner now.
      if (error.status === 502) {
        onSessionChange({ ...session, status: 'failed', errorMessage: error.message });
      }
      setBuildStatus({ kind: 'error', text: error.message, onRetry: buildStudySet });
    }
  }

  let buildHint = 'Add a board photo and a recording first.';
  if (canBuild) {
    buildHint = 'Your photo and recording are ready.';
  }

  return (
    <div className="material-tab">
      <div className="row g-4">
        <div className="col-lg-7">
          <PhotoUploadPanel sessionId={session.id} onUploaded={onSessionChange} />
          {/* Google Photos needs a Google account's permission, so only Google sign-ins get this option. */}
          {usesGoogle(auth.currentUser) ? (
            <details className="material-transcript mb-4">
              <summary>Or import from Google Photos</summary>
              <PhotoImportPanel sessionId={session.id} onImported={onSessionChange} />
            </details>
          ) : (
            <p className="photo-hint mb-4">To import from Google Photos instead, sign in with Google.</p>
          )}
          <BoardPreview photo={session.photo} />
        </div>
        <div className="col-lg-5">
          <AudioRecorder sessionId={session.id} onUploaded={onSessionChange} />
          {session.audio && (
            <section className="workspace-panel h-auto mb-4" aria-labelledby="saved-recording-heading">
              <p className="eyebrow">SAVED RECORDING</p>
              <h2 id="saved-recording-heading">What you explained</h2>
              <p>{session.audio.durationSeconds} seconds. Only this text was kept, not the audio.</p>
              <ul className="point-list">
                {session.audio.points.map((point, index) => (
                  <li key={index}>
                    {/* A spoken correction gets the same shading as the corrections on the Notes tab. */}
                    <span className={point.kind === 'correction' ? 'point-tag note-correction' : 'point-tag'}>{point.kind}</span>
                    {point.text}
                  </li>
                ))}
              </ul>
              <details className="material-transcript">
                <summary>Full transcript</summary>
                <p>{session.audio.transcript}</p>
              </details>
            </section>
          )}
        </div>
      </div>
      <section className="workspace-panel material-build" aria-labelledby="build-heading">
        <h2 id="build-heading">Make notes and flashcards</h2>
        <p>{buildHint}</p>
        <button type="button" className="btn btn-primary" onClick={buildStudySet} disabled={!canBuild || buildStatus.kind === 'working'}>
          Make notes and flashcards
        </button>
        <StatusMessage status={buildStatus} />
      </section>
    </div>
  );
}