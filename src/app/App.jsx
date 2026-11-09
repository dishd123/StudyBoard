import React, { useState } from 'react';
import SiteNav from '../SiteNav.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import SessionWorkspace from '../pages/SessionWorkspace.jsx';
import { createWorkspaceFixture, fixtureNames } from '../fixtures/workspaces.js';
import { createSession } from '../models/session.js';
import { createNotesPreview } from '../fixtures/notesPreview.js';

// Development-only scenario URLs exercise fixtures without adding product controls.
const requestedFixture = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('fixture')
  : 'ready';
const fixtureName = fixtureNames.includes(requestedFixture) ? requestedFixture : 'ready';
const idleOperation = { status: 'idle', name: null };

export default function App() {
  const [workspace, setWorkspace] = useState(() => {
    const initial = createWorkspaceFixture(fixtureName);
    return import.meta.env.DEV
      ? createNotesPreview(initial, new URLSearchParams(window.location.search).get('notesPreview'))
      : initial;
  });
  const [selectedSessionId, setSelectedSessionId] = useState(workspace.sessions[0]?.id ?? null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  // Fixture processing belongs to the initial session, not any new selection.
  const [processingSessionId] = useState(() => workspace.operation.status === 'processing'
    ? workspace.sessions[0]?.id : null);
  const sessions = [...workspace.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visibleSessions = sessions.filter((item) => !courseFilter || item.course === courseFilter);
  const session = visibleSessions.find((item) => item.id === selectedSessionId) ?? visibleSessions[0] ?? null;
  const cards = workspace.cardsBySession[session?.id] ?? [];

  function changeCourseFilter(course) {
    setCourseFilter(course);
    setSelectedSessionId(null);
  }

  function addSession({ title, course }) {
    const newSession = createSession({
      id: crypto.randomUUID(), title: title.trim(), course: course.trim(),
      createdAt: new Date().toISOString()
    });
    setWorkspace((current) => ({
      ...current,
      sessions: [newSession, ...current.sessions],
      cardsBySession: { ...current.cardsBySession, [newSession.id]: [] },
      questionsBySession: { ...current.questionsBySession, [newSession.id]: [] }
    }));
    setCourseFilter('');
    setSelectedSessionId(newSession.id);
  }

  function renameSession(id, title) {
    setWorkspace((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.id === id
        ? { ...item, title: title.trim(), updatedAt: new Date().toISOString() } : item)
    }));
  }

  function deleteSession(id) {
    const remaining = workspace.sessions.filter((item) => item.id !== id);
    setWorkspace((current) => ({
      ...current,
      sessions: current.sessions.filter((item) => item.id !== id),
      cardsBySession: Object.fromEntries(Object.entries(current.cardsBySession).filter(([key]) => key !== id)),
      questionsBySession: Object.fromEntries(Object.entries(current.questionsBySession).filter(([key]) => key !== id))
    }));
    if (courseFilter && !remaining.some((item) => item.course === courseFilter)) setCourseFilter('');
    setSelectedSessionId(null);
    setSessionOpen(false);
  }

  function updateMaterial(id, field, value) {
    // Only committed input changes invalidate derived output; cancelled selection does not.
    setWorkspace((current) => {
      if (!current.sessions.some((item) => item.id === id)) return current;
      return {
        ...current,
        operation: id === processingSessionId ? idleOperation : current.operation,
        sessions: current.sessions.map((item) => item.id === id ? {
          ...item, [field]: value, status: 'draft', errorMessage: null,
          summary: '', notes: [], cardCount: 0, updatedAt: new Date().toISOString()
        } : item),
        cardsBySession: { ...current.cardsBySession, [id]: [] }
      };
    });
  }

  function rebuildPreview(id) {
    const target = workspace.sessions.find((item) => item.id === id);
    if (!target?.photo || !target.audio) throw new Error('Missing preview material');
    // No notes/cards are generated and no stored processing status is changed.
    return { sessionId: id, preview: true };
  }

  return (
    <>
      <SiteNav active="/app/" />
      {sessionOpen && session ? (
        <SessionWorkspace
          key={session.id}
          session={session}
          cards={cards}
          operation={session?.id === processingSessionId ? workspace.operation : idleOperation}
          onPhotoChange={(photo) => updateMaterial(session.id, 'photo', photo)}
          onAudioChange={(audio) => updateMaterial(session.id, 'audio', audio)}
          onMockRebuild={() => rebuildPreview(session.id)}
          onBack={() => setSessionOpen(false)}
        />
      ) : (
        <Dashboard
          sessions={visibleSessions}
          allSessions={sessions}
          session={session}
          cards={cards}
          operation={session?.id === processingSessionId ? workspace.operation : idleOperation}
          processingSessionId={workspace.operation.status === 'processing' ? processingSessionId : null}
          courseFilter={courseFilter}
          onFilterChange={changeCourseFilter}
          onCreate={addSession}
          onRename={renameSession}
          onDelete={deleteSession}
          onSelect={setSelectedSessionId}
          onOpen={() => setSessionOpen(true)}
        />
      )}
    </>
  );
}
