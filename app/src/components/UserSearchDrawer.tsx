import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { UserSearchResult } from '../types';
import { Drawer } from './Drawer';
import './UserSearchDrawer.css';

interface UserSearchDrawerProps {
  open: boolean;
  title: string;
  actionLabel: string;
  onClose: () => void;
  onConfirm: (selectedUser: UserSearchResult) => Promise<void>;
  extraFields?: ReactNode;
}

export function UserSearchDrawer({
  open,
  title,
  actionLabel,
  onClose,
  onConfirm,
  extraFields,
}: UserSearchDrawerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const users = await api.searchUsers(trimmed);
        setResults(users);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} title={title} onClose={onClose}>
      {error && <div className="alert-error">{error}</div>}

      <div className="form-field">
        <label htmlFor="user-search-input">Search by Name or Nickname</label>
        <input
          id="user-search-input"
          className="input"
          placeholder="Type at least 2 characters..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
      </div>

      {searching && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Searching...</p>}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No matching users found.</p>
      )}

      <div className="user-search-list">
        {results.map((u) => {
          const isSelected = selected?.id === u.id;
          return (
            <button
              key={u.id}
              type="button"
              className={`user-search-item ${isSelected ? 'user-search-item--selected' : ''}`}
              onClick={() => setSelected(u)}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{u.name}</div>
                <div className="user-search-mask">Email: {u.maskedLogin}</div>
              </div>
              <span className={`badge ${isSelected ? 'badge-valid' : 'badge-neutral'}`}>
                {isSelected ? 'Selected' : `#${u.id}`}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div style={{ marginTop: '1.25rem' }}>
          {extraFields}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Processing...' : `${actionLabel} (${selected.name})`}
          </button>
        </div>
      )}
    </Drawer>
  );
}