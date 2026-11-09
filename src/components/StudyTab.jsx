import React from 'react';
import FlashcardDeck from './FlashcardDeck.jsx';
import TutorPanel from './TutorPanel.jsx';

export default function StudyTab({ cards }) {
  return (
    <div className="row g-4">
      <div className="col-md-6"><FlashcardDeck cards={cards} /></div>
      <div className="col-md-6"><TutorPanel /></div>
    </div>
  );
}
