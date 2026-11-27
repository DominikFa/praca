import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import './AuthView.css';

export function AuthView() {
  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/events', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-mark">
            <span className="brand-stamp">EP</span>
            <span>EventPass</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        <div className="auth-body">
          {error && <div className="alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="form-field">
                <label htmlFor="auth-name">Name or Nickname</label>
                <input
                  id="auth-name"
                  className="input"
                  placeholder="e.g. Jan Kowalski or @jank"
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                className="input"
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}