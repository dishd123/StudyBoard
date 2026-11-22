// Firebase Authentication for the React pages (issue #26).
// Produces the useAuth hook, Google and email sign-in, sign-out, and plain messages for sign-in errors.
import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth } from '../services/firebase.js';
import { setAnalyticsUser, trackEvent } from '../services/analytics.js';

// The same message for a wrong password and an unknown email, so nobody can test which emails have accounts.
const noMatchMessage = 'That email and password do not match an account. Check them, or create an account.';

// A plain message for each Firebase error code that a Google popup or an email sign-in can raise.
const authMessages = {
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site, then try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before it finished. Try again.',
  'auth/cancelled-popup-request': 'A Google window is already open. Finish or close it, then try again.',
  'auth/unauthorized-domain': 'Google sign-in is not allowed on this web address yet. Open StudyBoard from its main address.',
  'auth/user-mismatch': 'Choose the same Google account you used to sign in to StudyBoard.',
  'auth/network-request-failed': 'We could not reach the sign-in service. Check your connection and try again.',
  'auth/web-storage-unsupported': 'Your browser blocks the site storage that sign-in needs. Allow cookies and site data, then try again.',
  'auth/invalid-credential': noMatchMessage,
  'auth/user-not-found': noMatchMessage, // older Firebase projects still send these two codes
  'auth/wrong-password': noMatchMessage,
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-email': 'Enter your email address first.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead, or reset your password.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.',
  'auth/operation-not-allowed': 'Email sign-in is not turned on for StudyBoard yet.',
  'auth/account-exists-with-different-credential': 'This email already has a StudyBoard account with a password. Sign in with your email and password instead.'
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
 * Creates an email and password account and signs the new user in.
 * @param {string} firstName - the name the app greets the user with
 * @param {string} email - the email address for the account
 * @param {string} password - at least 6 characters, Firebase's minimum
 * @returns {Promise<void>}
 * @throws {FirebaseError} for example auth/email-already-in-use or auth/weak-password (see describeAuthError)
 */
export async function createAccountWithEmail(firstName, email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  // An email account has no name until one is set; the menu and the dashboard greet the user by it.
  await updateProfile(result.user, { displayName: firstName });
  trackEvent('sign_up', { method: 'password' });
  // The new account is already signed in, and the sign-in step of the analytics flow chart counts login events.
  trackEvent('login', { method: 'password' });
}

/**
 * Signs in with an email address and password.
 * @param {string} email - the account's email address
 * @param {string} password - the account's password
 * @returns {Promise<void>}
 * @throws {FirebaseError} for example auth/invalid-credential (see describeAuthError)
 */
export async function signInWithEmail(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
  trackEvent('login', { method: 'password' });
}

/**
 * Asks Firebase to email a password reset link. Firebase does not say whether the email has an account.
 * @param {string} email - the address to send the link to
 * @returns {Promise<void>}
 * @throws {FirebaseError} for example auth/missing-email or auth/invalid-email (see describeAuthError)
 */
export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
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
 * Tells whether the user signed in with Google, which the Google Photos import needs.
 * @param {User|null} user - the Firebase user
 * @returns {boolean} true when the account has the Google provider
 */
export function usesGoogle(user) {
  if (!user) {
    return false;
  }
  return user.providerData.some((provider) => provider.providerId === 'google.com');
}

/**
 * Turns a sign-in or Photos popup error into a message for the user.
 * @param {Error} error - the error thrown by a Firebase sign-in or popup call
 * @returns {string} the message to show
 */
export function describeAuthError(error) {
  const message = authMessages[error.code];
  if (message) {
    return message;
  }
  return 'Sign-in did not finish. Try again.';
}