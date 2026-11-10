// Issue #62: diagnostic metadata only. Application content is never inspected.
const operations = new Set([
  'session_list', 'session_create', 'session_read', 'session_rename', 'session_delete',
  'cards_list', 'card_update', 'card_delete', 'photos_picker', 'photo_import',
  'audio_submit', 'study_build', 'tutor_question', 'question_history', 'agent_check'
]);

const categories = Object.freeze({
  INVALID_REQUEST: 'validation', VALIDATION_ERROR: 'validation',
  UNAUTHENTICATED: 'auth', AUTH_TOKEN_ERROR: 'auth', FORBIDDEN: 'access',
  NOT_FOUND: 'prerequisite', CONFLICT: 'prerequisite', RATE_LIMITED: 'rate_limit',
  REQUEST_TIMEOUT: 'network', NETWORK_ERROR: 'network',
  SERVER_ERROR: 'service', HTTP_ERROR: 'service', INVALID_RESPONSE: 'service',
  ABORTED: 'cancelled'
});

// apiClient creates UUID v4 request IDs. A server must echo/use that convention
// for correlation; arbitrary response-header text is not safe diagnostic data.
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ownValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function consoleWriter(record) {
  const method = record.severity === 'INFO' ? 'info' : 'warn';
  console[method]('[StudyBoard diagnostic]', JSON.stringify(record));
}

/**
 * Local structured diagnostics. Inject a writer for tests; no network, storage,
 * Cloud Logging credentials, GA4 event, or global error handler is installed.
 * Every returned/emitted record has the same allowlisted scalar fields.
 */
export function createClientLogger({ write = consoleWriter, now = () => Date.now() } = {}) {
  function apiFailure(operation, error, timing = {}) {
    try {
      const candidateCode = ownValue(error, 'code');
      const code = typeof candidateCode === 'string' && Object.hasOwn(categories, candidateCode)
        ? candidateCode : 'UNKNOWN_ERROR';
      const candidateStatus = ownValue(error, 'status');
      const candidateId = ownValue(error, 'requestId');
      const candidateDuration = ownValue(timing, 'durationMs');
      const record = Object.freeze({
        severity: code === 'ABORTED' ? 'INFO' : 'WARNING',
        event: 'frontend_api_failure',
        timestamp: new Date(now()).toISOString(),
        operation: typeof operation === 'string' && operations.has(operation) ? operation : 'unknown',
        code,
        category: code === 'UNKNOWN_ERROR' ? 'unknown' : categories[code],
        status: Number.isInteger(candidateStatus) && (candidateStatus === 0 || (candidateStatus >= 100 && candidateStatus <= 599))
          ? candidateStatus : 0,
        requestId: typeof candidateId === 'string' && requestIdPattern.test(candidateId)
          ? candidateId.toLowerCase() : null,
        retryable: ownValue(error, 'retryable') === true,
        durationMs: typeof candidateDuration === 'number' && Number.isFinite(candidateDuration) && candidateDuration >= 0
          ? Math.round(candidateDuration) : null
      });
      const pending = write(record);
      // A mistakenly asynchronous writer must not create an unhandled rejection.
      if (pending && typeof pending.then === 'function') Promise.resolve(pending).catch(() => {});
      return record;
    } catch {
      // Diagnostics must never replace an application error or log their own failure.
      return null;
    }
  }

  return Object.freeze({ apiFailure });
}
