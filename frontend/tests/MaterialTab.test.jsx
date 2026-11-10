import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import MaterialTab from '../../src/components/MaterialTab.jsx';
import { createWorkspaceFixture } from '../../src/fixtures/workspaces.js';
import { button, click, fakeRequests, finishRequests, setupUi } from './helpers/ui.jsx';

const ui = setupUi();
function props(name = 'ready') {
  return {
    session: createWorkspaceFixture(name).sessions[0],
    onPhotoChange: vi.fn(), onAudioChange: vi.fn(), onMockRebuild: vi.fn()
  };
}

describe('Material input and build states', () => {
  it('keeps build disabled until both accepted inputs exist', async () => {
    const data = props('draft');
    const { container } = await ui.mount(<MaterialTab {...data} />);
    expect(button(container, 'Make notes and flashcards (preview)').disabled).toBe(true);
    expect(container.textContent).toContain('Add one photo and one recording result');
    await click(button(container, 'Select sample photo'));
    expect(container.textContent).toContain('One sample photo is selected');
    await click(button(container, 'Cancel selection'));
    expect(data.onPhotoChange).not.toHaveBeenCalled();
    expect(button(container, 'Make notes and flashcards (preview)').disabled).toBe(true);
  });

  it('preserves committed input on a failed replacement, then accepts an explicit retry', async () => {
    window.history.replaceState({}, '', '/app/?photoFailOnce=1');
    fakeRequests();
    const data = props();
    const snapshot = structuredClone(data.session);
    const { container } = await ui.mount(<MaterialTab {...data} />);
    await click(button(container, 'Replace photo'));
    await click(button(container, 'Use sample photo'));
    expect(container.querySelector('[data-status="loading"]').textContent).toContain('Processing the sample photo');
    expect(button(container, 'Make notes and flashcards (preview)').disabled).toBe(true);
    await finishRequests();
    expect(container.querySelector('[role="alert"]').textContent).toContain('photo import failed');
    expect(data.onPhotoChange).not.toHaveBeenCalled();
    expect(data.session).toEqual(snapshot);
    await click(button(container, 'Try again'));
    expect(button(container, 'Trying again…').disabled).toBe(true);
    await finishRequests();
    expect(data.onPhotoChange).toHaveBeenCalledTimes(1);
    expect(data.onPhotoChange.mock.calls[0][0].title).toContain('Replacement sample');
    expect(data.session).toEqual(snapshot);
  });

  it('cancels pending import on cancel or unmount without committing a late result', async () => {
    fakeRequests();
    const data = props();
    const view = await ui.mount(<MaterialTab {...data} />);
    await click(button(view.container, 'Replace photo'));
    await click(button(view.container, 'Use sample photo'));
    await click(button(view.container, 'Cancel import'));
    await finishRequests();
    expect(data.onPhotoChange).not.toHaveBeenCalled();
    await click(button(view.container, 'Replace photo'));
    await click(button(view.container, 'Use sample photo'));
    await view.unmount();
    await finishRequests();
    expect(data.onPhotoChange).not.toHaveBeenCalled();
  });

  it('shows build failure/retry and never claims the preview generated notes or cards', async () => {
    window.history.replaceState({}, '', '/app/?buildFailOnce=1');
    fakeRequests();
    const data = props();
    const snapshot = structuredClone(data.session);
    const { container } = await ui.mount(<MaterialTab {...data} />);
    const build = button(container, 'Make notes and flashcards (preview)');
    await click(build);
    expect(build.disabled).toBe(true);
    expect(container.querySelector('[data-status="loading"]').textContent).toContain('preview rebuild');
    await finishRequests();
    expect(container.querySelector('.material-build [role="alert"]').textContent).toContain('preview rebuild failed');
    expect(data.onMockRebuild).not.toHaveBeenCalled();
    await click(button(container, 'Try again'));
    expect(button(container, 'Trying again…').disabled).toBe(true);
    await finishRequests();
    expect(data.onMockRebuild).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('did not generate or save notes and flashcards');
    expect(data.session).toEqual(snapshot);
  });

  it('reports a caller build failure and does not claim completion', async () => {
    fakeRequests();
    const data = props();
    data.onMockRebuild.mockImplementation(() => { throw new Error('internal detail'); });
    const { container } = await ui.mount(<MaterialTab {...data} />);
    await click(button(container, 'Make notes and flashcards (preview)'));
    await finishRequests();
    expect(container.querySelector('.material-build [role="alert"]').textContent).toContain('preview rebuild failed');
    expect(container.textContent).not.toContain('internal detail');
    expect(container.textContent).not.toContain('Preview rebuild completed.');
  });

  it('clears the accepted audio only through its callback', async () => {
    const data = props();
    const { container } = await ui.mount(<MaterialTab {...data} />);
    await click(button(container, 'Clear recording result'));
    expect(data.onAudioChange).toHaveBeenCalledExactlyOnceWith(null);
  });
});
