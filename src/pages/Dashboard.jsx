import React from 'react';
import SessionCard from '../components/SessionCard.jsx';
import BoardPreview from '../components/BoardPreview.jsx';
import StudyTab from '../components/StudyTab.jsx';

export default function Dashboard({ sessions, session, cards, operation, onSelect, onOpen }) {
  return (
    <main className="app-shell">
      <div className="container">
        <div className="app-welcome">
          <div>
            <p className="eyebrow">PROJECT 2 · FRONTEND PREPARATION</p>
            <h1>Your study workspace.</h1>
            <p className="lead">Explore the sample sessions, then open Material, Notes, and Study.</p>
          </div>
          <button className="btn btn-primary" disabled>＋ New study session</button>
        </div>
        <p className="workspace-demo-notice">Synthetic sample data only. Each session has its own cards; thumbnails use the same bundled stand-in. Changes are not saved.</p>
        {operation.status === 'processing' && <p role="status">Sample build is processing. This fixture does not run a real build.</p>}
        <div className="row g-4">
          <div className="col-lg-4">
            <section className="sessions-column" aria-label="Sample sessions">
              <div className="column-heading"><h2>Your sessions</h2><span>{sessions.length} total</span></div>
              {sessions.map((item) => (
                <SessionCard
                  key={item.id}
                  session={item}
                  selected={item.id === session?.id}
                  onSelect={() => onSelect(item.id)}
                />
              ))}
              {sessions.length === 0 && <p>No sample sessions yet.</p>}
              <button className="btn btn-primary" onClick={onOpen} disabled={!session}>Open selected session →</button>
              <button className="text-button d-block" disabled>View all sessions →</button>
            </section>
          </div>
          {session && <div className="col-lg-8">
            <div className="row g-4">
              <div className="col-12"><BoardPreview session={session} /></div>
              <div className="col-12"><StudyTab key={session.id} cards={cards} /></div>
            </div>
          </div>}
        </div>
      </div>
    </main>
  );
}
