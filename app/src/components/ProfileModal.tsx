import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Modal } from './Modal';
import './ProfileModal.css';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user, updateProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setPassword('');
      setError(null);
      setSuccess(null);
    }
  }, [open, user]);

  if (!user) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: { name?: string; password?: string } = {};
    if (name.trim() && name.trim() !== user.name) {
      payload.name = name.trim();
    }
    if (password.trim()) {
      payload.password = password;
    }

    if (!payload.name && !payload.password) {
      setError('Enter a new name or password first.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(payload);
      setPassword('');
      setSuccess('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Profile" onClose={onClose}>
      <div className="profile-summary">
        <div>
          <div style={{ fontWeight: 700 }}>{user.name}</div>
          <div className="profile-login">{user.login}</div>
        </div>
        <span className={`badge ${user.role === 'ORGANIZER' ? 'badge-warn' : 'badge-valid'}`}>
          {user.role}
        </span>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="profile-name">Name or Nickname</label>
          <input
            id="profile-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="profile-pass">New Password</label>
          <input
            id="profile-pass"
            type="password"
            className="input"
            placeholder="Leave blank to keep current"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <hr className="profile-divider" />

      <div className="profile-footer-actions">
        <button type="button" className="btn" onClick={toggleTheme}>
          {theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            onClose();
            logout();
          }}
        >
          Sign Out
        </button>
      </div>
    </Modal>
  );
}