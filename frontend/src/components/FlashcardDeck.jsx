// FlashcardDeck: the Project 1 flip-card deck, now on the session's saved flashcards (issue #56).
// Flips cards, moves between them, saves Got it / Still learning, deletes cards, and can show only unknown cards.
import { useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { trackEvent } from '../services/analytics.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

/**
 * The flashcard deck.
 * @param {{ sessionId: string, cards: object[], onCardsChange: function }} props
 *   cards are every flashcard of the session; onCardsChange(cards) stores an updated list
 * @returns {JSX.Element}
 */
export default function FlashcardDeck({ sessionId, cards, onCardsChange }) {
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [unknownOnly, setUnknownOnly] = useState(false);
  // The cards the server returned for "Only cards I don't know yet".
  const [unknownCards, setUnknownCards] = useState([]);
  const [status, setStatus] = useState(idleStatus);

  const deckCards = unknownOnly ? unknownCards : cards;
  // Stay on a real card after the deck gets shorter (a card was deleted or marked known).
  let currentIndex = cardIndex;
  if (currentIndex >= deckCards.length) {
    currentIndex = deckCards.length - 1;
  }
  // An empty deck gives -1 above, so use 0; card below is then undefined and the empty state shows.
  if (currentIndex < 0) {
    currentIndex = 0;
  }
  const card = deckCards[currentIndex];
  const knownCount = cards.filter((item) => item.known).length;
  const busy = status.kind === 'working';

  /**
   * Moves to the previous or next card, wrapping around at either end.
   * @param {number} step - -1 for Previous, 1 for Next
   */
  function moveCard(step) {
    setCardIndex((currentIndex + step + deckCards.length) % deckCards.length);
    setFlipped(false);
  }

  /** Turns the card over between question and answer. */
  function flipCard() {
    setFlipped(!flipped);
    trackEvent('card_flip');
  }

  /**
   * Switches between every card and only the cards not marked known.
   * @param {Event} event - the checkbox change
   * @returns {Promise<void>}
   */
  async function changeFilter(event) {
    const checked = event.target.checked;
    setUnknownOnly(checked);
    setCardIndex(0);
    setFlipped(false);
    setStatus(idleStatus);
    if (checked) {
      await loadUnknownCards();
    }
  }

  /**
   * Asks the server for the cards not marked known yet (a Firestore where known == false query).
   * @returns {Promise<void>}
   */
  async function loadUnknownCards() {
    setStatus({ kind: 'working', text: "Loading the cards you don't know yet..." });
    try {
      const result = await api.listCards(sessionId, true);
      setUnknownCards(result.cards);
      setStatus(idleStatus);
    } catch (error) {
      trackEvent('error_shown', { operation: 'cards_list' });
      setStatus({ kind: 'error', text: error.message, onRetry: loadUnknownCards });
    }
  }

  /**
   * Saves Got it (known true) or Still learning (known false) for one card.
   * @param {object} target - the card
   * @param {boolean} known - the new known value
   * @returns {Promise<void>}
   */
  async function markCard(target, known) {
    setStatus({ kind: 'working', text: 'Saving...' });
    try {
      const result = await api.updateCard(sessionId, target.id, known);
      trackEvent('card_mark', { known: known ? 1 : 0 });
      onCardsChange(cards.map((item) => (item.id === target.id ? result.card : item)));
      // A card marked Got it no longer belongs in the "don't know yet" deck.
      if (known) {
        setUnknownCards(unknownCards.filter((item) => item.id !== target.id));
      }
      setFlipped(false);
      setStatus({ kind: 'success', text: known ? 'Marked as Got it.' : 'Marked as Still learning.' });
    } catch (error) {
      trackEvent('error_shown', { operation: 'card_mark' });
      setStatus({ kind: 'error', text: error.message, onRetry: () => markCard(target, known) });
    }
  }

  /**
   * Asks for confirmation, then deletes one card.
   * @param {object} target - the card
   * @returns {Promise<void>}
   */
  async function deleteCard(target) {
    if (!window.confirm('Delete this flashcard? You cannot undo this.')) {
      return;
    }
    await removeCard(target);
  }

  /**
   * Deletes one card on the server and from both decks.
   * @param {object} target - the card
   * @returns {Promise<void>}
   */
  async function removeCard(target) {
    setStatus({ kind: 'working', text: 'Deleting the card...' });
    try {
      await api.deleteCard(sessionId, target.id);
      trackEvent('card_delete');
      onCardsChange(cards.filter((item) => item.id !== target.id));
      setUnknownCards(unknownCards.filter((item) => item.id !== target.id));
      setFlipped(false);
      setStatus({ kind: 'success', text: 'Card deleted.' });
    } catch (error) {
      trackEvent('error_shown', { operation: 'card_delete' });
      setStatus({ kind: 'error', text: error.message, onRetry: () => removeCard(target) });
    }
  }

  // What to say when the deck is empty; nothing while cards are still loading.
  let emptyText = '';
  if (!card && !busy) {
    if (unknownOnly) {
      emptyText = 'No cards left to learn. Clear the box above to review every card.';
    } else {
      emptyText = 'No flashcards yet. Make notes and flashcards on the Material tab.';
    }
  }

  return (
    <section className="workspace-panel review-deck" aria-labelledby="deck-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">REVIEW DECK</p>
          <h2 id="deck-heading">Quick recall</h2>
        </div>
        <span className="progress-count">{card ? currentIndex + 1 : 0} / {deckCards.length}</span>
      </div>
      <p className="deck-summary">{knownCount} known, {cards.length - knownCount} still learning</p>
      <div className="deck-filter">
        <input id="unknown-only" type="checkbox" checked={unknownOnly} onChange={changeFilter} disabled={busy} />
        <label htmlFor="unknown-only">Only cards I don't know yet</label>
      </div>
      {card && (
        <>
          <button type="button" className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={flipCard} aria-pressed={flipped}>
            <span className="card-label">{flipped ? 'ANSWER' : 'QUESTION'}</span>
            <strong>{flipped ? card.answer : card.question}</strong>
            <small>Step {card.stepNumber}. Click to flip</small>
          </button>
          <div className="deck-controls">
            <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => moveCard(-1)} disabled={deckCards.length < 2}>
              <span aria-hidden="true">←</span> Previous
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => moveCard(1)} disabled={deckCards.length < 2}>
              Next card <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="card-review-controls" role="group" aria-label="Review this card">
            <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => markCard(card, true)} aria-pressed={card.known} disabled={busy}>Got it</button>
            <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => markCard(card, false)} aria-pressed={!card.known} disabled={busy}>Still learning</button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteCard(card)} disabled={busy}>Delete card</button>
          </div>
        </>
      )}
      {emptyText && <p className="empty-state">{emptyText}</p>}
      <StatusMessage status={status} />
    </section>
  );
}