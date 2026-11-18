// Firebase Admin SDK setup (issue #29): the backend's one connection to Firebase Authentication and Firestore.
// Exports adminAuth for ID token checks and db for Firestore; both use the server's Google credentials, not a key file.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Credentials come from the environment: the service identity on Cloud Run,
// `gcloud auth application-default login` locally. projectId tells verifyIdToken which project's tokens to accept.
// A module runs once per process, so initializeApp runs once.
const app = initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0800605818' });

/** Firebase Authentication on the server; requireUser calls adminAuth.verifyIdToken(token). */
export const adminAuth = getAuth(app);

// Normally the "(default)" database. FIRESTORE_DATABASE_ID is set only when that database is in Datastore mode,
// which this code cannot use, and a separate Native mode database was created instead.
const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

/** The Firestore database; services/sessionStore.js makes every read and write. */
export const db = getFirestore(app, databaseId);