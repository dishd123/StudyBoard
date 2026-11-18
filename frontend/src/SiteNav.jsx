// SiteNav: the Project 1 navigation bar for the React pages, /app/ and /login/ (issue #28).
// Shows the same links as the static pages, plus "Hi, <first name>" and Sign out (with its status line) when signed in.
import { useState } from 'react';
import StatusMessage from './components/StatusMessage.jsx';
import { signOutUser, useAuth } from './hooks/useAuth.js';
import { trackEvent } from './services/analytics.js';
import { logClientEvent } from './services/clientLogger.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };

// [path, label] for each menu link, in menu order.
const links = [
  ['/', 'Home'],
  ['/about.html', 'About'],
  ['/contact.html', 'Contact'],
  ['/app/', 'App']
];

/**
 * Bootstrap navbar with the site links and the sign-in state.
 * @param {{ active?: string }} props - active is the path of the current page, shown as the active link
 * @returns {JSX.Element}
 */
export default function SiteNav({ active }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(idleStatus);

  /**
   * Signs out; the pages then show their signed-out view.
   * @returns {Promise<void>}
   */
  async function handleSignOut() {
    setStatus({ kind: 'working', text: 'Signing out...' });
    try {
      await signOutUser();
      setStatus(idleStatus);
    } catch (error) {
      logClientEvent('WARNING', 'sign_out_failed', { code: error.code || 'unknown' });
      trackEvent('error_shown', { operation: 'sign_out' });
      setStatus({ kind: 'error', text: 'We could not sign you out.', onRetry: handleSignOut });
    }
  }

  // Greet with the first word of the Google display name, for example "Hi, Disha".
  let firstName = 'there';
  if (user && user.displayName) {
    firstName = user.displayName.trim().split(' ')[0];
  }

  return (
    <>
      <nav className="navbar navbar-expand-lg site-nav" aria-label="Main navigation">
        <div className="container">
          <a className="navbar-brand" href="/">
            <span className="brand-mark">S</span> StudyBoard
          </a>
          {/* Bootstrap's script opens and closes the menu on small screens. */}
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNav"
            aria-controls="mainNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="mainNav">
            <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
              {links.map(([href, label]) => {
                // The current page's link is highlighted, and screen readers hear it as the current page.
                let linkClass = 'nav-link';
                let ariaCurrent;
                if (href === active) {
                  linkClass = 'nav-link active';
                  ariaCurrent = 'page';
                }
                return (
                  <li className="nav-item" key={href}>
                    <a className={linkClass} href={href} aria-current={ariaCurrent}>
                      {label}
                    </a>
                  </li>
                );
              })}
              <li className="nav-item">
                {user ? (
                  <span className="nav-user">
                    <span className="nav-greeting">Hi, {firstName}</span>
                    <button type="button" className="btn btn-sm btn-dark nav-login" onClick={handleSignOut}>Sign out</button>
                  </span>
                ) : (
                  <a className="btn btn-sm btn-dark nav-login" href="/login/" aria-current={active === '/login/' ? 'page' : undefined}>Sign in</a>
                )}
              </li>
            </ul>
          </div>
        </div>
      </nav>
      {/* The sign-out status line sits under the menu, at the top of the page; it takes no space while idle. */}
      <div className="container">
        <StatusMessage status={status} />
      </div>
    </>
  );
}