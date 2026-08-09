import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from './api';
import { useAuth } from './auth-context';
import { mountSparkles } from './sparkles';

type Mode = 'login' | 'register';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function LoginPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  // Set by the /api/auth/verify redirect after a successful email click.
  const verified = params.get('verified') === '1';

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sparkleRef = useRef<HTMLCanvasElement>(null);

  // Dark backdrop + sparkle field (info/design/dark_theme login demo).
  useEffect(() => {
    document.body.classList.add('dark');
    const dispose = sparkleRef.current
      ? mountSparkles(sparkleRef.current, { density: 2.4, minSize: 0.6, maxSize: 1.6, speed: 0.1 })
      : undefined;
    return () => {
      dispose?.();
      document.body.classList.remove('dark');
    };
  }, []);

  // Already signed in — nothing to do on this page.
  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, next, navigate]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setFieldErrors({});
    setFormError(null);
  };

  const validate = (m: Mode): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (m === 'register' && !name.trim()) errors.name = 'Enter your name.';
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!password) {
      errors.password = 'Password is required';
    } else if (m === 'register' && (password.length < 8 || password.length > 72)) {
      errors.password = 'Password must be 8–72 characters.';
    }
    return errors;
  };

  const submit = async (e: FormEvent, m: Mode) => {
    e.preventDefault();
    const errors = validate(m);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      if (m === 'register') {
        await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });
        // No auto-login: the account starts unverified. The verify link is
        // printed to the server log (dev-mode email); the user confirms and
        // then logs in.
        setMode('login');
        setNotice('Account created! Check the server log for the verification link, then log in.');
        return;
      } else {
        await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        });
      }
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.field) {
        setFieldErrors({ [err.field]: err.message });
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Can't reach the server. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fields = (m: Mode) => (
    <>
      {m === 'register' && (
        <div className="field">
          <label className="lbl" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Alice Smith"
          />
          {fieldErrors.name && <div className="err">{fieldErrors.name}</div>}
        </div>
      )}

      <div className="field">
        <label className="lbl" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@gmail.com"
        />
        {fieldErrors.email && <div className="err">{fieldErrors.email}</div>}
      </div>

      <div className="field">
        <label className="lbl" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={m === 'register' ? 'new-password' : 'current-password'}
          aria-describedby={m === 'register' ? 'pw-hint' : undefined}
          placeholder="••••••••"
        />
        {fieldErrors.password && <div className="err">{fieldErrors.password}</div>}
        {m === 'register' && !fieldErrors.password && (
          <div className="hint" id="pw-hint">
            Create a password that is between 8 and 72 characters long.
          </div>
        )}
      </div>

      {mode === m && formError && <div className="form-error">{formError}</div>}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting
          ? m === 'login'
            ? 'Logging in…'
            : 'Creating account…'
          : m === 'login'
            ? 'Log in'
            : 'Create account'}
      </button>
    </>
  );

  return (
    <div className="auth-stage">
      <div className="auth-scene">
        <canvas ref={sparkleRef} className="sparkle-canvas" aria-hidden="true" />
        <div className="glow-amber" />
        <div className="glow-navy" />
        <div className="glow-accent" />
        <div className="grain" />
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <svg viewBox="0 0 52 52" fill="none" aria-hidden="true">
            <circle cx="26" cy="26" r="21" stroke="#fff" strokeWidth="2.2" />
            <path d="M26 26 Q 15 18 13 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </svg>
          Meridian
        </div>

        <div className="auth-tabs" role="tablist">
          <div className="tab-fill" style={{ left: mode === 'login' ? '4px' : 'calc(50% + 0px)' }} />
          <button
            type="button"
            className={mode === 'login' ? 'on' : ''}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'on' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        {verified && (
        <div className="form-ok">Email verified — you can log in now.</div>
      )}
      {notice && <div className="form-ok">{notice}</div>}

      <div className="panels">
          <div className={`panel-grid${mode === 'login' ? ' on' : ''}`}>
            <div className="panel-inner">
              <form onSubmit={(e) => submit(e, 'login')} noValidate>
                {fields('login')}
                <div className="auth-foot">
                  No account?{' '}
                  <button type="button" className="auth-link" onClick={() => switchMode('register')}>
                    Register
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div className={`panel-grid${mode === 'register' ? ' on' : ''}`}>
            <div className="panel-inner">
              <form onSubmit={(e) => submit(e, 'register')} noValidate>
                {fields('register')}
                <div className="auth-foot">
                  Already have an account?{' '}
                  <button type="button" className="auth-link" onClick={() => switchMode('login')}>
                    Log in
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
