// Sign In page (/login/): the Project 1 layout with one "Sign in with Google" button (issue #27).
// After sign-in it opens /app/; a user who is already signed in gets a link to their sessions.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SiteNav from '../SiteNav.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { describeAuthError, signInWithGoogle, useAuth } from '../hooks/useAuth.js';
import { trackEvent } from '../services/analytics.js';
import { logClientEvent } from '../services/clientLogger.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

// True once app_loaded has been logged, so it is logged once per page load.
let appLoadedLogged = false;

/**
 * The whole Sign In page.
 * @returns {JSX.Element}
 */
function LoginApp() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState(idleStatus);

  // One INFO line in Cloud Logging per page load, once the user is known.
  useEffect(() => {
    if (user && !appLoadedLogged) {
      appLoadedLogged = true;
      logClientEvent('INFO', 'app_loaded', { page: 'login' });
    }
  }, [user]);

  /**
   * Runs the Google popup, then opens the app.
   * @returns {Promise<void>}
   */
  async function handleSignIn() {
    setStatus({ kind: 'working', text: 'Waiting for Google sign-in...' });
    try {
      // The popup must open inside this click, so this is the first await in the handler.
      await signInWithGoogle();
      window.location.assign('/app/');
    } catch (error) {
      logClientEvent('WARNING', 'sign_in_failed', { code: error.code || 'unknown' });
      trackEvent('error_shown', { operation: 'sign_in' });
      setStatus({ kind: 'error', text: describeAuthError(error), onRetry: handleSignIn });
    }
  }

  return (
    <>
      <SiteNav active="/login/" />
      <main className="auth-page">
        <div className="auth-layout">
          <div className="auth-visual image-slot">
            <img src="/images/signin.jpg" alt="Handwritten study notes" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: 'top center', borderRadius: 28 }} />
            <div className="auth-scribble">learn<br />what<br />matters</div>
            <p className="auth-caption">A glimpse from a student's class notes.</p>
          </div>
          <div className="auth-card">
            <div className="auth-form">
              <p className="eyebrow">WELCOME BACK</p>
              <h1>Sign in to your board.</h1>
              <p className="auth-copy">Continue building understanding, one session at a time.</p>
              {user ? (
                <>
                  <p>You are already signed in.</p>
                  <a className="btn btn-primary w-100 mt-4" href="/app/">Go to your sessions</a>
                </>
              ) : (
                <button className="btn btn-primary w-100 mt-4" type="button" onClick={handleSignIn} disabled={loading || status.kind === 'working'}>
                  Sign in with Google
                </button>
              )}
              <StatusMessage status={status} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

// Mount the page into the empty #root div of login/index.html. StrictMode adds extra checks during npm run dev.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LoginApp />
  </StrictMode>
);