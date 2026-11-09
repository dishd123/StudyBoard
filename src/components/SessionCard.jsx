import React from 'react';

export default function SessionCard({ session, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`session-card ${selected ? 'selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="session-swatch mint" aria-hidden="true" />
      <span className="text-start">
        <small>{session.course}</small>
        <span className="session-card-title">{session.title}</span>
        <span>{session.cardCount} flashcards · {session.status}</span>
      </span>
      <span className="session-arrow" aria-hidden="true">→</span>
    </button>
  );
}
