import React from 'react';

export default function BoardPreview({ session }) {
  return (
    <section className="workspace-panel board-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SAMPLE BOARD</p>
          <h2>{session.photo?.title ?? session.title}</h2>
        </div>
        <button className="icon-button" aria-label="More board options" disabled>•••</button>
      </div>
      {session.photo ? <div className="board-preview">
        <img
          className="workspace-board-image"
          src={session.photo.thumbnail}
          alt={`Sample board thumbnail for ${session.title}`}
        />
      </div> : <p className="workspace-placeholder">No photo has been added to this sample session.</p>}
      <div className="board-meta">
        <span>{session.photo ? 'Fixture content is synthetic; the thumbnail is a bundled stand-in.' : 'Import will be connected later.'}</span>
        <span className="tag">{session.status}</span>
      </div>
      {session.errorMessage && <p role="alert">{session.errorMessage}</p>}
    </section>
  );
}
