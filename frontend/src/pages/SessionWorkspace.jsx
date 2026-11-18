// SessionWorkspace: one open study session, with the Material, Notes and Study tabs (issue #143).
// Loads the session and its cards, keeps them up to date for the tabs, and shows a banner when a rebuild is due.
import { useEffect, useState } from 'react';
import MaterialTab from '../components/MaterialTab.jsx';
import NotesTab from '../components/NotesTab.jsx';
import StudyTab from '../components/StudyTab.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { trackEvent } from '../services/analytics.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };
// Shown while the session loads, also on the very first render.
const loadingStatus = { kind: 'working', text: 'Loading your session...' };

// The three tabs, in order.
const tabs = [
  { id: 'material', label: 'Material' },
  { id: 'notes', label: 'Notes' },
  { id: 'study', label: 'Study' }
];

/**
 * The workspace of one session.
 * @param {{ sessionId: string, onBack: function }} props - onBack() returns to the Dashboard
 * @returns {JSX.Element}
 */
export default function SessionWorkspace({ sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [cards, setCards] = useState([]);
  const [activeTab, setActiveTab] = useState('material');
  const [loadStatus, setLoadStatus] = useState(loadingStatus);

  /**
   * Loads the session and its cards.
   * @returns {Promise<void>}
   */
  async function loadSession() {
    setLoadStatus(loadingStatus);
    try {
      const result = await api.getSession(sessionId);
      setSession(result.session);
      setCards(result.cards);
      setLoadStatus(idleStatus);
    } catch (error) {
      trackEvent('error_shown', { operation: 'session_read' });
      setLoadStatus({ kind: 'error', text: error.message, onRetry: loadSession });
    }
  }

  // Load once when the workspace opens. App gives each session id its own workspace, so the id never changes here.
  useEffect(() => {
    loadSession();
  }, [sessionId]);

  /**
   * Switches to a tab and records the view in Analytics.
   * @param {string} tabId - 'material', 'notes' or 'study'
   */
  function showTab(tabId) {
    setActiveTab(tabId);
    trackEvent('tab_view', { tab: tabId });
  }

  /**
   * Stores a finished build from the Material tab, then shows the new notes.
   * @param {{ session: object, cards: object[] }} result - the body of POST /build
   */
  function handleBuilt(result) {
    setSession(result.session);
    setCards(result.cards);
    showTab('notes');
  }

  /**
   * Rebuild for the Notes tab: runs the agents again and stores the result.
   * @returns {Promise<void>}
   * @throws {ApiError} when the build fails, so the Notes tab can show the message
   */
  async function rebuildStudySet() {
    trackEvent('build_start');
    try {
      const result = await api.buildStudySet(sessionId);
      trackEvent('build_success', { card_count: result.cards.length });
      setSession(result.session);
      setCards(result.cards);
    } catch (error) {
      trackEvent('build_fail');
      // 502: the server gave up after two attempts and marked the session failed, so show its banner now.
      if (error.status === 502) {
        setSession({ ...session, status: 'failed', errorMessage: error.message });
      }
      throw error;
    }
  }

  return (
    <main className="app-shell">
      <div className="container">
        <button type="button" className="text-button" onClick={onBack}>Back to your sessions</button>
        <StatusMessage status={loadStatus} />
        {session && (
          <>
            <div className="app-welcome workspace-heading">
              <div>
                <p className="eyebrow">{session.course.toUpperCase()}</p>
                <h1>{session.title}</h1>
              </div>
            </div>
            {session.status === 'failed' && (
              <p className="workspace-banner">{session.errorMessage || 'The last build did not finish. Try Rebuild on the Notes tab.'}</p>
            )}
            {session.needsRebuild && (
              <p className="workspace-banner">Your photo or recording changed after the last build. Use Rebuild on the Notes tab to update your notes and flashcards.</p>
            )}
            <div className="workspace-tabs" role="tablist" aria-label="Session sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="session-tab-panel"
                  className={activeTab === tab.id ? 'is-active' : undefined}
                  onClick={() => showTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div id="session-tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
              {activeTab === 'material' && <MaterialTab session={session} onSessionChange={setSession} onBuilt={handleBuilt} />}
              {activeTab === 'notes' && <NotesTab session={session} onRebuild={rebuildStudySet} onGoToMaterial={() => showTab('material')} />}
              {activeTab === 'study' && <StudyTab session={session} cards={cards} onCardsChange={setCards} />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}