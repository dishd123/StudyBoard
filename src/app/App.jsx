import React, { useState } from 'react';
import SiteNav from '../SiteNav.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import SessionWorkspace from '../pages/SessionWorkspace.jsx';
import { demoCards, demoSessions } from './demoData.js';

export default function App() {
  const [selectedSessionId, setSelectedSessionId] = useState(demoSessions[0].id);
  const [sessionOpen, setSessionOpen] = useState(false);
  const session = demoSessions.find((item) => item.id === selectedSessionId);

  return (
    <>
      <SiteNav active="/app/" />
      {sessionOpen ? (
        <SessionWorkspace
          key={session.id}
          session={session}
          cards={demoCards}
          onBack={() => setSessionOpen(false)}
        />
      ) : (
        <Dashboard
          sessions={demoSessions}
          session={session}
          cards={demoCards}
          onSelect={setSelectedSessionId}
          onOpen={() => setSessionOpen(true)}
        />
      )}
    </>
  );
}
