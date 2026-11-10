import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SessionWorkspace from '../../src/pages/SessionWorkspace.jsx';
import NotesTab from '../../src/components/NotesTab.jsx';
import App from '../../src/app/App.jsx';
import { createWorkspaceFixture } from '../../src/fixtures/workspaces.js';
import { createNotesPreview } from '../../src/fixtures/notesPreview.js';
import { button, click, fakeRequests, finishRequests, setupUi } from './helpers/ui.jsx';

const ui = setupUi();
function props() {
  const data = createWorkspaceFixture('ready');
  const session = data.sessions[0];
  return {
    session, cards: data.cardsBySession[session.id], questions: data.questionsBySession[session.id],
    operation: data.operation, onBack: vi.fn(), onPhotoChange: vi.fn(), onAudioChange: vi.fn(),
    onMockRebuild: vi.fn(), onMarkKnown: vi.fn(), onDeleteCard: vi.fn()
  };
}

describe('workspace navigation and Notes', () => {
  it('starts on Material, activates Notes and Study, and invokes Back', async () => {
    const data = props();
    const { container } = await ui.mount(<SessionWorkspace {...data} />);
    expect(button(container, 'Material').getAttribute('aria-pressed')).toBe('true');
    await click(button(container, 'Notes'));
    expect(container.querySelector('#session-content').getAttribute('aria-labelledby')).toBe('section-notes');
    expect(container.querySelector('table')).not.toBeNull();
    await click(button(container, 'Study'));
    expect(container.querySelector('.flashcard')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Ask your study tutor"]')).not.toBeNull();
    await click(button(container, /Back to dashboard/));
    expect(data.onBack).toHaveBeenCalledTimes(1);
  });

  it.each([['Replace Photo', 'photo'], ['Re-record', 'recording'], ['Rebuild', 'build']])('moves %s from Notes to the correct Material target', async (label, target) => {
    // Enable the recording control without opening a device or constructing a recorder.
    const getUserMedia = vi.fn();
    vi.stubGlobal('MediaRecorder', class {});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const { container } = await ui.mount(<SessionWorkspace {...props()} />);
    await click(button(container, 'Notes'));
    await click(button(container, label));
    expect(button(container, 'Material').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(container.querySelector(`[data-material-target="${target}"]`));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it.each(['draft', 'processing', 'failed'])('renders %s Notes without invented explanations', async name => {
    const data = createWorkspaceFixture(name);
    const { container } = await ui.mount(<NotesTab session={data.sessions[0]} operation={data.operation} onEditMaterial={vi.fn()} />);
    expect(container.textContent).toContain('No summary has been generated');
    if (name === 'draft') expect(container.textContent).toContain('No board steps are available');
    if (name === 'processing') {
      expect(container.querySelector('[data-status="loading"]')).not.toBeNull();
      expect(container.textContent).toContain('Waiting for generated notes');
    }
    if (name === 'failed') expect(container.querySelector('[role="alert"]').textContent).toContain(data.sessions[0].errorMessage);
  });

  it('keeps written text separate from spoken corrections and flags missing explanations', async () => {
    const data = createWorkspaceFixture('ready');
    const view = await ui.mount(<NotesTab session={data.sessions[0]} operation={data.operation} onEditMaterial={vi.fn()} />);
    const corrected = view.container.querySelector('tr[data-alignment="corrected"]');
    expect(corrected.textContent).toContain('sigma 1.4');
    expect(corrected.textContent).toContain('Use sigma 2 instead of 1.4.');
    expect(view.container.textContent).toContain('Small diagram label is unreadable.');
    const unmatched = createNotesPreview(data, 'unmatched');
    await view.render(<NotesTab session={unmatched.sessions[0]} operation={unmatched.operation} onEditMaterial={vi.fn()} />);
    expect(view.container.querySelectorAll('tr[data-alignment="unmatched"]').length).toBeGreaterThan(0);
    expect(view.container.textContent).toContain('No aligned note was saved');
    expect(view.container.textContent).toContain('No matching explanation was saved');
  });

  it('invalidates old notes/cards only after accepting a photo, and keeps the same session', async () => {
    fakeRequests();
    const { container } = await ui.mount(<App />);
    await click(button(container, /Open selected session/));
    const title = container.querySelector('h1').textContent;
    await click(button(container, 'Replace photo'));
    await click(button(container, 'Cancel selection'));
    await click(button(container, 'Notes'));
    expect(container.querySelectorAll('tr[data-alignment="aligned"], tr[data-alignment="corrected"]')).toHaveLength(3);
    await click(button(container, 'Material'));
    await click(button(container, 'Replace photo'));
    await click(button(container, 'Use sample photo'));
    await finishRequests();
    expect(container.querySelector('h1').textContent).toBe(title);
    await click(button(container, 'Notes'));
    expect(container.textContent).toContain('No summary has been generated');
    await click(button(container, 'Study'));
    expect(container.textContent).toContain('No sample cards to display.');
    expect(button(container, 'Send question').disabled).toBe(true);
    await click(button(container, /Back to dashboard/));
    expect(container.querySelector('.session-status').textContent).toBe('Draft');
    expect(container.querySelector('.session-card').textContent).toContain('0 flashcards');
    expect(container.querySelectorAll('.session-list li')).toHaveLength(3);
  });
});
