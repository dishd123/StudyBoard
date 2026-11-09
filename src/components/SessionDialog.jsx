import React, { useEffect, useId, useRef, useState } from 'react';
import StatusMessage from './StatusMessage.jsx';

export default function SessionDialog({ mode, session, courses, fallbackFocusRef, onConfirm, onClose }) {
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const id = useId();
  const [title, setTitle] = useState(mode === 'rename' ? session.title : '');
  const [course, setCourse] = useState('');
  const [errors, setErrors] = useState({});
  const isDelete = mode === 'delete';
  const heading = mode === 'create' ? 'New study session' : mode === 'rename' ? 'Rename session' : 'Delete this session?';

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    initialFocusRef.current?.focus();
    return () => {
      dialog.close();
      // Restore after React removes the dialog and updates disabled action buttons.
      queueMicrotask(() => {
        const target = opener?.isConnected && !opener.matches(':disabled')
          ? opener : fallbackFocusRef?.current;
        target?.focus();
      });
    };
  }, [fallbackFocusRef]);

  function submit(event) {
    event.preventDefault();
    if (isDelete) {
      onConfirm();
      return;
    }
    const nextErrors = {};
    if (!title.trim()) nextErrors.title = 'Enter a session title.';
    if (mode === 'create' && !course.trim()) nextErrors.course = 'Enter a course name.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      dialogRef.current.querySelector(nextErrors.title ? '[name="title"]' : '[name="course"]').focus();
      return;
    }
    onConfirm({ title: title.trim(), course: course.trim() });
  }

  return (
    <dialog
      ref={dialogRef}
      className="session-dialog"
      aria-labelledby={`${id}-heading`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <form onSubmit={submit} noValidate>
        <h2 id={`${id}-heading`}>{heading}</h2>
        <p id={`${id}-description`}>
          {isDelete
            ? `Delete “${session.title}” and its sample cards and question history? This only changes the local preview.`
            : 'Changes are kept in this preview only and reset when you refresh.'}
        </p>
        {!isDelete && (
          <>
            <label htmlFor={`${id}-title`}>Session title</label>
            <input
              ref={initialFocusRef}
              id={`${id}-title`}
              name="title"
              className="form-control"
              value={title}
              required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${id}-errors` : undefined}
              onChange={(event) => { setTitle(event.target.value); setErrors((current) => ({ ...current, title: '' })); }}
            />
            {mode === 'create' && (
              <>
                <label htmlFor={`${id}-course`}>Course name</label>
                <input
                  id={`${id}-course`}
                  name="course"
                  className="form-control"
                  value={course}
                  list={`${id}-courses`}
                  required
                  aria-invalid={Boolean(errors.course)}
                  aria-describedby={errors.course ? `${id}-errors` : undefined}
                  onChange={(event) => { setCourse(event.target.value); setErrors((current) => ({ ...current, course: '' })); }}
                />
                <datalist id={`${id}-courses`}>
                  {courses.map((name) => <option key={name} value={name} />)}
                </datalist>
                <p className="session-form-hint">Type a course name or choose an existing suggestion.</p>
              </>
            )}
            <StatusMessage
              id={`${id}-errors`}
              status={Object.values(errors).some(Boolean) ? 'validation-error' : 'idle'}
              message={Object.values(errors).filter(Boolean).join(' ')}
            />
          </>
        )}
        <div className="session-dialog-actions">
          <button ref={isDelete ? initialFocusRef : undefined} className="btn btn-outline-dark" type="button" onClick={onClose}>Cancel</button>
          <button className={isDelete ? 'btn btn-danger' : 'btn btn-primary'} type="submit">
            {isDelete ? 'Delete this sample' : mode === 'create' ? 'Create session' : 'Save name'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
