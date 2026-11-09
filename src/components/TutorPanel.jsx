import React, { useState } from 'react';

export default function TutorPanel() {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (question.trim()) setAsked(question.trim());
  }

  return (
    <section className="workspace-panel tutor-panel">
      <p className="eyebrow">YOUR STUDY TUTOR</p>
      <h2>Ask your notes.</h2>
      <p className="panel-copy">Demo only: questions stay in this page. The tutor is not connected yet.</p>
      <div className="tutor-bubble" aria-live="polite">
        <span className="avatar tutor-avatar" aria-hidden="true">✦</span>
        <p>{asked ? `Demo question received: “${asked}”. No answer has been generated.` : 'What part of this board would you like to understand better?'}</p>
      </div>
      <form onSubmit={handleSubmit} className="tutor-form">
        <input
          value={question}
          onChange={(event) => { setQuestion(event.target.value); setAsked(''); }}
          placeholder="Ask about this session..."
          aria-label="Ask your study tutor"
        />
        <button type="submit" aria-label="Send question">↑</button>
      </form>
    </section>
  );
}
