// App: the /app/ single-page app (issue).
// Shows a loading line, the signed-out panel, the Dashboard, or one session, chosen by sign-in state and the URL hash.
import { useEffect, useState } from 'react';
import SiteNav from '../SiteNav.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import SessionWorkspace from '../pages/SessionWorkspace.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { logClientEvent } from '../services/clientLogger.js';

// True once app_loaded has been logged, so it is logged once per page load.
let appLoadedLogged = false;

/**
 * Reads the open session id from a hash such as #session=abc123.
 * @returns {string|null} the session id, or null when the hash names no valid id
 */
function readSessionId() {
  // Same id rule as the backend: 1-64 letters, digits, "_" or "-".
  const match = window.location.hash.match(/^#session=([A-Za-z0-9_-]{1,64})$/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * The /app/ page.
 * @returns {JSX.Element}
 */
export default function App() {
  const { user, loading } = useAuth();
  const [sessionId, setSessionId] = useState(readSessionId);

  // The open session lives in the URL hash, so refresh and the Back button keep it.
  useEffect(() => {
    function handleHashChange() {
      setSessionId(readSessionId());
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // One INFO line in Cloud Logging per page load, once the user is known.
  useEffect(() => {
    if (user && !appLoadedLogged) {
      appLoadedLogged = true;
      logClientEvent('INFO', 'app_loaded', { page: 'app' });
    }
  }, [user]);

  /**
   * Opens a session; the hashchange listener then shows it.
   * @param {string} id - session id
   */
  function openSession(id) {
    window.location.hash = `session=${id}`;
  }

  /** Goes back to the Dashboard by clearing the hash. */
  function closeSession() {
    window.location.hash = '';
  }

  let content;
  if (loading) {
    content = (
      <main className="app-shell">
        <div className="container">
          <StatusMessage status={{ kind: 'working', text: 'Checking your sign-in...' }} />
        </div>
      </main>
    );
  } else if (!user) {
    content = (
      <main className="app-shell">
        <div className="container">
          <div className="app-welcome">
            <div>
              <p className="eyebrow">YOUR STUDY WORKSPACE</p>
              <h1>Sign in to see your sessions.</h1>
              <p className="lead">StudyBoard keeps your boards, notes and flashcards in your own account.</p>
              <a className="btn btn-primary" href="/login/">Sign in</a>
            </div>
          </div>
        </div>
      </main>
    );
  } else if (sessionId) {
    // key makes React start a fresh workspace (new state) whenever the session id changes.
    content = <SessionWorkspace key={sessionId} sessionId={sessionId} onBack={closeSession} />;
  } else {
    content = <Dashboard user={user} onOpenSession={openSession} />;
  }

  return (
    <>
      <SiteNav active="/app/" />
      {content}
    </>
  );
}