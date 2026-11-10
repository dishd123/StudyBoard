import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/services/apiClient.js';

// Injected transport only: no test in this file calls the global network fetch.
function client(response = { ok: true, status: 200, headers: new Headers(), text: async () => '{"saved":true}' }) {
  const fetchImpl = vi.fn().mockResolvedValue(response);
  const getIdToken = vi.fn().mockResolvedValue('sample-id-token');
  return { api: createApiClient({ getIdToken, fetchImpl, createRequestId: () => 'unit-request' }), fetchImpl, getIdToken };
}

describe('protected API transport contract', () => {
  it('requests a fresh ID token for each call and serializes JSON without following redirects', async () => {
    const { api, fetchImpl, getIdToken } = client();
    getIdToken.mockResolvedValueOnce('first-token').mockResolvedValueOnce('second-token');
    await expect(api.post('/api/sessions', { json: { title: 'Sample', course: 'Web' } })).resolves.toEqual({ saved: true });
    await api.get('/api/sessions');
    expect(getIdToken).toHaveBeenCalledTimes(2);
    const first = fetchImpl.mock.calls[0][1];
    expect(first.headers.get('Authorization')).toBe('Bearer first-token');
    expect(first.headers.get('X-Request-ID')).toBe('unit-request');
    expect(first.body).toBe(JSON.stringify({ title: 'Sample', course: 'Web' }));
    expect(first.redirect).toBe('error');
    expect(fetchImpl.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer second-token');
  });

  it('fails closed before transport when no identity is available', async () => {
    const fetchImpl = vi.fn();
    await expect(createApiClient({ fetchImpl }).get('/api/sessions')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'UNAUTHENTICATED', false], [403, 'FORBIDDEN', false], [404, 'NOT_FOUND', false],
    [409, 'CONFLICT', true], [422, 'VALIDATION_ERROR', false], [429, 'RATE_LIMITED', true], [503, 'SERVER_ERROR', true]
  ])('normalizes HTTP %s without leaking provider text or automatically replaying', async (status, code, retryable) => {
    const { api, fetchImpl } = client({ ok: false, status, headers: new Headers({ 'X-Request-ID': 'server-request' }), text: async () => 'private provider detail' });
    const error = await api.post('/api/sessions/demo/build').catch(value => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, retryable, requestId: 'server-request' });
    expect(error.message).not.toContain('private provider detail');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['https://other.example/api/sessions', '//other.example/api/sessions', '/api/../outside', '/api/sessions/x%2fy/photo'])('rejects unsafe path %s before transport', async path => {
    const { api, fetchImpl } = client();
    await expect(api.get(path)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('scopes a Photos token to one import and rejects it on unrelated calls', async () => {
    const { api, fetchImpl } = client();
    await api.post('/api/sessions/demo/picker', { photosToken: 'sample-photos-token' });
    await api.post('/api/sessions/demo/photo', { photosToken: 'sample-photos-token' });
    await api.get('/api/sessions');
    expect(fetchImpl.mock.calls[0][1].headers.get('X-Photos-Token')).toBe('sample-photos-token');
    expect(fetchImpl.mock.calls[1][1].headers.get('X-Photos-Token')).toBe('sample-photos-token');
    expect(fetchImpl.mock.calls[2][1].headers.has('X-Photos-Token')).toBe(false);
    await expect(api.post('/api/sessions/demo/audio', { photosToken: 'sample-photos-token' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('lets the browser supply the multipart boundary and handles an empty success response', async () => {
    const { api, fetchImpl } = client({ ok: true, status: 204, headers: new Headers() });
    const form = new FormData();
    form.append('audio', new Blob(['synthetic bytes'], { type: 'audio/webm' }), 'sample.webm');
    await expect(api.post('/api/sessions/demo/audio', { body: form, headers: { 'Content-Type': 'multipart/form-data' } })).resolves.toBeNull();
    expect(fetchImpl.mock.calls[0][1].body).toBe(form);
    expect(fetchImpl.mock.calls[0][1].headers.has('Content-Type')).toBe(false);
  });

  it('normalizes network failure and caller cancellation without retrying', async () => {
    const { api, fetchImpl } = client();
    fetchImpl.mockRejectedValueOnce(new Error('private socket detail'));
    await expect(api.get('/api/sessions')).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(api.get('/api/sessions', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED', retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
