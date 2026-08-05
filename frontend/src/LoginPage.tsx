import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from './api';
import { useAuth } from './auth-context';

type Mode = 'login' | 'register';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function LoginPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — nothing to do on this page.
  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, next, navigate]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setFieldErrors({});
    setFormError(null);
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (mode === 'register' && !name.trim()) errors.name = 'Enter your name.';
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!password) {
      errors.password = 'Password is required';
    } else if (mode === 'register' && (password.length < 8 || password.length > 72)) {
      errors.password = 'Password must be 8–72 characters.';
    }
    return errors;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'register') {
        await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });
        // register doesn't set the session cookie — sign in right after.
        await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        });
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

  return (
    <div className="auth-stage">
      <div className="auth-card">
        <div className="auth-tabs" role="tablist">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>
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

        <form key={mode} onSubmit={submit} noValidate>
          {mode === 'register' && (
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
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              aria-describedby={mode === 'register' ? 'pw-hint' : undefined}
            />
            {fieldErrors.password && <div className="err">{fieldErrors.password}</div>}
            {mode === 'register' && !fieldErrors.password && (
              <div className="hint" id="pw-hint">
                Create a password that is between 8 and 72 characters long.
              </div>
            )}
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting
              ? mode === 'login'
                ? 'Logging in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
