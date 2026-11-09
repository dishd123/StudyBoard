import React from 'react';
import FlashcardDeck from './FlashcardDeck.jsx';
import TutorPanel from './TutorPanel.jsx';

export default function StudyTab({ session, cards, questions, onMarkKnown, onDeleteCard }) {
  return (
    <div className="row g-4">
      <div className="col-md-6"><FlashcardDeck cards={cards} onMarkKnown={onMarkKnown} onDeleteCard={onDeleteCard} /></div>
      <div className="col-md-6"><TutorPanel session={session} examples={questions} /></div>
    </div>
  );
}
