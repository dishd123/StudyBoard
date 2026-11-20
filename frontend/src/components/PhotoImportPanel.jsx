// PhotoImportPanel: imports one board photo from Google Photos in three clicks (issue #42).
// 1) allow Photos access and start a picker, 2) open Google Photos and pick, 3) import the picked photo.
import { useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { requestPhotosToken } from '../services/photosAuth.js';
import { describeAuthError } from '../hooks/useAuth.js';
import { trackEvent } from '../services/analytics.js';
import { logClientEvent } from '../services/clientLogger.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

/**
 * The Google Photos import panel.
 * @param {{ sessionId: string, onImported: function }} props - onImported(session) receives the updated session
 * @returns {JSX.Element}
 */
export default function PhotoImportPanel({ sessionId, onImported }) {
  // After click 1: { pickerUri, photosToken }. The token stays in memory only, until the import ends.
  const [picker, setPicker] = useState(null);
  const [status, setStatus] = useState(idleStatus);

  /**
   * Click 1: asks Google for Photos access, then asks the server for a Picker session.
   * @returns {Promise<void>}
   */
  async function choosePhoto() {
    trackEvent('photo_import_start');
    setStatus({ kind: 'working', text: 'Waiting for Google to allow access to your photos...' });
    let photosToken;
    try {
      // The popup must open inside this click, so this is the first await in the handler.
      photosToken = await requestPhotosToken();
    } catch (error) {
      logClientEvent('WARNING', 'photos_popup_failed', { code: error.code || 'unknown' });
      trackEvent('photo_import_fail');
      trackEvent('error_shown', { operation: 'photos_access' });
      // Try again is a new click, so the browser lets the popup open again.
      setStatus({ kind: 'error', text: describeAuthError(error), onRetry: choosePhoto });
      return;
    }
    setStatus({ kind: 'working', text: 'Starting the Google Photos picker...' });
    try {
      const result = await api.startPicker(sessionId, photosToken);
      // Only ever link to Google Photos itself.
      if (!result.pickerUri.startsWith('https://photos.google.com/')) {
        throw new Error('The picker link was not a Google Photos address.');
      }
      setPicker({ pickerUri: result.pickerUri, photosToken });
      setStatus({ kind: 'success', text: 'Now open Google Photos and pick your board photo.' });
    } catch (error) {
      trackEvent('photo_import_fail');
      trackEvent('error_shown', { operation: 'photos_picker' });
      setStatus({ kind: 'error', text: error.message, onRetry: choosePhoto });
    }
  }

  /**
   * Click 3: asks the server to read the photo the user picked.
   * @returns {Promise<void>}
   */
  async function importPhoto() {
    setStatus({ kind: 'working', text: 'Reading your board photo. This can take up to a minute...' });
    try {
      const result = await api.importPhoto(sessionId, picker.photosToken);
      trackEvent('photo_import_success');
      // The import is done, so drop the link and the Google token.
      setPicker(null);
      setStatus({ kind: 'success', text: 'Your board photo was imported.' });
      onImported(result.session);
    } catch (error) {
      trackEvent('photo_import_fail');
      trackEvent('error_shown', { operation: 'photo_import' });
      // The Open Google Photos link stays, so after a 409 (picking not finished) the user can finish, then try again.
      setStatus({ kind: 'error', text: error.message, onRetry: importPhoto });
    }
  }

  const busy = status.kind === 'working';

  return (
    <section className="workspace-panel h-auto mb-4" aria-labelledby="photo-import-heading">
      <p className="eyebrow">ONE BOARD PHOTO</p>
      <h2 id="photo-import-heading">Import from Google Photos</h2>
      <p>Take a photo of the board, let it sync to Google Photos, then import it here.</p>
      <div className="material-actions">
        <button type="button" className="btn btn-outline-dark" onClick={choosePhoto} disabled={busy}>
          Choose a photo in Google Photos
        </button>
      </div>
      {picker && (
        <>
          {/* A real link (not window.open), so the browser treats it as a normal click on a new tab. */}
          <div className="material-actions">
            <a className="btn btn-outline-dark" href={`${picker.pickerUri}/autoclose`} target="_blank" rel="noopener noreferrer">
              Open Google Photos
            </a>
            <button type="button" className="btn btn-primary" onClick={importPhoto} disabled={busy}>
              Import my picked photo
            </button>
          </div>
          <p className="photo-hint">Use search in the picker to find your board photo.</p>
        </>
      )}
      <StatusMessage status={status} />
    </section>
  );
}