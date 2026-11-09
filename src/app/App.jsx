import React, { useState } from 'react';
import SiteNav from '../SiteNav.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import SessionWorkspace from '../pages/SessionWorkspace.jsx';
import { createWorkspaceFixture, fixtureNames } from '../fixtures/workspaces.js';

// Development-only scenario URLs exercise fixtures without adding product controls.
const requestedFixture = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('fixture')
  : 'ready';
const workspace = createWorkspaceFixture(fixtureNames.includes(requestedFixture) ? requestedFixture : 'ready');

export default function App() {
  const [selectedSessionId, setSelectedSessionId] = useState(workspace.sessions[0]?.id ?? null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const session = workspace.sessions.find((item) => item.id === selectedSessionId) ?? null;
  const cards = workspace.cardsBySession[session?.id] ?? [];

  return (
    <>
      <SiteNav active="/app/" />
      {sessionOpen && session ? (
        <SessionWorkspace
          key={session.id}
          session={session}
          cards={cards}
          onBack={() => setSessionOpen(false)}
        />
      ) : (
        <Dashboard
          sessions={workspace.sessions}
          session={session}
          cards={cards}
          operation={workspace.operation}
          onSelect={setSelectedSessionId}
          onOpen={() => setSessionOpen(true)}
        />
      )}
    </>
  );
}
