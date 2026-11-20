// TutorPanel: the Project 1 tutor panel, now answered by the ADK tutor agent from the saved notes (issue #57).
// Sends a typed question, shows the answer with the steps it used, and lists the last 20 questions.
import { useEffect, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { trackEvent } from '../services/analytics.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

/**
 * The tutor's answer to one question, with the steps it used or a "not covered" tag.
 * @param {{ item: object }} props - item is a Question from the API
 * @returns {JSX.Element}
 */
function TutorAnswer({ item }) {
  return (
    <>
      <p className="tutor-answer">{item.answer}</p>
      {item.covered ? (
        <p className="tutor-steps">Steps used: {item.stepsUsed.join(', ')}</p>
      ) : (
        <span className="tutor-tag">Not covered by your material</span>
      )}
    </>
  );
}

/**
 * The tutor panel.
 * @param {{ sessionId: string, hasNotes: boolean }} props - hasNotes is false until a build has made notes
 * @returns {JSX.Element}
 */
export default function TutorPanel({ sessionId, hasNotes }) {
  const [question, setQuestion] = useState('');
  // Saved questions, newest first; the first one is the latest answer.
  const [questions, setQuestions] = useState([]);
  const [status, setStatus] = useState(idleStatus);

  /**
   * Loads the last 20 questions of this session.
   * @returns {Promise<void>}
   */
  async function loadQuestions() {
    setStatus({ kind: 'working', text: 'Loading your earlier questions...' });
    try {
      const result = await api.listQuestions(sessionId);
      setQuestions(result.questions);
      setStatus(idleStatus);
    } catch (error) {
      trackEvent('error_shown', { operation: 'question_history' });
      setStatus({ kind: 'error', text: error.message, onRetry: loadQuestions });
    }
  }

  // Load the history once when the panel first appears.
  useEffect(() => {
    loadQuestions();
  }, [sessionId]);

  /**
   * Handles the question form.
   * @param {SubmitEvent} event - the form submit
   * @returns {Promise<void>}
   */
  async function handleSubmit(event) {
    // Stop the browser from reloading the page on submit.
    event.preventDefault();
    const text = question.trim();
    if (text) {
      await askQuestion(text);
    }
  }

  /**
   * Sends one question to the tutor agent and puts the answer at the top of the list.
   * @param {string} text - the question, 1 to 500 characters
   * @returns {Promise<void>}
   */
  async function askQuestion(text) {
    trackEvent('tutor_question');
    setStatus({ kind: 'working', text: 'Your tutor is reading your notes...' });
    try {
      const result = await api.askTutor(sessionId, text);
      trackEvent('tutor_answer', { covered: result.question.covered ? 1 : 0 });
      // Keep the list to the 20 most recent, like the server does.
      setQuestions((current) => [result.question, ...current].slice(0, 20));
      setQuestion('');
      setStatus(idleStatus);
    } catch (error) {
      trackEvent('error_shown', { operation: 'tutor_question' });
      setStatus({ kind: 'error', text: error.message, onRetry: () => askQuestion(text) });
    }
  }

  const latest = questions[0];
  const earlier = questions.slice(1);
  const formDisabled = !hasNotes || status.kind === 'working';

  return (
    <section className="workspace-panel tutor-panel" aria-labelledby="tutor-heading">
      <p className="eyebrow">YOUR STUDY TUTOR</p>
      <h2 id="tutor-heading">Ask your notes.</h2>
      <p className="panel-copy">Your tutor answers only from this session's board and explanation, and names the steps it used.</p>
      <div className="tutor-bubble">
        <span className="avatar tutor-avatar" aria-hidden="true">✦</span>
        {latest ? (
          <div>
            <p className="tutor-question">You asked: {latest.question}</p>
            <TutorAnswer item={latest} />
          </div>
        ) : (
          <p>What part of this board would you like to understand better?</p>
        )}
      </div>
      {!hasNotes && <p className="tutor-note">Make notes and flashcards first. Then your tutor can answer.</p>}
      <form onSubmit={handleSubmit} className="tutor-form">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          placeholder="Ask about this session..."
          aria-label="Ask your study tutor"
          disabled={formDisabled}
        />
        <button type="submit" aria-label="Send question" disabled={formDisabled}>↑</button>
      </form>
      <StatusMessage status={status} />
      {earlier.length > 0 && (
        <>
          <h3 className="tutor-history-heading">Earlier questions</h3>
          <ul className="tutor-history">
            {earlier.map((item) => (
              <li key={item.id}>
                <details>
                  <summary>{item.question}</summary>
                  <TutorAnswer item={item} />
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}