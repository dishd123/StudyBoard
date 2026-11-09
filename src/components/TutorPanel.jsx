import React, { useId, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';

export default function TutorPanel() {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [validationError, setValidationError] = useState('');
  const feedbackId = useId();

  function handleSubmit(event) {
    event.preventDefault();
    if (!question.trim()) {
      setValidationError('Enter a question before sending.');
      setAsked('');
      return;
    }
    setValidationError('');
    setAsked(question.trim());
  }

  return (
    <section className="workspace-panel tutor-panel">
      <p className="eyebrow">YOUR STUDY TUTOR</p>
      <h2>Ask your notes.</h2>
      <p className="panel-copy">Demo only: questions stay in this page. The tutor is not connected yet.</p>
      <div className="tutor-bubble">
        <span className="avatar tutor-avatar" aria-hidden="true">✦</span>
        <div className="tutor-feedback">
          {!asked && !validationError && <p>What part of this board would you like to understand better?</p>}
          <StatusMessage
            id={feedbackId}
            status={validationError ? 'validation-error' : asked ? 'success' : 'idle'}
            message={validationError || (asked ? `Demo question received: “${asked}”. No answer has been generated.` : '')}
          />
        </div>
      </div>
      <form onSubmit={handleSubmit} className="tutor-form">
        <input
          value={question}
          onChange={(event) => { setQuestion(event.target.value); setAsked(''); setValidationError(''); }}
          placeholder="Ask about this session..."
          aria-label="Ask your study tutor"
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? feedbackId : undefined}
        />
        <button type="submit" aria-label="Send question">↑</button>
      </form>
    </section>
  );
}
