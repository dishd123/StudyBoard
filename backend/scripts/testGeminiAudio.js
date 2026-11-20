// Recording check from the command line (issue #162): sends one local recording to Gemini through readRecording.
// Usage: npm run test:audio -- <audio file> [content type]. Prints the transcript and points as JSON, then the time.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readRecording, toGeminiAudioType } from '../services/geminiAudioService.js';

// File extension -> the content type a browser would send for that file.
const audioTypes = new Map([
  ['.webm', 'audio/webm'],
  ['.ogg', 'audio/ogg'],
  ['.mp4', 'audio/mp4'],
  ['.m4a', 'audio/x-m4a'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
]);
// Fixed ids for the log lines: this call belongs to no signed-in user and no saved session.
const ctx = { uid: 'local-test', sessionId: 'local-test', gaClientId: null };

/**
 * Checks the arguments and the key, reads the recording, and prints what Gemini heard.
 * @returns {Promise<void>} Sets process.exitCode to 1 when anything fails.
 */
async function main() {
  const audioPath = process.argv[2];
  if (!audioPath) {
    console.error('Usage: npm run test:audio -- <audio file> [content type, for example audio/webm;codecs=opus]');
    process.exitCode = 1;
    return;
  }
  // npm run test:audio loads backend/.env, where the key lives.
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env, add your key, and try again.');
    process.exitCode = 1;
    return;
  }
  // The optional second argument overrides the type the extension implies, to test what a browser sends.
  let contentType = process.argv[3];
  if (contentType === undefined) {
    contentType = audioTypes.get(path.extname(audioPath).toLowerCase());
  }
  const geminiType = toGeminiAudioType(contentType);
  if (geminiType === null) {
    console.error('Use a .webm, .ogg, .mp4, .m4a, .mp3, .wav, .aac or .flac file, or pass a supported content type.');
    process.exitCode = 1;
    return;
  }
  let audioBytes;
  try {
    audioBytes = await readFile(audioPath);
  } catch (error) {
    console.error(`Could not read ${audioPath} (${error.code}).`);
    process.exitCode = 1;
    return;
  }
  // The upload route refuses an empty recording too.
  if (audioBytes.length === 0) {
    console.error(`${audioPath} is empty.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Sending ${path.basename(audioPath)} (${audioBytes.length} bytes) to Gemini as ${geminiType}...`);
  const startedAt = Date.now();
  try {
    const result = await readRecording(ctx, audioBytes, contentType);
    console.log(JSON.stringify(result, null, 2));
    console.log(`Gemini answered in ${Date.now() - startedAt} ms.`);
  } catch (error) {
    // The JSON log line printed above this one shows the cause.
    console.error(`Failed after ${Date.now() - startedAt} ms: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();