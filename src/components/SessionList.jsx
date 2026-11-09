import React from 'react';
import SessionCard from './SessionCard.jsx';
import StatusMessage from './StatusMessage.jsx';

export default function SessionList({
  sessions, totalCount, selectedSessionId, processingSessionId, filtered, onSelect
}) {
  return (
    <section className="sessions-column" aria-label="Sample sessions">
      <div className="column-heading">
        <h2>Your sessions</h2>
        <span>{sessions.length} of {totalCount}</span>
      </div>
      <ul className="session-list">
        {sessions.map((item) => (
          <li key={item.id}>
            <SessionCard
              session={item}
              selected={item.id === selectedSessionId}
              processing={item.id === processingSessionId}
              onSelect={() => onSelect(item.id)}
            />
          </li>
        ))}
      </ul>
      <StatusMessage
        status={sessions.length === 0 ? 'empty' : 'idle'}
        message={filtered ? 'No sessions match this course. Choose All courses to see the others.' : 'No sample sessions yet. Create a session to get started.'}
      />
    </section>
  );
}
