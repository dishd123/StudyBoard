import { describe, expect, it } from 'vitest';
import { createWorkspaceFixture } from '../../src/fixtures/workspaces.js';
import { createNotesPreview } from '../../src/fixtures/notesPreview.js';
import { createSamplePhoto } from '../../src/fixtures/materialPreview.js';
import { createTutorPreview } from '../../src/fixtures/tutorPreview.js';

describe('independent revised-proposal fixtures', () => {
  it('represents empty and new draft sessions without invented material', () => {
    expect(createWorkspaceFixture('empty').sessions).toEqual([]);
    const workspace = createWorkspaceFixture('draft');
    const session = workspace.sessions[0];
    expect(session).toMatchObject({ status: 'draft', photo: null, audio: null, notes: [], summary: '', cardCount: 0 });
    expect(workspace.cardsBySession[session.id]).toEqual([]);
    expect(workspace.questionsBySession[session.id]).toEqual([]);
  });

  it('keeps processing temporary and failed input available for retry', () => {
    const processing = createWorkspaceFixture('processing');
    expect(processing.operation).toEqual({ status: 'processing', name: 'build' });
    expect(processing.sessions[0].status).toBe('draft');
    const failed = createWorkspaceFixture('failed').sessions[0];
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBeTruthy();
    expect(failed.photo).not.toBeNull();
    expect(failed.audio).not.toBeNull();
    expect(failed.notes).toEqual([]);
  });

  it('keeps every note, card, and covered question sourced to its own ready session', () => {
    const workspace = createWorkspaceFixture('ready');
    const deckIds = new Set();
    for (const session of workspace.sessions) {
      const steps = session.photo.steps.map(item => item.step);
      const cards = workspace.cardsBySession[session.id];
      expect(session.status).toBe('ready');
      expect(session.cardCount).toBe(cards.length);
      expect(cards.length).toBeGreaterThanOrEqual(5);
      expect(cards.length).toBeLessThanOrEqual(10);
      expect(session.audio.length).toBeLessThanOrEqual(180);
      for (const note of session.notes) expect(steps).toContain(note.step);
      for (const card of cards) {
        expect(steps).toContain(card.step);
        expect(deckIds.has(card.id)).toBe(false);
        deckIds.add(card.id);
      }
      for (const question of workspace.questionsBySession[session.id]) {
        if (question.covered) {
          expect(question.stepsUsed.length).toBeGreaterThan(0);
          for (const step of question.stepsUsed) expect(steps).toContain(step);
        } else expect(question.stepsUsed).toEqual([]);
      }
    }
  });

  it('isolates nested edits, note previews, and photo replacement from source fixtures', () => {
    const original = createWorkspaceFixture('ready');
    const snapshot = structuredClone(original);
    const unmatched = createNotesPreview(original, 'unmatched');
    expect(unmatched.sessions[0].notes.length).toBeLessThan(original.sessions[0].notes.length);
    expect(unmatched.sessions[0].notes.at(-1).explanation).toBeNull();
    const replacement = createSamplePhoto(original.sessions[0]);
    replacement.steps[0].text = 'changed in another preview';
    expect(original).toEqual(snapshot);
    original.sessions[0].notes[0].explanation = 'local edit';
    original.cardsBySession[original.sessions[0].id][0].known = false;
    expect(createWorkspaceFixture('ready')).toEqual(snapshot);
  });

  it('rejects unknown scenarios rather than returning an accidental fixture', () => {
    expect(() => createWorkspaceFixture('not-a-scenario')).toThrow('Unknown workspace fixture');
  });

  it('distinguishes uncovered material from an unknown fixture match and rejects invalid sources', () => {
    const workspace = createWorkspaceFixture('ready');
    const session = workspace.sessions[0];
    const [covered, uncovered] = workspace.questionsBySession[session.id];
    const steps = session.notes.map(note => note.step);
    expect(createTutorPreview(`  ${covered.question.toUpperCase()}  `, [covered], steps)).toMatchObject({ covered: true, stepsUsed: covered.stepsUsed });
    expect(createTutorPreview(uncovered.question, [uncovered], steps)).toMatchObject({ covered: false, stepsUsed: [] });
    expect(createTutorPreview('Something else', [covered], steps)).toMatchObject({ kind: 'no-match', covered: null, stepsUsed: [] });
    expect(createTutorPreview(covered.question, [covered], [])).toMatchObject({ kind: 'no-match', covered: null });
  });
});
