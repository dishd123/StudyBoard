// StatusMessage: the one status line each action shows (issue #5).
// Renders working and success text politely for screen readers, and errors as an alert with an optional Try again.

/**
 * Shows the state of one action.
 * @param {{ status: { kind: 'idle'|'working'|'success'|'error', text: string, onRetry?: function } }} props
 *   status.text is shown as plain text; onRetry adds a Try again button to an error.
 * @returns {JSX.Element} an aria-live region that stays on the page, even when idle
 */
export default function StatusMessage({ status }) {
  const isError = status.kind === 'error';
  // Idle gets no class, so nothing shows, but the region stays so the next message is announced.
  let className;
  if (status.kind !== 'idle') {
    className = `status-message status-message--${status.kind}`;
  }
  // Errors interrupt the screen reader (role "alert"); progress and success wait their turn (role "status").
  let role = 'status';
  let ariaLive = 'polite';
  if (isError) {
    role = 'alert';
    ariaLive = 'assertive';
  }

  return (
    <div className={className}>
      <div className="status-message__content" role={role} aria-live={ariaLive}>
        {status.kind === 'working' && <span className="status-message__spinner" aria-hidden="true"></span>}
        {status.text}
      </div>
      {isError && status.onRetry && (
        <button type="button" className="status-message__retry" onClick={status.onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}