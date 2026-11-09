import React, { useEffect, useId, useRef, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { createTutorPreview } from '../fixtures/tutorPreview.js';

export default function TutorPanel({ session, examples = [] }) {
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [validationError, setValidationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const feedbackId = useId();
  const timer = useRef(null);
  const failOnce = useRef(import.meta.env.DEV && new URLSearchParams(window.location.search).get('tutorFailOnce') === '1');
  const canAsk = session.notes.length > 0;
  const sourceSteps = session.notes.map((note) => note.step).filter((step) => session.photo?.steps.some((source) => source.step === step));
  const coveredExample = examples.find((item) => item.covered);
  const uncoveredExample = examples.find((item) => !item.covered);

  useEffect(() => () => clearTimeout(timer.current), []);

  function changeQuestion(value) {
    setQuestion(value);
    setSubmittedQuestion('');
    setValidationError('');
    setError('');
    setResult(null);
  }

  function ask(value) {
    if (loading || !canAsk) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setValidationError('Enter a question before sending.');
      setResult(null);
      return;
    }
    setValidationError('');
    setSubmittedQuestion(trimmed);
    setResult(null);
    setLoading(true);
    timer.current = setTimeout(() => {
      if (failOnce.current) {
        failOnce.current = false;
        setError('The tutor preview failed. Try again.');
      } else {
        setError('');
        setResult(createTutorPreview(trimmed, examples, sourceSteps));
      }
      setLoading(false);
    }, 800);
  }

  function handleSubmit(event) {
    event.preventDefault();
    ask(question);
  }

  const status = !canAsk ? 'empty' : validationError ? 'validation-error'
    : error ? 'service-error' : loading ? 'loading' : result ? 'success' : 'idle';
  const message = !canAsk ? 'Build session notes before asking a question. Sample responses are unavailable while notes are missing.'
    : validationError || error || (loading ? 'Loading a sample response. No AI request is being made.'
      : result ? `Fixture response: ${result.answer}` : '');

  return (
    <section className="workspace-panel tutor-panel" aria-label="Typed tutor preview">
      <p className="eyebrow">YOUR STUDY TUTOR</p>
      <h2>Ask your notes.</h2>
      <p className="panel-copy">Fixture responses only. This typed-question preview does not call an AI tutor or save question history.</p>
      <div className="tutor-examples">
        {coveredExample && <button type="button" disabled={loading || !canAsk} onClick={() => changeQuestion(coveredExample.question)}>Use covered sample</button>}
        {uncoveredExample && <button type="button" disabled={loading || !canAsk} onClick={() => changeQuestion(uncoveredExample.question)}>Use uncovered sample</button>}
      </div>
      <div className="tutor-bubble">
        <span className="avatar tutor-avatar" aria-hidden="true">✦</span>
        <div className="tutor-feedback">
          {canAsk && !result && !loading && !error && !validationError && <p>Type a question, or choose one of the sample prompts.</p>}
          <StatusMessage
            id={feedbackId}
            status={status}
            message={message}
            onRetry={error && canAsk ? () => ask(submittedQuestion) : undefined}
            isRetrying={loading && Boolean(error)}
          />
          {result && (
            <div className="tutor-sources">
              <p>{result.kind === 'no-match' ? 'No matching fixture answer' : result.covered ? 'Covered sample' : 'Uncovered sample'}</p>
              <p>{result.stepsUsed.length ? `Steps used: ${result.stepsUsed.join(', ')}` : 'No source steps cited.'}</p>
            </div>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="tutor-form">
        <input
          value={question}
          onChange={(event) => changeQuestion(event.target.value)}
          placeholder="Ask about this session..."
          aria-label="Ask your study tutor"
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError || !canAsk ? feedbackId : undefined}
          disabled={loading || !canAsk}
        />
        <button type="submit" aria-label="Send question" disabled={loading || !canAsk}>↑</button>
      </form>
    </section>
  );
}
