// BoardPreview: the saved board photo in the Project 1 "LATEST BOARD" panel (issue #161).
// Shows the thumbnail, the title, the numbered steps Gemini read, and the parts it could not read.

// Only these data URLs are safe as an image src; the server builds them from stored image bytes.
const safeImagePattern = /^data:image\/(jpeg|png|webp);base64,/;

/**
 * The board photo panel.
 * @param {{ photo: object|null }} props - session.photo from the API, or null before the first import
 * @returns {JSX.Element}
 */
export default function BoardPreview({ photo }) {
  if (!photo) {
    return (
      <section className="workspace-panel board-panel h-auto mb-4">
        <p className="eyebrow">LATEST BOARD</p>
        <h2>No board photo yet</h2>
        <p>Choose a photo of your whiteboard or notes in Google Photos. StudyBoard reads the steps written on it.</p>
      </section>
    );
  }

  const title = photo.title || 'Board photo';
  // The thumbnail can be null when the photo was too large to keep a copy of.
  const showThumbnail = typeof photo.thumbnail === 'string' && safeImagePattern.test(photo.thumbnail);
  const importedAt = new Date(photo.importedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <section className="workspace-panel board-panel h-auto mb-4">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LATEST BOARD</p>
          <h2>{title}</h2>
        </div>
      </div>
      {showThumbnail && (
        <div className="board-preview">
          <img className="board-photo" src={photo.thumbnail} alt={`Photo of the board: ${title}`} />
        </div>
      )}
      <div className="board-meta">
        <span>Imported {importedAt}</span>
        <span className="tag">{photo.steps.length} steps found</span>
      </div>
      <h3 className="material-subheading">Steps on the board</h3>
      {/* value shows the saved step number, the same number the Notes table and the flashcards use. */}
      <ol className="material-steps">
        {photo.steps.map((step) => (
          <li key={step.number} value={step.number}>{step.text}</li>
        ))}
      </ol>
      {photo.unreadable.length > 0 && (
        <aside className="material-unreadable" aria-label="Parts of the board that could not be read">
          <h3>Parts we could not read</h3>
          <ul>
            {photo.unreadable.map((part, index) => (
              <li key={index}>{part}</li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}