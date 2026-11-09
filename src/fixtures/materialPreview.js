import { createWorkspaceFixture } from './workspaces.js';

// Synthetic processed results only; no file selection, OAuth, or microphone use.
export function createSamplePhoto(session) {
  const source = structuredClone(session.photo ?? createWorkspaceFixture('ready').sessions[0].photo);
  source.title = `${session.photo ? 'Replacement sample' : 'Sample board'} for ${session.title}`;
  if (session.photo && source.steps.length) {
    source.steps[0].text = source.steps[0].text.replace(/ \(replacement sample\)$/, '') + ' (replacement sample)';
    source.visionText = source.steps.map((step) => step.text).join('\n');
  }
  return source;
}

export function createSampleAudio(session) {
  return structuredClone(session.audio ?? createWorkspaceFixture('ready').sessions[0].audio);
}
