// Fresh Google Photos permission for each photo import (issue #37).
// Produces a Google access token that the backend uses for the Photos Picker; it is never stored.
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from './firebase.js';

// Read-only access to the photos the user picks in the Google Photos Picker, nothing else.
export const photosScope = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

/**
 * Opens a Google popup that asks the signed-in user for Photos Picker access.
 * Call it as the first await in a click handler, or the browser blocks the popup.
 * @returns {Promise<string>} a Google access token with the Photos Picker scope (it lasts about 1 hour)
 * @throws {FirebaseError} auth/popup-blocked, auth/popup-closed-by-user, auth/user-mismatch and other auth codes
 * @throws {Error} when Google returns no access token
 */
export async function requestPhotosToken() {
  const user = auth.currentUser;
  const provider = new GoogleAuthProvider();
  provider.addScope(photosScope);
  // Preselect the signed-in account, so the user does not pick a different one by mistake.
  if (user.email) {
    provider.setCustomParameters({ login_hint: user.email });
  }
  const result = await reauthenticateWithPopup(user, provider);
  // The popup result carries the Google OAuth credential, which holds the access token.
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential || !credential.accessToken) {
    throw new Error('Google returned no Photos access token.');
  }
  return credential.accessToken;
}