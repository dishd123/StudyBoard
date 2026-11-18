// Firebase Authentication for the React pages (issue #26).
// Produces the useAuth hook, Google sign-in and sign-out, and plain messages for sign-in errors.
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../services/firebase.js';
import { setAnalyticsUser, trackEvent } from '../services/analytics.js';

// A plain message for each Firebase error code a Google popup can raise.
const authMessages = {
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site, then try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before it finished. Try again.',
  'auth/cancelled-popup-request': 'A Google window is already open. Finish or close it, then try again.',
  'auth/unauthorized-domain': 'Google sign-in is not allowed on this web address yet. Open StudyBoard from its main address.',
  'auth/user-mismatch': 'Choose the same Google account you used to sign in to StudyBoard.',
  'auth/network-request-failed': 'We could not reach Google. Check your connection and try again.',
  'auth/web-storage-unsupported': 'Your browser blocks the site storage that sign-in needs. Allow cookies and site data, then try again.'
};

/**
 * React hook that follows the Firebase sign-in state.
 * @returns {{ user: User|null, loading: boolean }} user is null when signed out; loading is true until Firebase answers
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase calls this once it has restored any saved sign-in, and again after every sign-in or sign-out.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        setAnalyticsUser(firebaseUser.uid);
      }
    });
    // Stop listening when the component leaves the page.
    return unsubscribe;
  }, []);

  return { user, loading };
}

/**
 * Signs in with a Google popup. Call it as the first await in a click handler, or the browser blocks the popup.
 * @returns {Promise<void>}
 * @throws {FirebaseError} when the popup fails or is closed (see describeAuthError)
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  // Always show the account chooser, so people who share a computer pick their own account.
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
  trackEvent('login', { method: 'google' });
}

/**
 * Signs the current user out and stops tagging Analytics events with their uid.
 * @returns {Promise<void>}
 * @throws {FirebaseError} when Firebase cannot sign out
 */
export async function signOutUser() {
  await signOut(auth);
  setAnalyticsUser(null);
}

/**
 * Turns a sign-in or Photos popup error into a message for the user.
 * @param {Error} error - the error thrown by a Firebase popup call
 * @returns {string} the message to show
 */
export function describeAuthError(error) {
  const message = authMessages[error.code];
  if (message) {
    return message;
  }
  return 'Google sign-in did not finish. Try again.';
}