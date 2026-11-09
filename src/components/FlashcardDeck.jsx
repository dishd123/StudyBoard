import React, { useState } from 'react';

export default function FlashcardDeck({ cards }) {
  const [flipped, setFlipped] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const card = cards[cardIndex];

  function moveCard(offset) {
    setCardIndex((index) => (index + cards.length + offset) % cards.length);
    setFlipped(false);
  }

  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SAMPLE REVIEW DECK</p>
          <h2>Quick recall</h2>
        </div>
        <span className="progress-count">{card ? cardIndex + 1 : 0} / {cards.length}</span>
      </div>
      {card ? (
        <>
          <button
            type="button"
            className={`flashcard ${flipped ? 'is-flipped' : ''}`}
            onClick={() => setFlipped((value) => !value)}
          >
            <span className="card-label">{flipped ? 'ANSWER' : 'QUESTION'}</span>
            <strong>{flipped ? card.a : card.q}</strong>
            <small>Click to flip</small>
          </button>
          <div className="deck-controls">
            <button className="btn btn-sm btn-outline-dark" onClick={() => moveCard(-1)}>← Previous</button>
            <button className="btn btn-sm btn-primary" onClick={() => moveCard(1)}>Next card →</button>
          </div>
        </>
      ) : <p>No sample cards to display.</p>}
    </section>
  );
}
