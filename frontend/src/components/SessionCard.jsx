import React from 'react';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
});

export default function SessionCard({ session, selected, processing = false, onSelect }) {
  const status = processing ? 'processing' : session.status;
  const statusLabels = { draft: 'Draft', processing: 'Processing', ready: 'Ready', failed: 'Failed' };
  return (
    <button
      type="button"
      className={`session-card ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {session.photo ? <img className="session-thumbnail" src={session.photo.thumbnail} alt="" />
        : <span className="session-thumbnail session-thumbnail--empty" aria-hidden="true">No photo</span>}
      <span className="session-card-content text-start">
        <small>{session.course}</small>
        <span className="session-card-title">{session.title}</span>
        <time dateTime={session.createdAt}>{dateFormat.format(new Date(session.createdAt))} (UTC)</time>
        <span className="session-card-details">
          <span className={`session-status session-status--${status}`}>{statusLabels[status]}</span>
          <span>{session.cardCount} flashcards</span>
        </span>
      </span>
      <span className="session-arrow" aria-hidden="true">→</span>
    </button>
  );
}
