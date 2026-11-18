// SessionCard: one study session in the Dashboard list, in the Project 1 card style (issue #6).
// Shows the board icon (or a color swatch), course, title, status and flashcard count, with Rename and Delete.

// Only these data URLs are safe as an image src; the server builds them from stored image bytes.
const safeImagePattern = /^data:image\/(jpeg|png|webp);base64,/;

// The word shown for each session status.
const statusLabels = {
  draft: 'Draft',
  ready: 'Ready',
  failed: 'Failed'
};

/**
 * One session row: a large button that opens the session, then Rename and Delete buttons.
 * @param {{ session: object, onOpen: function, onRename: function, onDelete: function }} props
 *   session is a SessionSummary from GET /api/sessions; the three callbacks take no arguments
 * @returns {JSX.Element}
 */
export default function SessionCard({ session, onOpen, onRename, onDelete }) {
  const showIcon = typeof session.icon === 'string' && safeImagePattern.test(session.icon);
  // Ready sessions get the mint swatch; drafts and failed builds get peach.
  let swatchColor = 'peach';
  if (session.status === 'ready') {
    swatchColor = 'mint';
  }
  const createdDate = new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="session-item">
      <button type="button" className="session-card" onClick={onOpen}>
        {showIcon ? (
          <img className="session-thumbnail" src={session.icon} alt={`Board photo for ${session.title}`} />
        ) : (
          <span className={`session-swatch ${swatchColor}`} aria-hidden="true"></span>
        )}
        <span className="session-card-content text-start">
          <small>{session.course}</small>
          <span className="session-card-title">{session.title}</span>
          <span className="session-card-details">
            <span className={`session-status session-status--${session.status}`}>{statusLabels[session.status]}</span>
            <span>{session.cardCount} flashcards</span>
            <span>{createdDate}</span>
          </span>
        </span>
        <span className="session-arrow" aria-hidden="true">→</span>
      </button>
      <div className="session-card-actions">
        <button type="button" className="text-button" onClick={onRename} aria-label={`Rename ${session.title}`}>Rename</button>
        <button type="button" className="text-button" onClick={onDelete} aria-label={`Delete ${session.title}`}>Delete</button>
      </div>
    </div>
  );
}