import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../css/site.css';
import SiteNav from '../SiteNav.jsx';

function LoginForm({ credentials, setCredentials, onCreateAccount, accountNotice, headingRef }) {
  const [message, setMessage] = useState('');
  const update = (key, value) => {
    setCredentials((previous) => ({ ...previous, [key]: value }));
    setMessage('');
  };

  return (
    <form className="auth-form" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      setMessage('Sign-in preview only. No authentication was performed.');
    }}>
      <p className="eyebrow">SIGN IN PREVIEW</p>
      <h1 ref={headingRef} tabIndex={-1}>Sign in to your board.</h1>
      <p className="auth-copy">Continue building understanding, one session at a time.</p>
      <label htmlFor="login">Login</label>
      <input id="login" className="form-control" value={credentials.login} onChange={(event) => update('login', event.target.value)} required placeholder="Sample login" />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" className="form-control" value={credentials.password} onChange={(event) => update('password', event.target.value)} required placeholder="Sample password" />
      <button className="btn btn-primary w-100 mt-4" type="submit">Preview sign in</button>
      <button className="create-account-button" type="button" onClick={onCreateAccount}>Create an account</button>
      <p className="form-status" role="status" aria-live="polite">{message || accountNotice}</p>
    </form>
  );
}

function CreateAccountForm({ setCredentials, onComplete, headingRef }) {
  const [details, setDetails] = useState({ name: '', email: '', login: '', password: '' });
  const update = (key, value) => setDetails((previous) => ({ ...previous, [key]: value }));

  return (
    <form className="auth-form account-form" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      setCredentials({ login: details.login, password: details.password });
      onComplete(true);
    }}>
      <p className="eyebrow">ACCOUNT PREVIEW</p>
      <h1 className="account-title" ref={headingRef} tabIndex={-1}>Create your account.</h1>
      <p className="auth-copy">Try the layout with sample details. Submitting does not create an account.</p>
      {[
        ['name', 'Name', 'Sample name'],
        ['email', 'Email', 'sample@example.com'],
        ['login', 'Login', 'Sample login'],
        ['password', 'Password', 'Sample password']
      ].map(([key, label, placeholder]) => (
        <React.Fragment key={key}>
          <label htmlFor={`account-${key}`}>{label}</label>
          <input id={`account-${key}`} className="form-control" type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'} required placeholder={placeholder} value={details[key]} onChange={(event) => update(key, event.target.value)} />
        </React.Fragment>
      ))}
      <button className="btn btn-primary w-100 mt-4" type="submit">Preview account details</button>
      <button className="create-account-button" type="button" onClick={() => onComplete(false)}>Back to sign in</button>
    </form>
  );
}

function LoginApp() {
  const [showAccount, setShowAccount] = useState(false);
  const [credentials, setCredentials] = useState({ login: '', password: '' });
  const [accountNotice, setAccountNotice] = useState('');
  const headingRef = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [showAccount]);

  return (
    <>
      <SiteNav active="/login/" />
      <main className="auth-page">
        <div className="auth-layout">
          <div className="auth-visual image-slot">
            <img src="/images/signin.jpg" alt="Handwritten study notes" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: 'top center', borderRadius: 28 }} />
            <div className="auth-scribble">learn<br />what<br />matters</div>
            <p className="auth-caption">A glimpse from a student's class notes.</p>
          </div>
          <div className="auth-card auth-preview-card">
            <p className="workspace-demo-notice">Preview only. Google sign-in is not connected yet. These forms do not authenticate users or create accounts; use sample values only.</p>
            {showAccount ? (
              <CreateAccountForm setCredentials={setCredentials} headingRef={headingRef} onComplete={(submitted) => {
                setAccountNotice(submitted ? 'Account preview complete. Sample login fields were copied; no account was created.' : '');
                setShowAccount(false);
              }} />
            ) : (
              <LoginForm credentials={credentials} setCredentials={setCredentials} accountNotice={accountNotice} headingRef={headingRef} onCreateAccount={() => {
                setAccountNotice('');
                setShowAccount(true);
              }} />
            )}
            <a className="auth-preview-link" href="/app/">Open app preview →</a>
          </div>
        </div>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<LoginApp />);
