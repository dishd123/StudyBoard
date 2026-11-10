import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import StatusMessage from '../src/components/StatusMessage.jsx';
import { button, click, setupUi } from './helpers/ui.jsx';

const ui = setupUi();

describe('StatusMessage feedback', () => {
  it('keeps an empty polite live region mounted while idle, then announces loading', async () => {
    const view = await ui.mount(<StatusMessage />);
    const region = view.container.querySelector('[role="status"]');
    expect(region.textContent).toBe('');
    expect(region.getAttribute('aria-live')).toBe('polite');
    await view.render(<StatusMessage status="loading" message="Importing photo…" />);
    expect(view.container.querySelector('[role="status"]')).toBe(region);
    expect(region.textContent).toContain('Importing photo…');
    expect(view.container.querySelector('button')).toBeNull();
  });

  it.each(['empty', 'success'])('renders %s feedback without an error or retry', async status => {
    const { container } = await ui.mount(<StatusMessage status={status} message="Safe result" />);
    expect(container.querySelector('[role="status"]').textContent).toContain('Safe result');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it.each(['error', 'service-error', 'validation-error'])('announces %s and lets the caller retry once', async status => {
    const onRetry = vi.fn();
    const view = await ui.mount(<StatusMessage status={status} message="Please try again." onRetry={onRetry} />);
    expect(view.container.querySelector('[role="alert"]').getAttribute('aria-live')).toBe('assertive');
    await click(button(view.container, 'Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await view.render(<StatusMessage status={status} onRetry={onRetry} isRetrying />);
    expect(view.container.querySelector('[role="status"]').textContent).toContain('Trying again');
    expect(button(view.container, 'Trying again…').disabled).toBe(true);
    await click(button(view.container, 'Trying again…'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses a safe fallback for an unknown status and invalid message', async () => {
    const { container } = await ui.mount(<StatusMessage status="unknown" message={{ secret: 'not display text' }} />);
    expect(container.querySelector('[role="alert"]').textContent).toContain('The action could not be completed.');
    expect(container.textContent).not.toContain('secret');
  });
});
