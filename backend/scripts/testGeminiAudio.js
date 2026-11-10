import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { analyzeAudio, AudioProcessingError } from '../services/geminiAudioService.js';

const mimeTypesByExtension = {
  '.webm': 'audio/webm',
  '.mp4': 'audio/mp4',
  '.m4a': 'audio/m4a',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff'
};

class VerificationError extends Error {}

async function main() {
  const [audioPath, explicitMimeType, ...extraArgs] = process.argv.slice(2);
  if (!audioPath || extraArgs.length) {
    throw new VerificationError('Usage: node scripts/testGeminiAudio.js <audio-file> [audio-mime-type]');
  }
  const mimeType = (explicitMimeType ?? mimeTypesByExtension[extname(audioPath).toLowerCase()])
    ?.split(';')[0].trim().toLowerCase();
  if (!Object.values(mimeTypesByExtension).includes(mimeType) || /[\r\n]/.test(explicitMimeType ?? '')) {
    throw new VerificationError('Use a supported audio extension or supply its audio MIME type explicitly.');
  }

  let file;
  try {
    file = await stat(audioPath);
  } catch {
    throw new VerificationError('Audio file was not found or could not be accessed. Check the local path.');
  }
  if (!file.isFile() || file.size === 0) {
    throw new VerificationError('Choose a nonempty audio file containing a short spoken explanation.');
  }

  // Diagnostics go to stderr; stdout contains only the validated audio result.
  console.error(JSON.stringify({
    apiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
    model: process.env.GEMINI_AUDIO_MODEL?.trim() || 'gemini-3.8-flash',
    audioFileExists: true,
    audioFileBytes: file.size,
    mimeType
  }));
  let audioBuffer;
  try {
    audioBuffer = await readFile(audioPath);
  } catch {
    throw new VerificationError('Audio file could not be read. Check the local file permissions.');
  }
  try {
    const result = await analyzeAudio({ audioBuffer, mimeType });
    if (!result.transcript.trim()) {
      throw new VerificationError('The result passed validation but had no intelligible transcript. Try a clear spoken sample.');
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    audioBuffer.fill(0);
  }
}

main().catch((error) => {
  if (error instanceof AudioProcessingError) {
    console.error(`${error.code}: ${error.message}`);
  } else if (error instanceof VerificationError) {
    console.error(error.message);
  } else {
    console.error('Audio verification could not complete. Check the local setup and try again.');
  }
  process.exitCode = 1;
});
