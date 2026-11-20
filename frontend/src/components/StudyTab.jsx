// StudyTab: the Study tab of one session (issue #9).
// Shows the flashcard deck and the tutor side by side, as in the Project 1 dashboard.
import FlashcardDeck from './FlashcardDeck.jsx';
import TutorPanel from './TutorPanel.jsx';

/**
 * The Study tab.
 * @param {{ session: object, cards: object[], onCardsChange: function }} props
 *   cards are the session's flashcards; onCardsChange(cards) stores an updated list
 * @returns {JSX.Element}
 */
export default function StudyTab({ session, cards, onCardsChange }) {
  // The tutor answers only from saved notes, so it waits until a build has made some.
  const hasNotes = Array.isArray(session.notes) && session.notes.length > 0;

  return (
    <div className="row g-4">
      <div className="col-md-6">
        <FlashcardDeck sessionId={session.id} cards={cards} onCardsChange={onCardsChange} />
      </div>
      <div className="col-md-6">
        <TutorPanel sessionId={session.id} hasNotes={hasNotes} />
      </div>
    </div>
  );
}