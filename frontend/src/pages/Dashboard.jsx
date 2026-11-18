// Dashboard: the signed-in home of /app/, in the Project 1 layout (issue #36).
// Greets the user, creates sessions, filters them by course, and lists them newest first with Rename and Delete.
// Also runs the ADK agent check (GET /api/agent-check) from a button beside the list.
import { useEffect, useRef, useState } from 'react';
import SessionCard from '../components/SessionCard.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/apiClient.js';
import { trackEvent } from '../services/analytics.js';

// Nothing to report yet.
const idleStatus = { kind: 'idle', text: '' };
// Shown while the list loads, also on the very first render, so "No study sessions yet" never flashes.
const loadingStatus = { kind: 'working', text: 'Loading your sessions...' };

/**
 * Picks the greeting for the browser's local hour.
 * @param {number} hour - 0 to 23
 * @returns {string} "Good morning", "Good afternoon" or "Good evening"
 */
function greetingFor(hour) {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) { // 6 PM
    return 'Good afternoon';
  }
  return 'Good evening';
}

/**
 * Lists each course once, in alphabetical order.
 * @param {object[]} sessions - SessionSummary objects
 * @returns {string[]} the course names
 */
function coursesIn(sessions) {
  const names = new Set(sessions.map((item) => item.course));
  return [...names].sort();
}

/**
 * The Dashboard.
 * @param {{ user: User, onOpenSession: function }} props - user is the signed-in Firebase user;
 *   onOpenSession(sessionId) opens one session
 * @returns {JSX.Element}
 */
export default function Dashboard({ user, onOpenSession }) {
  const [sessions, setSessions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [listStatus, setListStatus] = useState(loadingStatus);
  const [createStatus, setCreateStatus] = useState(idleStatus);
  const [actionStatus, setActionStatus] = useState(idleStatus);
  const [agentStatus, setAgentStatus] = useState(idleStatus);
  // The course of the latest list request, so a slower earlier answer cannot overwrite it.
  const requestedCourse = useRef('');

  /**
   * Loads the sessions of one course, or of every course.
   * @param {string} course - course name, or '' for all courses
   * @returns {Promise<void>}
   */
  async function loadSessions(course) {
    requestedCourse.current = course;
    setListStatus(loadingStatus);
    try {
      const result = await api.listSessions(course);
      if (requestedCourse.current !== course) {
        return;
      }
      setSessions(result.sessions);
      // Only the unfiltered list shows every course, so only it refreshes the filter choices.
      if (!course) {
        setCourses(coursesIn(result.sessions));
      }
      setListStatus(idleStatus);
    } catch (error) {
      trackEvent('error_shown', { operation: 'session_list' });
      setListStatus({ kind: 'error', text: error.message, onRetry: () => loadSessions(course) });
    }
  }

  // Load the list on first view and again whenever the course filter changes.
  useEffect(() => {
    loadSessions(courseFilter);
  }, [courseFilter]);

  /**
   * Opens one session in the workspace.
   * @param {string} sessionId - session id
   */
  function openSession(sessionId) {
    trackEvent('session_open');
    onOpenSession(sessionId);
  }

  /**
   * Handles the New session form.
   * @param {SubmitEvent} event - the form submit
   * @returns {Promise<void>}
   */
  async function handleCreate(event) {
    // Stop the browser from reloading the page on submit.
    event.preventDefault();
    await createSession();
  }

  /**
   * Creates a session from the form values, then opens it so the user can add a photo.
   * @returns {Promise<void>}
   */
  async function createSession() {
    setCreateStatus({ kind: 'working', text: 'Creating your session...' });
    try {
      const result = await api.createSession({ title: newTitle.trim(), course: newCourse.trim() });
      trackEvent('session_create');
      openSession(result.session.id);
    } catch (error) {
      trackEvent('error_shown', { operation: 'session_create' });
      setCreateStatus({ kind: 'error', text: error.message, onRetry: createSession });
    }
  }

  /**
   * Asks for a new title with the browser prompt, then saves it.
   * @param {object} session - the SessionSummary to rename
   * @returns {Promise<void>}
   */
  async function renameSession(session) {
    const typedTitle = window.prompt('New title for this session (1 to 80 characters)', session.title);
    // prompt returns null when the user clicks Cancel.
    if (typedTitle === null) {
      return;
    }
    await saveTitle(session.id, typedTitle.trim());
  }

  /**
   * Saves a new title and updates that row of the list.
   * @param {string} sessionId - session id
   * @param {string} title - the new title; the server checks the length
   * @returns {Promise<void>}
   */
  async function saveTitle(sessionId, title) {
    setActionStatus({ kind: 'working', text: 'Renaming the session...' });
    try {
      const result = await api.updateSession(sessionId, { title });
      trackEvent('session_rename');
      setSessions((current) => current.map((item) => (item.id === sessionId ? result.session : item)));
      setActionStatus({ kind: 'success', text: 'Session renamed.' });
    } catch (error) {
      trackEvent('error_shown', { operation: 'session_rename' });
      setActionStatus({ kind: 'error', text: error.message, onRetry: () => saveTitle(sessionId, title) });
    }
  }

  /**
   * Asks for confirmation with the browser dialog, then deletes the session.
   * @param {object} session - the SessionSummary to delete
   * @returns {Promise<void>}
   */
  async function deleteSession(session) {
    const confirmed = window.confirm(`Delete "${session.title}"? Its notes, flashcards and tutor questions are deleted too.`);
    if (!confirmed) {
      return;
    }
    await removeSession(session.id);
  }

  /**
   * Deletes a session on the server and removes it from the list.
   * @param {string} sessionId - session id
   * @returns {Promise<void>}
   */
  async function removeSession(sessionId) {
    setActionStatus({ kind: 'working', text: 'Deleting the session...' });
    try {
      await api.deleteSession(sessionId);
      trackEvent('session_delete');
      setSessions((current) => current.filter((item) => item.id !== sessionId));
      setActionStatus({ kind: 'success', text: 'Session deleted.' });
    } catch (error) {
      trackEvent('error_shown', { operation: 'session_delete' });
      setActionStatus({ kind: 'error', text: error.message, onRetry: () => removeSession(sessionId) });
    }
  }

  /**
   * Runs the ADK smoke check on the server: one agent calls one tool, which returns the value "hello".
   * @returns {Promise<void>}
   */
  async function checkAgent() {
    setAgentStatus({ kind: 'working', text: 'Running the AI agent check...' });
    try {
      const result = await api.agentCheck('hello');
      // The check passes only when the model called the tool; its reply then repeats the value.
      if (!result.toolCalled) {
        setAgentStatus({ kind: 'error', text: 'The agent replied without calling its tool.', onRetry: checkAgent });
        return;
      }
      setAgentStatus({ kind: 'success', text: `The agent called its tool. Its reply: ${result.answer || '(none)'}` });
    } catch (error) {
      trackEvent('error_shown', { operation: 'agent_check' });
      setAgentStatus({ kind: 'error', text: error.message, onRetry: checkAgent });
    }
  }

  // Greet with the first word of the Google display name, for example "Disha".
  let firstName = 'there';
  if (user.displayName) {
    firstName = user.displayName.trim().split(' ')[0];
  }
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  // The empty-state text, shown only after a list has loaded with no sessions.
  let emptyText = '';
  if (listStatus.kind === 'idle' && sessions.length === 0) {
    if (courseFilter) {
      emptyText = 'No sessions in this course yet.';
    } else {
      emptyText = 'No study sessions yet. Create your first one above.';
    }
  }

  return (
    <main className="app-shell">
      <div className="container">
        <div className="app-welcome">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>{greetingFor(new Date().getHours())}, {firstName}.</h1>
            <p className="lead">Pick up where your curiosity left off.</p>
          </div>
          <div className="new-session">
            <form className="new-session-form" onSubmit={handleCreate}>
              <div className="new-session-field">
                <label htmlFor="new-session-title">Title</label>
                <input id="new-session-title" className="form-control" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={80} required placeholder="Edge detection" />
              </div>
              <div className="new-session-field">
                <label htmlFor="new-session-course">Course</label>
                <input id="new-session-course" className="form-control" value={newCourse} onChange={(event) => setNewCourse(event.target.value)} maxLength={60} list="course-options" placeholder="General" />
                {/* Suggests the courses the user already has; any new name is allowed. */}
                <datalist id="course-options">
                  {courses.map((course) => <option key={course} value={course} />)}
                </datalist>
              </div>
              <button className="btn btn-primary" type="submit" disabled={createStatus.kind === 'working'}>
                <span aria-hidden="true">＋</span> New study session
              </button>
            </form>
            <StatusMessage status={createStatus} />
          </div>
        </div>
        <div className="row">
          <div className="col-lg-8">
            <section className="sessions-column" aria-labelledby="sessions-heading">
              <div className="column-heading">
                <h2 id="sessions-heading">Your sessions</h2>
                <span>{sessions.length} total</span>
              </div>
              <div className="dashboard-toolbar">
                <div className="course-filter">
                  <label htmlFor="course-filter">Filter by course</label>
                  <select id="course-filter" className="form-select" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                    <option value="">All courses</option>
                    {courses.map((course) => <option key={course} value={course}>{course}</option>)}
                  </select>
                </div>
              </div>
              <StatusMessage status={listStatus} />
              <StatusMessage status={actionStatus} />
              {sessions.map((item) => (
                <SessionCard
                  key={item.id}
                  session={item}
                  onOpen={() => openSession(item.id)}
                  onRename={() => renameSession(item)}
                  onDelete={() => deleteSession(item)}
                />
              ))}
              {emptyText && <p className="empty-state">{emptyText}</p>}
            </section>
          </div>
          <div className="col-lg-4">
            {/* The ADK smoke check (issue #23): shows that an agent, its tool and Gemini work in this deployment. */}
            <section className="workspace-panel h-auto" aria-labelledby="agent-check-heading">
              <p className="eyebrow">AI AGENT CHECK</p>
              <h2 id="agent-check-heading">Is the AI working?</h2>
              <p>One agent calls one tool and repeats the value the tool returns.</p>
              <button type="button" className="btn btn-outline-dark" onClick={checkAgent} disabled={agentStatus.kind === 'working'}>
                Check the AI agent
              </button>
              <StatusMessage status={agentStatus} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}