// Sign In page (/login/): the Project 1 layout with email sign-in, account creation and Google sign-in (issue #27).
// After sign-in it opens /app/; a user who is already signed in gets a link to their sessions.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SiteNav from '../SiteNav.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import {
  createAccountWithEmail,
  describeAuthError,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  useAuth
} from '../hooks/useAuth.js';
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
  // 'signIn' shows the sign-in form; 'create' adds a first name field and creates an account.
  const [mode, setMode] = useState('signIn');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const creating = mode === 'create';
  const busy = loading || status.kind === 'working';

  // One INFO line in Cloud Logging per page load, once the user is known.
  useEffect(() => {
    if (user && !appLoadedLogged) {
      appLoadedLogged = true;
      logClientEvent('INFO', 'app_loaded', { page: 'login' });
    }
  }, [user]);

  /**
   * Logs a failed sign-in and shows its message.
   * @param {Error} error - the Firebase error
   * @param {string} method - 'google' or 'password'
   * @param {function} [onRetry] - adds a Try again button
   * @returns {void}
   */
  function showSignInError(error, method, onRetry) {
    logClientEvent('WARNING', 'sign_in_failed', { code: error.code || 'unknown', method });
    trackEvent('error_shown', { operation: 'sign_in' });
    setStatus({ kind: 'error', text: describeAuthError(error), onRetry });
  }

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
      showSignInError(error, 'google', handleSignIn);
    }
  }

  /**
   * Signs in, or creates the account, with the email form, then opens the app.
   * @param {SubmitEvent} event - the form submit
   * @returns {Promise<void>}
   */
  async function handleEmailSubmit(event) {
    // The form is handled here, so the browser must not reload the page.
    event.preventDefault();
    setStatus({ kind: 'working', text: creating ? 'Creating your account...' : 'Signing you in...' });
    try {
      if (creating) {
        await createAccountWithEmail(firstName.trim(), email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
      window.location.assign('/app/');
    } catch (error) {
      // No Try again button: the user fixes the form and submits it again.
      showSignInError(error, 'password');
    }
  }

  /**
   * Emails a password reset link to the address in the form.
   * @returns {Promise<void>}
   */
  async function handleReset() {
    setStatus({ kind: 'working', text: 'Sending the reset link...' });
    try {
      await sendPasswordReset(email.trim());
      setStatus({ kind: 'success', text: 'If an account uses this email, a reset link is on its way. Check your spam folder too.' });
    } catch (error) {
      setStatus({ kind: 'error', text: describeAuthError(error) });
    }
  }

  /**
   * Switches between signing in and creating an account.
   * @returns {void}
   */
  function switchMode() {
    setMode(creating ? 'signIn' : 'create');
    setStatus(idleStatus);
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
              <p className="eyebrow">{creating ? 'NEW HERE' : 'WELCOME BACK'}</p>
              <h1>{creating ? 'Create your account.' : 'Sign in to your board.'}</h1>
              <p className="auth-copy">Continue building understanding, one session at a time.</p>
              {user ? (
                <>
                  <p>You are already signed in.</p>
                  <a className="btn btn-primary w-100 mt-4" href="/app/">Go to your sessions</a>
                </>
              ) : (
                <>
                  <form onSubmit={handleEmailSubmit}>
                    {creating && (
                      <>
                        <label htmlFor="first-name">First name</label>
                        <input id="first-name" className="form-control" type="text" autoComplete="given-name" maxLength={40} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                      </>
                    )}
                    <label htmlFor="email">Email</label>
                    <input id="email" className="form-control" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                    <label htmlFor="password">Password</label>
                    {/* minLength 6 is Firebase's own minimum, checked here before anything is sent. */}
                    <input id="password" className="form-control" type="password" autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 6 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
                    <button className="btn btn-primary w-100 mt-4" type="submit" disabled={busy}>
                      {creating ? 'Create account' : 'Sign in'}
                    </button>
                  </form>
                  {!creating && (
                    <button className="create-account-button" type="button" onClick={handleReset} disabled={busy}>
                      Forgot your password?
                    </button>
                  )}
                  <button className="create-account-button" type="button" onClick={switchMode} disabled={busy}>
                    {creating ? 'Already have an account? Sign in' : 'New here? Create an account'}
                  </button>
                  <p className="text-center text-muted mt-4 mb-0">or</p>
                  <button className="btn btn-outline-dark w-100 mt-3" type="button" onClick={handleSignIn} disabled={busy}>
                    Continue with Google
                  </button>
                </>
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