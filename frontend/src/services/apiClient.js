const messages = {
  400: ['INVALID_REQUEST', 'Check the request and try again.'],
  401: ['UNAUTHENTICATED', 'Sign in again to continue.'],
  403: ['FORBIDDEN', 'You do not have access to this material.'],
  404: ['NOT_FOUND', 'This session or item could not be found.'],
  408: ['REQUEST_TIMEOUT', 'The request timed out. Try again.'],
  409: ['CONFLICT', 'Finish the required step before trying again. If importing a photo, finish picking in the Google Photos tab first.'],
  422: ['VALIDATION_ERROR', 'Some information is missing or invalid. Check it and try again.'],
  429: ['RATE_LIMITED', 'Too many requests. Wait a moment before trying again.']
};

/** A safe, consistent error for StatusMessage, auth handling, and diagnostics. */
export class ApiError extends Error {
  constructor(message, { code, status = 0, requestId, retryable = false }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

function invalidRequest(requestId) {
  return new ApiError('Use a same-origin /api path and valid request options.', {
    code: 'INVALID_REQUEST', status: 400, requestId
  });
}

function normalizePath(path, requestId) {
  // A fixed parsing origin also allows importing this module in Node smoke checks.
  // Only the relative result is fetched; no configurable external base URL exists.
  if (typeof path !== 'string' || !/^\/api(?:[/?]|$)/.test(path) || /[\\#\s]/.test(path)) {
    throw invalidRequest(requestId);
  }
  const origin = 'https://studyboard.invalid';
  let url;
  try {
    url = new URL(path, origin);
  } catch {
    throw invalidRequest(requestId);
  }
  if (url.origin !== origin || !/^\/api(?:\/|$)/.test(url.pathname)) {
    throw invalidRequest(requestId);
  }
  // Reject encoded path separators/dot traversal before evaluating token scope.
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    throw invalidRequest(requestId);
  }
  if (decoded.includes('\\') || decoded.split('/').some((part) => part === '.' || part === '..') || /%2f|%5c/i.test(url.pathname)) {
    throw invalidRequest(requestId);
  }
  return { path: url.pathname + url.search, pathname: url.pathname };
}

function httpError(status, requestId) {
  const [code, message] = messages[status] ?? (status >= 500
    ? ['SERVER_ERROR', 'The service could not complete the request. Try again.']
    : ['HTTP_ERROR', 'The request could not be completed.']);
  return new ApiError(message, {
    code, status, requestId,
    retryable: [408, 409, 429].includes(status) || status >= 500
  });
}

// Classify routes to fixed labels only. Paths, query values and IDs are never
// passed to diagnostics. Unknown/new routes keep a bounded fallback label.
function diagnosticOperation(path, options) {
  if (typeof path !== 'string') return 'unknown';
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/$/, '');
  const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET';
  if (pathname === '/api/agent-check' && ['GET', 'POST'].includes(method)) return 'agent_check';
  if (pathname === '/api/sessions') return { GET: 'session_list', POST: 'session_create' }[method] ?? 'unknown';
  if (/^\/api\/sessions\/[^/]+$/.test(pathname)) {
    return { GET: 'session_read', PATCH: 'session_rename', DELETE: 'session_delete' }[method] ?? 'unknown';
  }
  if (/^\/api\/sessions\/[^/]+\/cards\/[^/]+$/.test(pathname)) {
    return { PATCH: 'card_update', DELETE: 'card_delete' }[method] ?? 'unknown';
  }
  if (/^\/api\/sessions\/[^/]+\/cards$/.test(pathname) && method === 'GET') return 'cards_list';
  if (/^\/api\/sessions\/[^/]+\/questions$/.test(pathname)) {
    return { GET: 'question_history', POST: 'tutor_question' }[method] ?? 'unknown';
  }
  if (method !== 'POST') return 'unknown';
  const action = pathname.match(/^\/api\/sessions\/[^/]+\/(picker|photo|audio|build)$/)?.[1];
  return { picker: 'photos_picker', photo: 'photo_import', audio: 'audio_submit', build: 'study_build' }[action] ?? 'unknown';
}

function diagnosticTime() {
  try { return globalThis.performance?.now() ?? Date.now(); }
  catch { return null; }
}

/**
 * Create the shared client at the auth boundary once Firebase is connected.
 * getIdToken is awaited on every request; the client never caches tokens.
 * fetchImpl and createRequestId may be injected for offline/mock verification.
 * diagnostics may be a createClientLogger() instance; omitted means no logging.
 *
 * request/get/post/patch/delete accept an /api path and an options object:
 * { json?, body?, headers?, photosToken?, signal? }. Use json for JSON payloads,
 * body for FormData/Blob uploads, and signal for caller-controlled cancellation.
 */
export function createApiClient({
  getIdToken = async () => null,
  fetchImpl = (...args) => globalThis.fetch(...args),
  createRequestId = () => globalThis.crypto.randomUUID(),
  diagnostics = null
} = {}) {
  async function performRequest(path, options = {}) {
    const requestId = createRequestId();
    const target = normalizePath(path, requestId);
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        (options.method !== undefined && typeof options.method !== 'string')) {
      throw invalidRequest(requestId);
    }
    const method = (options.method ?? 'GET').toUpperCase();
    const hasJson = Object.hasOwn(options, 'json');
    const hasBody = options.body !== undefined;
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method) ||
        (hasJson && hasBody) || (method === 'GET' && (hasJson || hasBody))) {
      throw invalidRequest(requestId);
    }

    let headers;
    let body = options.body;
    try {
      headers = new Headers(options.headers);
      if (['Authorization', 'X-Photos-Token', 'X-Request-ID'].some((name) => headers.has(name))) {
        throw invalidRequest(requestId);
      }
      headers.set('Accept', 'application/json');
      headers.set('X-Request-ID', requestId);
      if (hasJson) {
        body = JSON.stringify(options.json);
        if (body === undefined) throw invalidRequest(requestId);
        headers.set('Content-Type', 'application/json');
      } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
        // The browser must supply the multipart boundary, even if a caller set it.
        headers.delete('Content-Type');
      }

      if (options.photosToken !== undefined) {
        const isPhotoImport = method === 'POST' && /^\/api\/sessions\/[^/]+\/(picker|photo)\/?$/.test(target.pathname);
        if (!isPhotoImport || typeof options.photosToken !== 'string' || !options.photosToken || /\s/.test(options.photosToken)) {
          throw invalidRequest(requestId);
        }
        headers.set('X-Photos-Token', options.photosToken);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw invalidRequest(requestId);
    }

    if (options.signal?.aborted) {
      throw new ApiError('The request was cancelled.', { code: 'ABORTED', requestId });
    }

    let token;
    try {
      token = await getIdToken();
    } catch {
      if (options.signal?.aborted) {
        throw new ApiError('The request was cancelled.', { code: 'ABORTED', requestId });
      }
      throw new ApiError('Sign in again to continue.', {
        code: 'AUTH_TOKEN_ERROR', status: 401, requestId
      });
    }
    if (options.signal?.aborted) {
      throw new ApiError('The request was cancelled.', { code: 'ABORTED', requestId });
    }
    if (typeof token !== 'string' || !token || /\s/.test(token)) {
      throw httpError(401, requestId);
    }
    try {
      headers.set('Authorization', `Bearer ${token}`);
    } catch {
      throw new ApiError('Sign in again to continue.', {
        code: 'AUTH_TOKEN_ERROR', status: 401, requestId
      });
    }

    let responseId = requestId;
    try {
      const response = await fetchImpl(target.path, {
        method, headers, body, signal: options.signal,
        credentials: 'same-origin', mode: 'same-origin', redirect: 'error'
      });
      responseId = response.headers.get('X-Request-ID') || requestId;
      if (!response.ok) throw httpError(response.status, responseId);
      if (response.status === 204 || response.status === 205) return null;
      const text = await response.text();
      if (!text.trim()) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new ApiError('The service returned an unreadable response.', {
          code: 'INVALID_RESPONSE', status: response.status, requestId: responseId
        });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted || error?.name === 'AbortError') {
        throw new ApiError('The request was cancelled.', { code: 'ABORTED', requestId: responseId });
      }
      throw new ApiError('Could not reach the service. Check your connection and try again.', {
        code: 'NETWORK_ERROR', requestId: responseId, retryable: true
      });
    }
  }

  async function request(path, options = {}) {
    const startedAt = diagnostics ? diagnosticTime() : null;
    try {
      return await performRequest(path, options);
    } catch (error) {
      try {
        if (typeof diagnostics?.apiFailure === 'function') {
          const finishedAt = diagnosticTime();
          const durationMs = startedAt !== null && finishedAt !== null ? finishedAt - startedAt : null;
          const pending = diagnostics.apiFailure(diagnosticOperation(path, options), error, { durationMs });
          if (pending && typeof pending.then === 'function') Promise.resolve(pending).catch(() => {});
        }
      } catch { /* A broken diagnostic sink does not alter the original failure. */ }
      throw error;
    }
  }

  return Object.freeze({
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, options) => request(path, { ...options, method: 'POST' }),
    patch: (path, options) => request(path, { ...options, method: 'PATCH' }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' })
  });
}
