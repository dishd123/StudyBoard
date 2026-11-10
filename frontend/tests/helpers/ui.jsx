import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';

// Only the new Phase 0 suites use these helpers; recorder tests keep their own setup.
export function setupUi() {
  const mounted = new Set();
  let scrollDescriptor;
  let dialogDescriptors;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Unexpected network request in a unit test'))));
    window.history.replaceState({}, '', '/app/');
    scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    // jsdom has no native modal focus containment; check that separately in a browser.
    dialogDescriptors = new Map(['showModal', 'close'].map(name => [name,
      Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true, value() { this.open = true; }
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true, value() { this.open = false; }
    });
  });

  afterEach(async () => {
    try {
      for (const view of [...mounted]) await view.unmount();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
      else delete HTMLElement.prototype.scrollIntoView;
      for (const [name, descriptor] of dialogDescriptors ?? []) {
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else delete HTMLDialogElement.prototype[name];
      }
      window.history.replaceState({}, '', '/');
    }
  });

  return {
    async mount(element) {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const view = {
        container,
        async render(next) { await act(async () => { root.render(next); }); },
        async unmount() {
          if (!mounted.delete(view)) return;
          await act(async () => { root.unmount(); });
          container.remove();
        }
      };
      mounted.add(view);
      await view.render(element);
      return view;
    }
  };
}

export function button(container, name) {
  const matches = [...container.querySelectorAll('button')].filter(node => {
    const label = (node.getAttribute('aria-label') || node.textContent).trim();
    return typeof name === 'string' ? label === name : name.test(label);
  });
  expect(matches.length, `Expected one button matching ${name}`).toBe(1);
  return matches[0];
}

export async function click(node) { await act(async () => { node.click(); }); }
export async function submit(form) {
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
export async function fill(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
export async function choose(select, value) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
export function fakeRequests() { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); }
export async function finishRequests() {
  await act(async () => { vi.runOnlyPendingTimers(); });
}
