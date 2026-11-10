import React from 'react';
import { describe, expect, it } from 'vitest';
import TutorPanel from '../src/components/TutorPanel.jsx';
import { createWorkspaceFixture } from '../src/fixtures/workspaces.js';
import { button, click, fakeRequests, fill, finishRequests, setupUi, submit } from './helpers/ui.jsx';

const ui = setupUi();
function props(name = 'ready') {
  const data = createWorkspaceFixture(name);
  return { session: data.sessions[0], examples: data.questionsBySession[data.sessions[0].id] };
}

describe('typed tutor fixture behavior', () => {
  it('requires saved notes and validates blank questions before any pending operation', async () => {
    const view = await ui.mount(<TutorPanel {...props('draft')} />);
    expect(view.container.querySelector('input').disabled).toBe(true);
    expect(button(view.container, 'Send question').disabled).toBe(true);
    expect(view.container.textContent).toContain('Build session notes before asking');
    await view.render(<TutorPanel {...props()} />);
    await fill(view.container.querySelector('input'), '   ');
    await submit(view.container.querySelector('form'));
    expect(view.container.querySelector('[role="alert"]').textContent).toContain('Enter a question');
    expect(view.container.querySelector('input').getAttribute('aria-invalid')).toBe('true');
  });

  it.each([
    ['covered', 'Use covered sample', 'Steps used: 2'],
    ['uncovered', 'Use uncovered sample', 'No source steps cited.']
  ])('shows loading and an explicitly %s fixture result', async (_kind, label, source) => {
    fakeRequests();
    const { container } = await ui.mount(<TutorPanel {...props()} />);
    await click(button(container, label));
    await submit(container.querySelector('form'));
    expect(container.querySelector('[data-status="loading"]').textContent).toContain('No AI request');
    expect(button(container, 'Send question').disabled).toBe(true);
    await finishRequests();
    expect(container.querySelector('[data-status="success"]').textContent).toContain('Fixture response:');
    expect(container.textContent).toContain(source);
    expect(button(container, 'Send question').disabled).toBe(false);
  });

  it('does not fabricate an answer or coverage assessment for an arbitrary question', async () => {
    fakeRequests();
    const { container } = await ui.mount(<TutorPanel {...props()} />);
    await fill(container.querySelector('input'), 'How do spacecraft navigate?');
    await submit(container.querySelector('form'));
    await finishRequests();
    expect(container.textContent).toContain('No matching fixture answer');
    expect(container.textContent).toContain('cannot determine whether your notes cover it');
    expect(container.textContent).toContain('No source steps cited.');
  });

  it('retains a failed question and disables duplicate retries until recovery', async () => {
    window.history.replaceState({}, '', '/app/?tutorFailOnce=1');
    fakeRequests();
    const { container } = await ui.mount(<TutorPanel {...props()} />);
    await click(button(container, 'Use covered sample'));
    const question = container.querySelector('input').value;
    await submit(container.querySelector('form'));
    await finishRequests();
    expect(container.querySelector('[role="alert"]').textContent).toContain('tutor preview failed');
    expect(container.querySelector('input').value).toBe(question);
    await click(button(container, 'Try again'));
    expect(button(container, 'Trying again…').disabled).toBe(true);
    await finishRequests();
    expect(container.querySelector('[data-status="success"]').textContent).toContain('Fixture response:');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels a pending reply on unmount so it cannot appear in another session', async () => {
    fakeRequests();
    const view = await ui.mount(<TutorPanel {...props()} />);
    await click(button(view.container, 'Use covered sample'));
    await submit(view.container.querySelector('form'));
    await view.unmount();
    const data = createWorkspaceFixture('ready');
    const session = data.sessions[1];
    const next = await ui.mount(<TutorPanel session={session} examples={data.questionsBySession[session.id]} />);
    await finishRequests();
    expect(next.container.querySelector('[data-status="success"]')).toBeNull();
    expect(next.container.querySelector('input').value).toBe('');
  });
});
