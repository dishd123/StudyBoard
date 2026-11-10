import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AudioRecorder from '../src/components/AudioRecorder.jsx';

function createMediaMocks() {
  const streams = [];
  const recorders = [];
  const constructions = [];
  const pendingStops = [];
  const options = { defaultMime: 'audio/webm', constructorError: false, startError: false };

  class MockMediaStreamTrack {
    readyState = 'live';
    stop = vi.fn(() => { this.readyState = 'ended'; });
  }

  class MockMediaStream {
    constructor() {
      this.tracks = [new MockMediaStreamTrack(), new MockMediaStreamTrack()];
      streams.push(this);
    }
    getTracks() { return this.tracks; }
  }

  class MockMediaRecorder {
    static isTypeSupported = vi.fn(type => type === 'audio/webm;codecs=opus');
    state = 'inactive';
    ondataavailable = null;
    onstop = null;
    onerror = null;
    constructor(stream, config) {
      constructions.push({ stream, config });
      if (options.constructorError === true || (options.constructorError === 'explicit' && config)) {
        throw new DOMException('Recorder unavailable', 'NotSupportedError');
      }
      this.stream = stream;
      this.mimeType = config?.mimeType ?? options.defaultMime;
      recorders.push(this);
    }
    start = vi.fn(() => {
      if (options.startError) throw new DOMException('Start failed', 'NotSupportedError');
      this.state = 'recording';
    });
    stop = vi.fn(() => {
      this.state = 'inactive';
      // Real stop/dataavailable events arrive asynchronously, after stop() returns.
      pendingStops.push(this);
    });
    emitData(data) { this.ondataavailable?.({ data }); }
  }

  const getUserMedia = vi.fn(async () => new MockMediaStream());
  const createObjectURL = vi.fn((_blob) => `blob:recording-${createObjectURL.mock.calls.length}`);
  const revokeObjectURL = vi.fn();
  return {
    streams, recorders, constructions, options, getUserMedia, createObjectURL, revokeObjectURL,
    MockMediaRecorder, MockMediaStream, MockMediaStreamTrack,
    finishStops(data = 'recorded audio') {
      for (const recorder of pendingStops.splice(0)) {
        recorder.emitData(new Blob([data], { type: recorder.mimeType }));
        recorder.onstop?.();
      }
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('AudioRecorder lifecycle', () => {
  let media;
  let container;
  let root;
  let onUseRecording;
  let mediaDevicesDescriptor;

  beforeEach(() => {
    media = createMediaMocks();
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true, value: { getUserMedia: media.getUserMedia }
    });
    vi.stubGlobal('MediaRecorder', media.MockMediaRecorder);
    vi.stubGlobal('MediaStream', media.MockMediaStream);
    vi.stubGlobal('MediaStreamTrack', media.MockMediaStreamTrack);
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = media.createObjectURL;
      static revokeObjectURL = media.revokeObjectURL;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    onUseRecording = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    try {
      await unmount();
    } finally {
      container.remove();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
      else delete navigator.mediaDevices;
    }
  });

  async function render(props = {}) {
    await act(async () => { root.render(<AudioRecorder onUseRecording={onUseRecording} {...props} />); });
  }
  async function unmount() {
    if (!root) return;
    await act(async () => { root.unmount(); });
    root = null;
  }
  function button(label) {
    const found = [...container.querySelectorAll('button')].find(node => node.textContent === label);
    expect(found, `Button '${label}' should be rendered`).toBeDefined();
    return found;
  }
  async function click(label) { await act(async () => { button(label).click(); }); }
  async function finish(data) { await act(async () => { media.finishStops(data); }); }
  async function advance(ms) { await act(async () => { vi.advanceTimersByTime(ms); }); }
  function fakeClock() {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  }
  function playback() { return container.querySelector('audio[aria-label="Recorded explanation"]'); }
  function alert() { return container.querySelector('[role="alert"]')?.textContent; }
  function expectStopped(stream = media.streams.at(-1)) {
    for (const track of stream.getTracks()) {
      expect(track.stop).toHaveBeenCalled();
      expect(track.readyState).toBe('ended');
    }
  }
  async function record(data = 'audio') {
    await click(playback() ? 'Re-record' : 'Record explanation');
    await click('Stop recording');
    await finish(data);
  }

  it('does not request the microphone until the user starts recording', async () => {
    await render();
    expect(button('Record explanation').disabled).toBe(false);
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.recorders).toHaveLength(0);
    expect(container.querySelector('[role="timer"]')).toBeNull();
    expect(playback()).toBeNull();
  });

  it.each(['NotAllowedError', 'SecurityError'])('recovers from permission denial (%s) without starting a recorder', async name => {
    media.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', name));
    await render();
    await click('Record explanation');
    expect(alert()).toMatch(/microphone access was denied.*allow access.*record again/i);
    expect(media.recorders).toHaveLength(0);
    expect(media.streams).toHaveLength(0);
    expect(playback()).toBeNull();
    expect(button('Record explanation').disabled).toBe(false);
    expect(onUseRecording).not.toHaveBeenCalled();
    await click('Record explanation');
    expect(alert()).toBeUndefined();
    expect(media.recorders[0].state).toBe('recording');
    expect(button('Stop recording')).toBeDefined();
  });

  it('starts with a supported MIME type and updates the timer and recording indicator', async () => {
    fakeClock();
    await render();
    await click('Record explanation');
    expect(media.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
    expect(media.constructions[0].config).toEqual({ mimeType: 'audio/webm;codecs=opus' });
    expect(media.recorders[0].start).toHaveBeenCalledOnce();
    expect(media.recorders[0].state).toBe('recording');
    expect([...container.querySelectorAll('[role="status"]')].some(node => node.textContent.includes('Recording in progress.'))).toBe(true);
    expect(container.querySelector('[data-status="loading"] .status-message__spinner')).not.toBeNull();
    expect(container.querySelector('[role="timer"]').textContent).toBe('0:00 / 3:00');
    await advance(1250);
    expect(container.querySelector('[role="timer"]').textContent).toBe('0:01 / 3:00');
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('automatically stops at 180 seconds, releases tracks, and delivers the ready recording on use', async () => {
    fakeClock();
    await render();
    await click('Record explanation');
    const recorder = media.recorders[0];
    await advance(179999);
    expect(recorder.state).toBe('recording');
    expect(recorder.stop).not.toHaveBeenCalled();
    await advance(1);
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(recorder.state).toBe('inactive');
    expectStopped();
    expect(vi.getTimerCount()).toBe(0);
    await finish();
    expect(playback().getAttribute('src')).toBe('blob:recording-1');
    expect(container.textContent).toContain('Recording ready.');
    expect(container.querySelector('[role="timer"]').textContent).toBe('3:00 / 3:00');
    expect(onUseRecording).not.toHaveBeenCalled();
    await click('Use this recording');
    expect(onUseRecording).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), {
      mimeType: 'audio/webm;codecs=opus', duration: 180
    });
    await advance(180000);
    expect(recorder.stop).toHaveBeenCalledOnce();
  });

  it('manually stops, collects data through the final stop event, and returns the Blob with duration metadata', async () => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    await render();
    await click('Record explanation');
    const recorder = media.recorders[0];
    recorder.emitData(new Blob(['first'], { type: recorder.mimeType }));
    recorder.emitData(new Blob([], { type: recorder.mimeType }));
    now += 12750;
    await click('Stop recording');
    expect(recorder.stop).toHaveBeenCalledOnce();
    expectStopped();
    expect(button('Finishing recording...').disabled).toBe(true);
    expect(playback()).toBeNull();
    await finish('last');
    const blob = media.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(new Blob(['firstlast']).size);
    expect(blob.type).toBe('audio/webm;codecs=opus');
    expect(playback().controls).toBe(true);
    await click('Use this recording');
    expect(onUseRecording).toHaveBeenCalledExactlyOnceWith(blob, { mimeType: blob.type, duration: 12.75 });
    expect(container.textContent).toContain('Recording captured locally.');
  });

  it('stops an active recorder and all tracks, clears timers, and ignores queued events on unmount', async () => {
    fakeClock();
    await render();
    await click('Record explanation');
    const recorder = media.recorders[0];
    const queuedStop = recorder.onstop;
    const queuedData = recorder.ondataavailable;
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await unmount();
    expectStopped();
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(recorder.state).toBe('inactive');
    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(recorder.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      queuedData({ data: new Blob(['late']) });
      queuedStop();
      media.finishStops();
      vi.advanceTimersByTime(180000);
    });
    expect(media.createObjectURL).not.toHaveBeenCalled();
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('stops a stream granted after unmount while permission was pending', async () => {
    const permission = deferred();
    media.getUserMedia.mockReturnValueOnce(permission.promise);
    await render();
    await click('Record explanation');
    expect(button('Waiting for microphone access...').disabled).toBe(true);
    // A second click cannot issue another permission request.
    await click('Waiting for microphone access...');
    expect(media.getUserMedia).toHaveBeenCalledOnce();
    await unmount();
    const stream = new media.MockMediaStream();
    await act(async () => { permission.resolve(stream); await permission.promise; });
    expectStopped(stream);
    expect(media.recorders).toHaveLength(0);
    expect(media.createObjectURL).not.toHaveBeenCalled();
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('handles permission rejection after unmount without a recorder or result', async () => {
    const permission = deferred();
    media.getUserMedia.mockReturnValueOnce(permission.promise);
    await render();
    await click('Record explanation');
    await unmount();
    await act(async () => { permission.reject(new DOMException('Denied', 'NotAllowedError')); });
    expect(media.recorders).toHaveLength(0);
    expect(media.createObjectURL).not.toHaveBeenCalled();
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('unmounts safely while waiting for the final stop event without creating a playback URL', async () => {
    await render();
    await click('Record explanation');
    await click('Stop recording');
    expect(button('Finishing recording...').disabled).toBe(true);
    await unmount();
    await finish();
    expectStopped();
    expect(media.recorders[0].stop).toHaveBeenCalledOnce();
    expect(media.createObjectURL).not.toHaveBeenCalled();
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('revokes the playback URL on unmount', async () => {
    await render();
    await record();
    const url = playback().getAttribute('src');
    expect(media.revokeObjectURL).not.toHaveBeenCalled();
    await unmount();
    expect(media.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(url);
    expect(container.querySelector('audio')).toBeNull();
    expectStopped();
  });

  it('re-record discards the old playback URL and delivers only the new Blob on the next use', async () => {
    await render();
    await record('old');
    await click('Use this recording');
    const firstBlob = onUseRecording.mock.calls[0][0];
    await click('Re-record');
    expect(media.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:recording-1');
    expect(playback()).toBeNull();
    expect(container.textContent).not.toContain('Use this recording');
    expect(media.streams).toHaveLength(2);
    expectStopped(media.streams[0]);
    await click('Stop recording');
    await finish('new recording');
    expect(playback().getAttribute('src')).toBe('blob:recording-2');
    expect(container.textContent).toContain('Recording ready.');
    expect(onUseRecording).toHaveBeenCalledTimes(1);
    await click('Use this recording');
    const [newBlob, metadata] = onUseRecording.mock.lastCall;
    expect(newBlob).not.toBe(firstBlob);
    expect(newBlob).toBe(media.createObjectURL.mock.calls[1][0]);
    expect(newBlob.size).toBe(new Blob(['new recording']).size);
    expect(metadata.mimeType).toBe(newBlob.type);
    expect(Number.isFinite(metadata.duration)).toBe(true);
    expect(metadata.duration).toBeGreaterThanOrEqual(0);
    expect(metadata.duration).toBeLessThanOrEqual(180);
    await unmount();
    expect(media.revokeObjectURL.mock.calls).toEqual([['blob:recording-1'], ['blob:recording-2']]);
  });

  it('does not restore stale playback if permission for a replacement is denied', async () => {
    await render();
    await record('old');
    media.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await click('Re-record');
    expect(alert()).toMatch(/microphone access was denied/i);
    expect(media.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:recording-1');
    expect(playback()).toBeNull();
    expect(onUseRecording).not.toHaveBeenCalled();
    await record('replacement');
    await click('Use this recording');
    expect(onUseRecording.mock.lastCall[0]).toBe(media.createObjectURL.mock.calls[1][0]);
  });

  it.each(['mediaDevices', 'getUserMedia', 'MediaRecorder'])('explains missing %s support without attempting capture', async missing => {
    if (missing === 'mediaDevices') delete navigator.mediaDevices;
    if (missing === 'getUserMedia') navigator.mediaDevices.getUserMedia = undefined;
    if (missing === 'MediaRecorder') vi.stubGlobal('MediaRecorder', undefined);
    await render();
    expect(alert()).toMatch(/supported browser on HTTPS or localhost.*microphone access/i);
    expect(button('Record explanation').disabled).toBe(true);
    await click('Record explanation');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(media.recorders).toHaveLength(0);
    expect(playback()).toBeNull();
  });

  it.each(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'])('selects supported MIME %s and returns that Blob type', async mimeType => {
    media.MockMediaRecorder.isTypeSupported.mockImplementation(type => type === mimeType);
    await render();
    await record();
    expect(media.constructions[0].config).toEqual({ mimeType });
    expect(media.recorders[0].start).toHaveBeenCalledOnce();
    await click('Use this recording');
    expect(onUseRecording.mock.lastCall[0].type).toBe(mimeType);
    expect(onUseRecording.mock.lastCall[1].mimeType).toBe(mimeType);
  });

  it('prefers the first supported MIME when several formats are supported', async () => {
    media.MockMediaRecorder.isTypeSupported.mockReturnValue(true);
    await render();
    await click('Record explanation');
    expect(media.constructions[0].config).toEqual({ mimeType: 'audio/webm;codecs=opus' });
  });

  it.each(['no supported MIME', 'no MIME detection', 'explicit constructor failure'])('uses the browser default for %s', async reason => {
    media.options.defaultMime = 'audio/mp4';
    if (reason === 'no supported MIME') media.MockMediaRecorder.isTypeSupported.mockReturnValue(false);
    if (reason === 'no MIME detection') media.MockMediaRecorder.isTypeSupported = undefined;
    if (reason === 'explicit constructor failure') media.options.constructorError = 'explicit';
    await render();
    await record();
    expect(media.constructions.at(-1).config).toBeUndefined();
    await click('Use this recording');
    expect(onUseRecording.mock.lastCall[0].type).toBe('audio/mp4');
    expect(onUseRecording.mock.lastCall[1].mimeType).toBe('audio/mp4');
  });

  it('fails clearly and releases tracks if no MIME or browser default can be constructed', async () => {
    media.MockMediaRecorder.isTypeSupported.mockReturnValue(false);
    media.options.constructorError = true;
    await render();
    await click('Record explanation');
    expect(alert()).toMatch(/unable to start audio recording.*microphone.*try again/i);
    expect(media.recorders).toHaveLength(0);
    expectStopped();
    expect(button('Record explanation').disabled).toBe(false);
    expect(media.createObjectURL).not.toHaveBeenCalled();
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('uses the data chunk MIME when the recorder does not report a MIME type', async () => {
    media.MockMediaRecorder.isTypeSupported.mockReturnValue(false);
    media.options.defaultMime = '';
    await render();
    await click('Record explanation');
    media.recorders[0].emitData(new Blob(['audio'], { type: 'audio/ogg' }));
    await click('Stop recording');
    await finish('');
    await click('Use this recording');
    expect(onUseRecording.mock.lastCall[0].type).toBe('audio/ogg');
    expect(onUseRecording.mock.lastCall[1].mimeType).toBe('audio/ogg');
  });

  it.each([
    ['NotFoundError', /no microphone was found.*connect a microphone/i],
    ['NotReadableError', /microphone is unavailable.*close other apps/i]
  ])('explains %s and leaves recording usable', async (name, message) => {
    media.getUserMedia.mockRejectedValueOnce(new DOMException('Unavailable', name));
    await render();
    await click('Record explanation');
    expect(alert()).toMatch(message);
    expect(media.recorders).toHaveLength(0);
    expect(button('Record explanation').disabled).toBe(false);
    await record();
    expect(playback()).not.toBeNull();
  });

  it('releases tracks when MediaRecorder.start throws and allows retry', async () => {
    media.options.startError = true;
    await render();
    await click('Record explanation');
    expect(alert()).toMatch(/unable to start audio recording/i);
    expectStopped();
    expect(playback()).toBeNull();
    media.options.startError = false;
    await click('Record explanation');
    expect(media.recorders.at(-1).state).toBe('recording');
  });

  it('cleans up after a recorder error and ignores stale events during a replacement capture', async () => {
    fakeClock();
    await render();
    await click('Record explanation');
    const recorder = media.recorders[0];
    const oldStop = recorder.onstop;
    const oldData = recorder.ondataavailable;
    const oldError = recorder.onerror;
    await act(async () => { recorder.onerror(); });
    expect(alert()).toMatch(/recording was interrupted.*try again/i);
    expectStopped();
    expect(recorder.state).toBe('inactive');
    expect(vi.getTimerCount()).toBe(0);
    await click('Record explanation');
    await act(async () => {
      oldData({ data: new Blob(['stale']) });
      oldStop();
      oldError();
    });
    expect(media.recorders[1].state).toBe('recording');
    expect(playback()).toBeNull();
    expect(alert()).toBeUndefined();
    await click('Stop recording');
    await finish('fresh');
    expect(media.createObjectURL).toHaveBeenCalledOnce();
    expect(media.createObjectURL.mock.calls[0][0].size).toBe(new Blob(['fresh']).size);
  });

  it('reports empty capture without creating a URL or delivering a recording', async () => {
    await render();
    await record('');
    expect(alert()).toMatch(/no audio was captured.*record again/i);
    expectStopped();
    expect(playback()).toBeNull();
    expect(media.createObjectURL).not.toHaveBeenCalled();
    expect(onUseRecording).not.toHaveBeenCalled();
    expect(button('Record explanation').disabled).toBe(false);
  });

  it('prevents new capture or delivery when disabled but still allows stopping an active capture', async () => {
    await render({ disabled: true });
    await click('Record explanation');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    await render();
    await click('Record explanation');
    await render({ disabled: true });
    expect(button('Stop recording').disabled).toBe(false);
    await click('Stop recording');
    await finish();
    expectStopped();
    expect(button('Use this recording').disabled).toBe(true);
    expect(button('Re-record').disabled).toBe(true);
    await click('Use this recording');
    expect(onUseRecording).not.toHaveBeenCalled();
  });

  it('allows playback without a callback and keeps the use button disabled', async () => {
    await render({ onUseRecording: undefined });
    await record();
    expect(playback()).not.toBeNull();
    expect(button('Use this recording').disabled).toBe(true);
    await click('Use this recording');
    expect(onUseRecording).not.toHaveBeenCalled();
  });
});
