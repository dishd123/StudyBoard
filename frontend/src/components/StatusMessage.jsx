import React from 'react';

const variants = {
  idle: { label: '', message: '', role: 'status' },
  loading: { label: 'Working', message: 'Please wait while this finishes.', role: 'status' },
  success: { label: 'Done', message: 'The action completed successfully.', role: 'status' },
  empty: { label: 'Nothing here yet', message: 'There is nothing to display yet.', role: 'status' },
  'validation-error': { label: 'Check your input', message: 'Review the information and try again.', role: 'alert' },
  error: { label: 'Something went wrong', message: 'The action could not be completed.', role: 'alert' },
  'service-error': { label: 'Something went wrong', message: 'The service could not complete the action.', role: 'alert' }
};

/**
 * Presentational status for any async action. Pass an ApiError's safe message,
 * not the raw error object. The caller owns loading, retries, and cancellation.
 * isRetrying keeps the retry button visible but disabled until the caller settles.
 */
export default function StatusMessage({
  status = 'idle', message = '', onRetry, isRetrying = false,
  retryLabel = 'Try again', id
}) {
  const originalStatus = Object.hasOwn(variants, status) ? status : 'error';
  const activeStatus = isRetrying ? 'loading' : originalStatus;
  const variant = variants[activeStatus];
  const isActive = activeStatus !== 'idle';
  const isError = ['error', 'service-error', 'validation-error'].includes(originalStatus);
  const canRetry = isError && typeof onRetry === 'function';
  const retryText = typeof retryLabel === 'string' && retryLabel.trim() ? retryLabel : 'Try again';
  const text = isRetrying ? 'Trying again. Please wait.'
    : typeof message === 'string' && message.trim() ? message : variant.message;

  return (
    <div
      id={id}
      className={isActive ? `status-message status-message--${activeStatus}` : undefined}
      data-status={activeStatus}
    >
      {/* Keep the live region mounted when idle so later updates can be announced. */}
      <div
        className="status-message__content"
        role={variant.role}
        aria-live={variant.role === 'alert' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {isActive && (
          <>
            {activeStatus === 'loading' && <span className="status-message__spinner" aria-hidden="true" />}
            <span className="status-message__text">
              <strong className="status-message__label">{variant.label}</strong>
              <span>{text}</span>
            </span>
          </>
        )}
      </div>
      {canRetry && (
        <button
          type="button"
          className="status-message__retry"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? 'Trying again…' : retryText}
        </button>
      )}
    </div>
  );
}
