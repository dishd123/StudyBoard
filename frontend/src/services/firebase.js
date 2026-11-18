// Firebase web setup shared by the /app/ and /login/ pages (issue #25).
// Produces the Firebase app, the Authentication instance, and Analytics when the browser allows it.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Paste this object from Firebase console > Project settings > Your apps > Web app > Config.
// These values are public by design: they only name the project, and the backend checks every ID token.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBYHCPkovyhdZ1fosxmvtX2hwFoyayM0tA",
  authDomain: "gen-lang-client-0800605818.firebaseapp.com",
  projectId: "gen-lang-client-0800605818",
  storageBucket: "gen-lang-client-0800605818.firebasestorage.app",
  messagingSenderId: "389363739519",
  appId: "1:389363739519:web:2e099faf136e79b11cc84a",
  measurementId: "G-KV2396432E"
};

// The one Firebase app for this page; every other Firebase service is created from it.
export const firebaseApp = initializeApp(firebaseConfig);

// Firebase Authentication: who is signed in, plus the Google popups.
export const auth = getAuth(firebaseApp);

/**
 * Starts Firebase Analytics if this browser supports it.
 * @returns {Promise<Analytics|null>} the Analytics instance, or null; the promise never rejects
 */
async function startAnalytics() {
  try {
    // Analytics needs cookies and IndexedDB, which private windows and some browsers turn off.
    const supported = await isSupported();
    if (supported) {
      return getAnalytics(firebaseApp);
    }
  } catch {
    // An Analytics problem must never stop the app from loading, so it falls through to null.
  }
  return null;
}

// Resolves to the Analytics instance, or to null when Analytics is not available.
export const analyticsReady = startAnalytics();