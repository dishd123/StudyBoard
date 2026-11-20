// Photo check from the command line (issue #145): sends one local image straight to Gemini through readBoardPhoto.
// Usage: npm run test:photo -- <image file>. Prints the title, steps and unreadable parts as JSON, then the time taken.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readBoardPhoto } from '../services/geminiPhotoService.js';

// File extension -> the image type Gemini accepts.
const imageTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
]);
// Fixed ids for the log lines: this call belongs to no signed-in user and no saved session.
const ctx = { uid: 'local-test', sessionId: 'local-test', gaClientId: null };

/**
 * Checks the argument and the key, reads the image, and prints what Gemini read on it.
 * @returns {Promise<void>} Sets process.exitCode to 1 when anything fails.
 */
async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: npm run test:photo -- <image file>');
    process.exitCode = 1;
    return;
  }
  // npm run test:photo loads backend/.env, where the key lives.
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env, add your key, and try again.');
    process.exitCode = 1;
    return;
  }
  if (!apiKey.startsWith('AIza')) {
    console.error('GEMINI_API_KEY is not a Gemini API key. Use an AIza... key, not an OAuth access token or service-account credential.');
    process.exitCode = 1;
    return;
  }
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    console.error('Unset GOOGLE_API_KEY and GOOGLE_GENAI_API_KEY; use GEMINI_API_KEY for Gemini Developer API mode.');
    process.exitCode = 1;
    return;
  }
  const mimeType = imageTypes.get(path.extname(imagePath).toLowerCase());
  if (mimeType === undefined) {
    console.error('Use a .jpg, .jpeg, .png, .webp, .heic or .heif image.');
    process.exitCode = 1;
    return;
  }
  let imageBytes;
  try {
    imageBytes = await readFile(imagePath);
  } catch (error) {
    console.error(`Could not read ${imagePath} (${error.code}).`);
    process.exitCode = 1;
    return;
  }
  console.log(`Sending ${path.basename(imagePath)} (${imageBytes.length} bytes) to Gemini as ${mimeType}...`);
  const startedAt = Date.now();
  try {
    const result = await readBoardPhoto(ctx, imageBytes, mimeType);
    console.log(JSON.stringify(result, null, 2));
    console.log(`Gemini answered in ${Date.now() - startedAt} ms.`);
  } catch (error) {
    // The JSON log line printed above this one shows the cause.
    console.error(`Failed after ${Date.now() - startedAt} ms: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();