// Shared Gemini client (issue #144): the backend's one GoogleGenAI client and generateJson, the JSON call
// that the photo and audio services make. Each call is logged and counted; failures become plain-language HttpErrors.
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { HttpError } from '../middleware/errorHandler.js';
import { sendServerEvent } from './ga4Service.js';
import { logCall } from './logCall.js';

const defaultModel = 'gemini-3.8-flash';
const notSetUpMessage = 'The AI service is not set up yet.';
const busyMessage = 'The AI service is busy. Wait a minute and try again.';
const failedMessage = 'The AI service could not process this. Try again.';

let client = null; // created on the first call, so the server still starts when GEMINI_API_KEY is missing

/**
 * Returns the backend's one GoogleGenAI client, creating it on first use.
 * @returns {GoogleGenAI} The client, set up for the Gemini Developer API with GEMINI_API_KEY.
 */
function getClient() {
  if (client === null) {
    client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY.trim(),
      enterprise: false,
      // The SDK retries 408, 429 and 5xx replies only when retryOptions is set. 3 = the first try plus 2 retries.
      httpOptions: { retryOptions: { attempts: 3 } },
    });
  }
  return client;
}

/**
 * Reads the JSON object out of a Gemini response.
 * @param {import('@google/genai').GenerateContentResponse} response The SDK response.
 * @returns {object} The parsed answer.
 * @throws {Error} When there is no answer text (blocked or cut off) or the text is not a JSON object.
 */
function readAnswer(response) {
  const text = response.text; // the first candidate's answer, without the model's thinking
  if (!text) {
    // finishReason, for example SAFETY or MAX_TOKENS, says why; logCall puts this message in the log.
    throw new Error(`Gemini returned no text (finishReason ${response.candidates?.[0]?.finishReason})`);
  }
  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned text that is not JSON');
  }
  // The schema asks for an object, but the model's output is never trusted.
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    throw new Error('Gemini returned JSON that is not an object');
  }
  return answer;
}

/**
 * Picks the message the user sees for a failed Gemini call.
 * @param {Error} error What the call threw.
 * @returns {HttpError} The error to pass on to the route.
 */
function toHttpError(error) {
  // The missing-key error already carries its message.
  if (error instanceof HttpError) {
    return error;
  }
  // 429: the project's Gemini quota is used up for now, even after the SDK's retries.
  if (error instanceof ApiError && error.status === 429) {
    return new HttpError(429, busyMessage);
  }
  // Anything else: Google refused the request, did not answer, or answered with unusable JSON.
  return new HttpError(502, failedMessage);
}

/**
 * Sends one request to Gemini and returns the JSON object it answers with.
 * @param {object} request
 * @param {{ uid: string, sessionId: string, gaClientId: string|null }} request.ctx Who asked, for logs and analytics.
 * @param {string} request.operation Log name, for example 'gemini.readBoardPhoto'.
 * @param {object[]} request.parts Content parts: the media part first, the text instruction last.
 * @param {object} request.schema JSON Schema the answer must follow.
 * @param {string} request.systemInstruction Standing rules for the model.
 * @returns {Promise<object>} The parsed answer. The caller still checks every value: valid JSON is not correct JSON.
 * @throws {HttpError} 503 without GEMINI_API_KEY, 429 when Gemini is busy, 502 for any other failure.
 */
export async function generateJson({ ctx, operation, parts, schema, systemInstruction }) {
  const model = process.env.GEMINI_MODEL || defaultModel;
  const startedAt = Date.now();
  try {
    const result = await logCall({ operation, uid: ctx.uid, sessionId: ctx.sessionId }, async (extra) => {
      // Google refuses every call without a key, so stop here with a plain message.
      if (!process.env.GEMINI_API_KEY?.trim()) {
        throw new HttpError(503, notSetUpMessage);
      }
      const response = await getClient().models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          // Copying writing or speech needs little reasoning, and low thinking is faster. LOW is the SDK's name.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          store: false, // asks Google not to store this request; projects made since 2026-10-26 store by default
        },
      });
      const totalTokens = response.usageMetadata?.totalTokenCount ?? 0; // input, thinking and output tokens
      // modelVersion names the model that answered, which can differ from the one requested.
      extra.model = response.modelVersion;
      extra.totalTokens = totalTokens;
      return { answer: readAnswer(response), totalTokens };
    });
    sendServerEvent(ctx, 'gemini_call', { // GA4 parameter names are snake_case, such as latency_ms
      operation,
      model,
      success: 1,
      latency_ms: Date.now() - startedAt,
      total_tokens: result.totalTokens,
    });
    return result.answer;
  } catch (error) {
    // logCall has already logged the real cause; the browser gets a plain message.
    sendServerEvent(ctx, 'gemini_call', {
      operation,
      model,
      success: 0,
      latency_ms: Date.now() - startedAt,
      total_tokens: 0,
    });
    throw toHttpError(error);
  }
}