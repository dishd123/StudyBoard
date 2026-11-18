// Structured logging for StudyBoard (issue #61): writeLog prints one JSON line, logCall times one external call.
// Cloud Run sends stdout to Cloud Logging, which reads severity and message from each JSON line.

/**
 * Writes one log entry as a single JSON line on stdout.
 * @param {'INFO'|'WARNING'|'ERROR'} severity Cloud Logging severity.
 * @param {string} message Short text shown in Logs Explorer.
 * @param {object} [fields] Extra fields: ids, operation names, status, latency, sizes. Never tokens, keys or user text.
 * @returns {void}
 */
export function writeLog(severity, message, fields) {
  const entry = { severity, message, component: 'studyboard', ...fields };
  console.log(JSON.stringify(entry));
}

/**
 * Runs one external call (Firestore, Gemini, Google Photos or ADK) and logs whether it worked and how long it took.
 * @param {{ operation: string, uid?: string, sessionId?: string }} fields Log fields; operation names the call.
 * @param {(extra: object) => Promise<any>} work The call. It may add log fields to extra,
 *   such as model, totalTokens, httpStatus or toolCalls.
 * @returns {Promise<any>} Whatever work returned.
 * @throws Whatever work threw, after one ERROR log line.
 */
export async function logCall(fields, work) {
  const startedAt = Date.now();
  const extra = {};
  try {
    const result = await work(extra);
    writeLog('INFO', `${fields.operation} ok`, { ...fields, ...extra, ok: true, latencyMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    writeLog('ERROR', `${fields.operation} failed`, {
      ...fields,
      ...extra,
      ok: false,
      latencyMs: Date.now() - startedAt,
      errorMessage: String(error.message).slice(0, 200), // SDK messages can be long; 200 characters is enough
      httpStatus: readHttpStatus(extra, error),
    });
    throw error;
  }
}

/**
 * Picks the HTTP status to log for a failed call.
 * @param {object} extra Fields the work recorded; extra.httpStatus is the status Google returned.
 * @param {Error} error The thrown error; HttpError and the Gemini ApiError both carry .status.
 * @returns {number|null} The status, or null when neither has one (Firestore errors use gRPC codes instead).
 */
function readHttpStatus(extra, error) {
  if (typeof extra.httpStatus === 'number') {
    return extra.httpStatus;
  }
  if (typeof error.status === 'number') {
    return error.status;
  }
  return null;
}