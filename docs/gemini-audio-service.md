# Direct Gemini audio service — issue #44

[Issue #44](https://github.com/dishd123/StudyBoard/issues/44) adds
`backend/services/geminiAudioService.js`. It turns in-memory recorded audio into
`{ transcript, points, length }` through a direct Gemini Developer API request.
The audio route belongs to issue #45; nothing calls this service from the UI yet.

The repository did not have a backend package. The minimal ESM package added here
keeps server dependencies separate, as planned in
[issue #13](https://github.com/dishd123/StudyBoard/issues/13). It does not add an
Express server, deployment scripts, authentication, storage, or an ADK agent.
The existing root frontend package and Project 1 deployment are unchanged.

## Setup and configuration

Use Node 22 or later, required by the installed `@google/genai` 3.0.0 SDK.
Run `npm install --prefix backend` from the repository root. The SDK version is
pinned and its resolved dependencies are recorded in `backend/package-lock.json`.

Set `GEMINI_API_KEY` in the server environment. Optionally set
`GEMINI_AUDIO_MODEL`; its default is `gemini-3.8-flash`, the Flash model used in
the current [official SDK examples](https://googleapis.github.io/js-genai/release_docs/index.html).
Whitespace-only model configuration falls back to the default. The service uses
the Gemini Developer API explicitly, regardless of cloud-backend environment
selection flags. It reads configuration when called, so importing it does not
require credentials or send a request. Do not use a Vite-prefixed environment
variable or put a key in frontend code.

## Calling the service

```js
import { analyzeAudio } from './backend/services/geminiAudioService.js';

const result = await analyzeAudio({
  audioBuffer, // Nonempty Node Buffer or Uint8Array, supplied by the later route.
  mimeType: 'audio/webm;codecs=opus',
  durationSeconds: 42.5 // Optional, finite seconds in [0, 180].
});
```

The service accepts WebM, MP4, Ogg, WAV, MPEG/MP3, M4A, AAC, FLAC, and AIFF audio
MIME types. It normalizes case and removes codec parameters before sending the
container type to Gemini. It rejects absent and unsupported MIME types, including
non-audio types. This checks the declared type, not the byte signature or decoded
duration. Transport limits, content inspection, and ownership checks belong to
the later route. No file paths, upload middleware, or audio transcoding are added.

`length` is seconds, constrained to 0–180 by the existing
[audio contract](frontend-data-contracts.md). Supplied duration takes precedence
over the model's estimate **after** the entire model result passes validation.
Without it, `length` is a model estimate, not an independently decoded duration.

The installed SDK call is `client.models.generateContent({ model, contents,
config })`. Audio is sent as a base64 `inlineData` part alongside the task text.
The system instruction requires a faithful transcript, explicit spoken points,
`[inaudible]` for unclear speech, and no invented explanations or corrections.
Silence may return an empty transcript and points array.

`config.responseMimeType` is `application/json`; `config.responseJsonSchema`
requires exactly `transcript`, `points`, and `length`. Each point has exactly
`text` and `kind`, whose enum is `explanation`, `correction`, or `emphasis`.
This uses the SDK's current
[JSON Schema support](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html#responseJsonSchema).
The service parses `response.text` directly and rejects invalid JSON, missing or
extra fields, blank point text, invalid tags, and nonnumeric/out-of-range duration.
It does not extract JSON with regex, coerce values, or repair model responses.

Raw audio and base64 exist only during request processing. The service never
writes files, uploads to the Files API, caches audio, or logs requests, responses,
or external error objects. `config.store: false` disables request logging through
the SDK's documented per-request logging setting. Returned data contains no raw
media. Callers must also discard their own input buffers when finished.

## Safe errors

`AudioProcessingError` exposes a fixed safe message and a `code`. External SDK
errors and model payloads are not attached as causes or included in messages.

| Code | Meaning |
| --- | --- |
| `INVALID_AUDIO` | Input does not contain a Buffer or Uint8Array. |
| `EMPTY_AUDIO` | Audio has no bytes. |
| `UNSUPPORTED_MIME_TYPE` | Audio MIME type is missing, malformed, or unsupported. |
| `INVALID_DURATION` | Supplied duration is not a finite number in [0, 180]. |
| `MISSING_API_KEY` | The real SDK client cannot be configured. |
| `GEMINI_API_ERROR` | SDK initialization, request, or response access failed. |
| `MISSING_MODEL_RESPONSE` | No nonempty response text is available. |
| `MALFORMED_MODEL_JSON` | Response text is not JSON. |
| `INVALID_AUDIO_RESULT` | Parsed JSON does not satisfy the fixed audio contract. |

HTTP error mapping remains in issue #45.

## Offline verification

`createGeminiAudioService({ client })` returns the same `analyzeAudio` function
with an injected SDK-shaped client. A mock needs only
`client.models.generateContent(request)` resolving to `{ text: JSON.stringify(result) }`.
Injected clients do not need a real API key. No client or request is retained by
the default exported function between calls.

Run `npm run check --prefix backend` for a syntax check. The existing root
`npm run check` and `npm run build` still validate only the frontend. This isolated
JavaScript service has no build step. Dedicated backend test infrastructure and
route tests remain in [issue #73](https://github.com/dishd123/StudyBoard/issues/73).

One-off verification on November 9, 2026 used Node `v26.8.2` on Windows.
The service imported without credentials. Offline assertions covered valid
results and all point tags, silence, duration precedence, input validation,
safe SDK failures, missing output, malformed JSON, and invalid structured data
(55 controlled error cases). A real `GoogleGenAI` instance with a mocked HTTP
transport verified inline audio serialization, JSON Schema configuration,
`store: false`, and SDK response parsing. No live model call, recording, or
credential was used; transcription quality remains unverified against Gemini.

## Live verification utility

`backend/scripts/testGeminiAudio.js` reads a real local audio file and calls the
exported production `analyzeAudio` function. It does not change service validation.
It prints preflight metadata to stderr (key presence only, selected model, file
existence, byte size, and MIME type), then prints only the validated result to
stdout. Failure produces a safe message and a nonzero exit code. A successful
run also requires a nonempty transcript. The script creates no audio or result
files and clears its input buffer after the service finishes. It leaves the
original sample file untouched.

From `backend/`, with `GEMINI_API_KEY` configured in the local environment:

```powershell
node scripts/testGeminiAudio.js "$env:USERPROFILE\Downloads\gemini-audio-test.m4a" "audio/m4a"
```

The MIME argument is optional for supported extensions: `.webm`, `.mp4`, `.m4a`,
`.ogg`, `.oga`, `.wav`, `.mp3`, `.aac`, `.flac`, `.aif`, and `.aiff`. Extension
inference does not inspect or transcode file contents; use the actual recording
format. Do not redirect results into the repository or add recordings to Git.

To create a sample on Windows, open Sound Recorder, select your microphone, and
record about 10–20 seconds. Say, for example:

> Gradient descent updates the weights to reduce the loss. The important idea is
> that the learning rate controls the size of each step. Correction: I first said
> increase the weight, but I mean update the weight in the direction that reduces
> the loss.

Stop, locate the saved recording using the app's file-location action, and use
that file's full path in the command. If needed, copy the existing recording
outside the repository to `Downloads\gemini-audio-test.m4a`; use `.m4a` only if
that is the actual format. Alternatively use WAV or another supported format
from your local recorder. The runtime StudyBoard AudioRecorder is not present
on this branch. Keep the API key in your local environment; do not paste it in
chat, logs, or documentation.

After a successful live call, run the controlled missing-key check below from
`backend/`. It removes the key only inside a child Node process, preserving the
calling shell's real environment. Replace the sample path if necessary.

```powershell
node --input-type=module -e "delete process.env.GEMINI_API_KEY; process.argv = [process.execPath, './scripts/testGeminiAudio.js', process.env.USERPROFILE + '/Downloads/gemini-audio-test.m4a', 'audio/m4a']; await import('./scripts/testGeminiAudio.js');"
```

Expected: `apiKeyPresent: false`, then the safe `MISSING_API_KEY` message and exit
code 1, without a Gemini request. The real sample must exist for this check too;
missing-file or invalid-audio failures do not verify the service's missing-key
behavior.

At preparation time, no audio sample was found in the repository or the request's
attachment directory, and the process had no `GEMINI_API_KEY`. No live request
or real-sample missing-key check has been performed.
