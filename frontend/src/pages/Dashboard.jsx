import React, { useId, useRef, useState } from 'react';
import SessionList from '../components/SessionList.jsx';
import SessionDialog from '../components/SessionDialog.jsx';
import BoardPreview from '../components/BoardPreview.jsx';
import StudyTab from '../components/StudyTab.jsx';
import StatusMessage from '../components/StatusMessage.jsx';

export default function Dashboard({
  sessions, allSessions, session, cards, questions, onMarkKnown, onDeleteCard, operation, processingSessionId,
  courseFilter, onFilterChange, onCreate, onRename, onDelete, onSelect, onOpen
}) {
  const filterId = useId();
  const newSessionRef = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState('');
  const courses = [...new Set(allSessions.map((item) => item.course))].sort((a, b) => a.localeCompare(b));

  function confirmAction(values) {
    if (dialog.mode === 'create') {
      onCreate(values);
      setFeedback(`Created “${values.title}” in this preview.`);
    } else if (dialog.mode === 'rename') {
      onRename(dialog.session.id, values.title);
      setFeedback(`Renamed the sample session to “${values.title}”.`);
    } else {
      onDelete(dialog.session.id);
      setFeedback(`Deleted “${dialog.session.title}” and its related sample data from this preview.`);
    }
    setDialog(null);
  }

  return (
    <main className="app-shell">
      <div className="container">
        <div className="app-welcome">
          <div>
            <p className="eyebrow">PROJECT 2 · FRONTEND PREPARATION</p>
            <h1>Your study workspace.</h1>
            <p className="lead">Organize your sessions, then open Material, Notes, and Study.</p>
          </div>
          <button ref={newSessionRef} className="btn btn-primary" onClick={() => setDialog({ mode: 'create' })}>＋ New study session</button>
        </div>
        <p className="workspace-demo-notice">Local preview only. Create, rename, delete, and filter sessions here; changes reset on refresh. Sample thumbnails use a bundled stand-in.</p>
        <StatusMessage status={feedback ? 'success' : 'idle'} message={feedback} />
        <StatusMessage
          status={operation.status === 'processing' ? 'loading' : 'idle'}
          message="Sample build is processing. This fixture does not run a real build."
        />
        <div className="dashboard-toolbar">
          <div className="course-filter">
            <label htmlFor={filterId}>Filter by course</label>
            <select id={filterId} className="form-select" value={courseFilter} onChange={(event) => {
              onFilterChange(event.target.value);
              setFeedback('');
            }}>
              <option value="">All courses</option>
              {courses.map((course) => <option key={course} value={course}>{course}</option>)}
            </select>
          </div>
          <div className="session-actions" role="group" aria-label="Selected session actions">
            <button className="btn btn-outline-dark" disabled={!session} onClick={() => setDialog({ mode: 'rename', session })}>Rename session</button>
            <button className="btn btn-outline-danger" disabled={!session} onClick={() => setDialog({ mode: 'delete', session })}>Delete session</button>
          </div>
        </div>
        <div className="row g-4">
          <div className="col-lg-4">
            <SessionList
              sessions={sessions}
              totalCount={allSessions.length}
              selectedSessionId={session?.id}
              processingSessionId={processingSessionId}
              filtered={Boolean(courseFilter)}
              onSelect={onSelect}
            />
            <div className="session-open-action">
              <button className="btn btn-primary" onClick={onOpen} disabled={!session}>Open selected session →</button>
            </div>
          </div>
          {session && <div className="col-lg-8">
            <div className="row g-4">
              <div className="col-12 dashboard-preview"><BoardPreview session={session} /></div>
              <div className="col-12"><StudyTab key={session.id} session={session} cards={cards} questions={questions} onMarkKnown={onMarkKnown} onDeleteCard={onDeleteCard} /></div>
            </div>
          </div>}
        </div>
        {dialog && (
          <SessionDialog
            mode={dialog.mode}
            session={dialog.session}
            courses={courses}
            fallbackFocusRef={newSessionRef}
            onConfirm={confirmAction}
            onClose={() => setDialog(null)}
          />
        )}
      </div>
    </main>
  );
}
