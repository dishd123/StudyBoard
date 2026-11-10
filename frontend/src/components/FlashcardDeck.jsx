import React, { useEffect, useId, useRef, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';

export default function FlashcardDeck({ cards, onMarkKnown, onDeleteCard }) {
  const headingId = useId();
  const filterId = useId();
  const cancelRef = useRef(null);
  const deleteRef = useRef(null);
  const filterRef = useRef(null);
  const [flippedCardId, setFlippedCardId] = useState(null);
  const [currentId, setCurrentId] = useState(cards[0]?.id ?? null);
  const [unknownOnly, setUnknownOnly] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [feedback, setFeedback] = useState('');
  const visibleCards = cards.filter((item) => !unknownOnly || !item.known);
  const cardIndex = Math.max(visibleCards.findIndex((item) => item.id === currentId), 0);
  const card = visibleCards[cardIndex] ?? null;
  const flipped = Boolean(card && flippedCardId === card.id);
  const knownCount = cards.filter((item) => item.known).length;

  useEffect(() => {
    if (pendingDelete) cancelRef.current?.focus();
  }, [pendingDelete]);

  function restoreActionFocus() {
    queueMicrotask(() => (deleteRef.current ?? filterRef.current)?.focus());
  }

  function moveCard(offset) {
    if (!visibleCards.length) return;
    setCurrentId(visibleCards[(cardIndex + visibleCards.length + offset) % visibleCards.length].id);
    setFlippedCardId(null);
    setPendingDelete(null);
    setFeedback('');
  }

  function markKnown(known) {
    onMarkKnown(card.id, known);
    setPendingDelete(null);
    setFlippedCardId(null);
    setFeedback(`Marked this sample card ${known ? 'Got it' : 'Still learning'}. Changes reset on refresh.`);
    if (unknownOnly && known && visibleCards.length === 1) {
      queueMicrotask(() => filterRef.current?.focus());
    }
  }

  function confirmDelete() {
    const remaining = visibleCards.filter((item) => item.id !== pendingDelete.id);
    setCurrentId(remaining[Math.min(cardIndex, remaining.length - 1)]?.id ?? null);
    onDeleteCard(pendingDelete.id);
    setPendingDelete(null);
    setFlippedCardId(null);
    setFeedback('Deleted the sample card from this preview. Refresh restores the fixture.');
    restoreActionFocus();
  }

  return (
    <section className="workspace-panel review-deck" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SAMPLE REVIEW DECK</p>
          <h2 id={headingId}>Quick recall</h2>
        </div>
        <span className="progress-count">{card ? cardIndex + 1 : 0} / {visibleCards.length}</span>
      </div>
      <p className="deck-summary">{cards.length} total · {knownCount} Got it · {cards.length - knownCount} Still learning</p>
      <p className="study-preview-hint">Sample cards only. Review progress and deletion stay in this preview.</p>
      <div className="deck-filter">
        <input ref={filterRef} id={filterId} type="checkbox" checked={unknownOnly} onChange={(event) => {
          setUnknownOnly(event.target.checked);
          setCurrentId(null);
          setFlippedCardId(null);
          setPendingDelete(null);
          setFeedback('');
        }} />
        <label htmlFor={filterId}>Only cards I don't know yet</label>
      </div>
      <StatusMessage status={feedback ? 'success' : 'idle'} message={feedback} />
      {card ? (
        <>
          <button
            type="button"
            className={`flashcard ${flipped ? 'is-flipped' : ''}`}
            aria-pressed={flipped}
            onClick={() => setFlippedCardId((id) => id === card.id ? null : card.id)}
          >
            <span className="card-label">{flipped ? 'ANSWER' : 'QUESTION'}</span>
            <strong>{flipped ? card.answer : card.question}</strong>
            <span>Source: step {card.step}</span>
            <small>Click, Enter, or Space to flip</small>
          </button>
          <div className="deck-controls">
            <button type="button" className="btn btn-sm btn-outline-dark" disabled={visibleCards.length < 2} onClick={() => moveCard(-1)}>← Previous</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={visibleCards.length < 2} onClick={() => moveCard(1)}>Next card →</button>
          </div>
          <div className="card-review-controls" role="group" aria-label="Card review progress">
            <button type="button" className="btn btn-sm btn-outline-dark" aria-pressed={card.known} onClick={() => markKnown(true)}>Got it</button>
            <button type="button" className="btn btn-sm btn-outline-dark" aria-pressed={!card.known} onClick={() => markKnown(false)}>Still learning</button>
            <button ref={deleteRef} type="button" className="btn btn-sm btn-outline-danger" onClick={() => setPendingDelete({ id: card.id, question: card.question })}>Delete card</button>
          </div>
        </>
      ) : <StatusMessage status="empty" message={cards.length ? 'All cards are marked Got it. Clear the filter to review them.' : 'No sample cards to display.'} />}
      {pendingDelete && (
        <section className="card-delete-confirmation" aria-label="Confirm card deletion">
          <h3>Delete this sample card?</h3>
          <p>{pendingDelete.question}</p>
          <p>This only changes the local preview; refresh restores the fixture.</p>
          <div className="card-review-controls">
            <button ref={cancelRef} type="button" className="btn btn-sm btn-outline-dark" onClick={() => { setPendingDelete(null); restoreActionFocus(); }}>Cancel</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={confirmDelete}>Delete this card</button>
          </div>
        </section>
      )}
    </section>
  );
}
