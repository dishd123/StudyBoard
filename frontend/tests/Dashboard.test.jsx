import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from '../../src/pages/Dashboard.jsx';
import App from '../../src/app/App.jsx';
import { createWorkspaceFixture } from '../../src/fixtures/workspaces.js';
import { button, choose, click, fill, setupUi, submit } from './helpers/ui.jsx';

const ui = setupUi();

function dashboardProps(name) {
  const data = createWorkspaceFixture(name);
  const session = data.sessions[0] ?? null;
  return {
    sessions: data.sessions, allSessions: data.sessions, session,
    cards: data.cardsBySession[session?.id] ?? [], questions: data.questionsBySession[session?.id] ?? [],
    operation: data.operation, processingSessionId: name === 'processing' ? session.id : null,
    courseFilter: '', onFilterChange: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onSelect: vi.fn(), onOpen: vi.fn(), onMarkKnown: vi.fn(), onDeleteCard: vi.fn()
  };
}

describe('Dashboard scenarios', () => {
  it.each(['empty', 'draft', 'processing', 'ready', 'failed'])('renders the %s scenario with truthful actions and feedback', async name => {
    const props = dashboardProps(name);
    const { container } = await ui.mount(<Dashboard {...props} />);
    expect(container.querySelectorAll('.session-list li')).toHaveLength(props.sessions.length);
    expect(button(container, /New study session/).disabled).toBe(false);
    for (const label of ['Rename session', 'Delete session', /Open selected session/]) {
      expect(button(container, label).disabled).toBe(name === 'empty');
    }
    if (name === 'empty') expect(container.textContent).toContain('No sample sessions yet');
    if (name === 'processing') {
      expect(container.querySelector('.session-status').textContent).toBe('Processing');
      expect(container.querySelector('[data-status="loading"]').textContent).toContain('does not run a real build');
    }
    if (name === 'failed') expect(container.querySelector('[role="alert"]').textContent).toContain(props.session.errorMessage);
    if (name === 'ready') {
      expect(container.querySelector('time').getAttribute('datetime')).toBe(props.session.createdAt);
      expect(container.querySelector('.session-card').textContent).toContain(`${props.session.cardCount} flashcards`);
    }
  });

  it('distinguishes a filtered empty list from having no sessions', async () => {
    const props = dashboardProps('ready');
    const { container } = await ui.mount(<Dashboard {...props} sessions={[]} session={null} courseFilter="Unavailable course" />);
    expect(container.textContent).toContain('No sessions match this course');
    expect(container.textContent).toContain('0 of 3');
  });
});

describe('App-owned dashboard interactions', () => {
  it('filters by course, opens the visible session, and retains selection on return', async () => {
    const { container } = await ui.mount(<App />);
    await choose(container.querySelector('select'), 'Web Systems');
    expect(container.querySelectorAll('.session-list li')).toHaveLength(1);
    expect(container.querySelector('.session-card').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.flashcard').textContent).toContain('Why validate an API request?');
    await click(button(container, /Open selected session/));
    expect(container.querySelector('h1').textContent).toBe('HTTP and APIs');
    expect(button(container, 'Material').getAttribute('aria-pressed')).toBe('true');
    await click(button(container, /Back to dashboard/));
    expect(container.querySelector('select').value).toBe('Web Systems');
    expect(container.querySelectorAll('.session-list li')).toHaveLength(1);
  });

  it('rejects whitespace, then creates and opens a trimmed draft with a new free-text course', async () => {
    const { container } = await ui.mount(<App />);
    await click(button(container, /New study session/));
    let form = container.querySelector('dialog form');
    await fill(form.querySelector('[name="title"]'), '   ');
    await fill(form.querySelector('[name="course"]'), '   ');
    await submit(form);
    expect(form.querySelector('[role="alert"]').textContent).toContain('Enter a session title.');
    expect(form.querySelector('[role="alert"]').textContent).toContain('Enter a course name.');
    expect(document.activeElement).toBe(form.querySelector('[name="title"]'));
    await fill(form.querySelector('[name="title"]'), '  Review graphs  ');
    await fill(form.querySelector('[name="course"]'), '  Discrete Math  ');
    await submit(form);
    expect(container.querySelector('dialog')).toBeNull();
    expect(container.querySelector('.session-card').textContent).toContain('Review graphs');
    expect(container.querySelector('.session-card').textContent).toContain('Discrete Math');
    expect(container.querySelector('.session-status').textContent).toBe('Draft');
    expect(container.querySelectorAll('.session-list li')).toHaveLength(4);
    await click(button(container, /Open selected session/));
    expect(container.querySelector('h1').textContent).toBe('Review graphs');
    expect(button(container, 'Make notes and flashcards (preview)').disabled).toBe(true);
  });

  it('renames without losing the existing deck and cancels deletion without data loss', async () => {
    const { container } = await ui.mount(<App />);
    await click(button(container, 'Rename session'));
    const form = container.querySelector('dialog form');
    await fill(form.querySelector('[name="title"]'), '  Renamed session  ');
    await submit(form);
    expect(container.querySelector('.session-card').textContent).toContain('Renamed session');
    expect(container.querySelector('.session-card').textContent).toContain('5 flashcards');
    expect(container.querySelector('.flashcard').textContent).toContain('Why blur before computing gradients?');
    await click(button(container, 'Delete session'));
    expect(document.activeElement).toBe(button(container.querySelector('dialog'), 'Cancel'));
    await click(button(container.querySelector('dialog'), 'Cancel'));
    expect(container.querySelectorAll('.session-list li')).toHaveLength(3);
    expect(container.querySelector('.session-card').textContent).toContain('Renamed session');
  });

  it('confirms each deletion, handles the final empty list, and recovers by creating a draft', async () => {
    const { container } = await ui.mount(<App />);
    for (let remaining = 2; remaining >= 0; remaining--) {
      await click(button(container, 'Delete session'));
      await click(button(container.querySelector('dialog'), 'Delete this sample'));
      expect(container.querySelectorAll('.session-list li')).toHaveLength(remaining);
    }
    expect(button(container, /Open selected session/).disabled).toBe(true);
    expect(button(container, 'Rename session').disabled).toBe(true);
    await click(button(container, /New study session/));
    const form = container.querySelector('dialog form');
    await fill(form.querySelector('[name="title"]'), 'Start again');
    await fill(form.querySelector('[name="course"]'), 'My course');
    await submit(form);
    expect(container.querySelectorAll('.session-list li')).toHaveLength(1);
    expect(button(container, /Open selected session/).disabled).toBe(false);
  });
});
