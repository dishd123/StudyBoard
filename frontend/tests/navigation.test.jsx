import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import SiteNav from '../../src/SiteNav.jsx';
import { setupUi } from './helpers/ui.jsx';

const ui = setupUi();
const destinations = [
  ['/', 'Home'], ['/about.html', 'About'], ['/contact.html', 'Contact'], ['/app/', 'App'], ['/login/', 'Sign in']
];

function checkNavigation(container, active) {
  const nav = container.querySelector('nav[aria-label="Main navigation"]');
  expect(nav).not.toBeNull();
  for (const [href, label] of destinations) {
    const link = [...nav.querySelectorAll('a')].find(item => item.textContent.trim() === label);
    expect(link, label).toBeDefined();
    expect(link.getAttribute('href')).toBe(href);
    expect(link.getAttribute('aria-current')).toBe(href === active ? 'page' : null);
  }
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(nav.querySelector('.navbar-brand').getAttribute('href')).toBe('/');
  const toggle = nav.querySelector('button[aria-label="Toggle navigation"]');
  expect(toggle.getAttribute('aria-controls')).toBe(nav.querySelector('.navbar-collapse').id);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.getAttribute('data-bs-target')).toBe(`#${toggle.getAttribute('aria-controls')}`);
}

describe('Project 1 navigation preservation', () => {
  it.each(destinations)('keeps React navigation destinations and marks %s current', async active => {
    const { container } = await ui.mount(<SiteNav active={active} />);
    checkNavigation(container, active);
  });

  it.each(['/', '/index.html', '/about.html', '/contact.html'])('initializes static navigation correctly at %s', async route => {
    window.history.replaceState({}, '', route);
    const host = document.createElement('div');
    host.innerHTML = '<div id="site-nav"></div><div id="site-footer"></div>';
    document.body.append(host);
    try {
      vi.resetModules();
      await import('../../js/site.js');
      checkNavigation(host, route === '/index.html' ? '/' : route);
      expect(host.querySelector('footer').textContent).toContain('StudyBoard');
    } finally { host.remove(); }
  });

  it('retains both React HTML entry points and the Home App-launch link', () => {
    // The documented npm command runs at the repository root. Vitest exposes
    // browser module URLs here, so resolve HTML through the working directory.
    const home = readFileSync('index.html', 'utf8');
    const app = readFileSync('app/index.html', 'utf8');
    const login = readFileSync('login/index.html', 'utf8');
    const markup = document.createElement('div');
    markup.innerHTML = home;
    expect([...markup.querySelectorAll('a')].find(link => link.textContent.includes('Explore the App')).getAttribute('href')).toBe('/app/');
    markup.innerHTML = app;
    expect(markup.querySelector('script[type="module"]').getAttribute('src')).toBe('/src/app/main.jsx');
    markup.innerHTML = login;
    expect(markup.querySelector('script[type="module"]').getAttribute('src')).toBe('/src/login/main.jsx');
  });
});
