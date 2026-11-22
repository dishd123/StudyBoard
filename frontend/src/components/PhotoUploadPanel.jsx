// PhotoUploadPanel: uploads one board photo from this phone or computer (issue #171).
// The browser shrinks the photo into the three JPEG copies the server needs, then sends them in one request.
import { useRef, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { trackEvent } from '../services/analytics.js';
import { logClientEvent } from '../services/clientLogger.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };
// Longest side of each copy, the same sizes the Google Photos import uses.
const copySizes = { photo: 1600, thumbnail: 600, icon: 160 };
const jpegQuality = 0.85; // keeps board writing sharp at a fraction of the original size
// The same events as the Google Photos import; photo_source tells the two apart in Analytics.
const uploadSource = { photo_source: 'upload' };

/**
 * Opens a photo file as an image. Browsers turn the photo upright from its camera data when they decode it.
 * @param {File} file - the photo the user chose
 * @returns {Promise<HTMLImageElement>} the decoded image
 * @throws {Error} when this browser cannot read the file, for example a HEIC photo in Chrome
 */
async function openImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } finally {
    // The decoded image keeps its pixels, so the file's temporary address can go.
    URL.revokeObjectURL(url);
  }
  return image;
}

/**
 * Draws a smaller JPEG copy of an image.
 * @param {HTMLImageElement} image - the decoded photo
 * @param {number} maxPixels - longest side of the copy; a smaller photo keeps its size
 * @returns {Promise<Blob>} the JPEG copy
 * @throws {Error} when the browser cannot make the JPEG
 */
function makeCopy(image, maxPixels) {
  const scale = Math.min(1, maxPixels / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  // White first, so the transparent parts of a PNG do not turn black in the JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('The browser could not make a JPEG copy.'));
      }
    }, 'image/jpeg', jpegQuality);
  });
}

/**
 * The device upload panel.
 * @param {{ sessionId: string, onUploaded: function }} props - onUploaded(session) receives the updated session
 * @returns {JSX.Element}
 */
export default function PhotoUploadPanel({ sessionId, onUploaded }) {
  const [status, setStatus] = useState(idleStatus);
  // The file input stays hidden; the visible button opens it.
  const fileInput = useRef(null);

  /**
   * Shrinks the photo, uploads the three copies, and passes the updated session on.
   * @param {File} file - the photo the user chose
   * @returns {Promise<void>}
   */
  async function uploadPhoto(file) {
    trackEvent('photo_import_start', uploadSource);
    setStatus({ kind: 'working', text: 'Preparing your photo...' });
    const form = new FormData();
    try {
      const image = await openImage(file);
      for (const [name, maxPixels] of Object.entries(copySizes)) {
        form.append(name, await makeCopy(image, maxPixels), `${name}.jpg`);
      }
    } catch {
      logClientEvent('WARNING', 'photo_open_failed', { type: file.type || 'unknown' });
      trackEvent('photo_import_fail', uploadSource);
      trackEvent('error_shown', { operation: 'photo_open' });
      setStatus({ kind: 'error', text: 'This browser cannot open that photo. Choose a JPEG or PNG photo, or try Safari.' });
      return;
    }
    setStatus({ kind: 'working', text: 'Reading your board photo. This can take up to a minute...' });
    try {
      const result = await api.uploadPhoto(sessionId, form);
      trackEvent('photo_import_success', uploadSource);
      setStatus({ kind: 'success', text: 'Your board photo was added.' });
      onUploaded(result.session);
    } catch (error) {
      trackEvent('photo_import_fail', uploadSource);
      trackEvent('error_shown', { operation: 'photo_upload' });
      setStatus({ kind: 'error', text: error.message, onRetry: () => uploadPhoto(file) });
    }
  }

  /**
   * Starts the upload once the user has chosen a photo.
   * @param {Event} event - the change event of the file input
   * @returns {void}
   */
  function handleFileChosen(event) {
    const file = event.target.files[0];
    // Clearing the input lets the user choose the same photo again after an error.
    event.target.value = '';
    if (file) {
      uploadPhoto(file);
    }
  }

  const busy = status.kind === 'working';

  return (
    <section className="workspace-panel h-auto mb-4" aria-labelledby="photo-upload-heading">
      <p className="eyebrow">ONE BOARD PHOTO</p>
      <h2 id="photo-upload-heading">Upload a photo</h2>
      <p>Take a photo of a whiteboard or a handwritten page, or choose one from your phone or computer.</p>
      <div className="material-actions">
        <button type="button" className="btn btn-primary" onClick={() => fileInput.current.click()} disabled={busy}>
          Upload a photo
        </button>
        {/* accept="image/*" opens the photo library or the files; an iPhone also offers its camera, Android does not. */}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFileChosen} />
      </div>
      <StatusMessage status={status} />
    </section>
  );
}