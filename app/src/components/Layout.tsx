import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isMobileDevice } from '../utils/deviceDetection';
import { ProfileModal } from './ProfileModal';
import './Layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export function Layout() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const mobileDevice = useMemo(() => isMobileDevice(), []);

  if (!user) return null;

  const navItems: NavItem[] =
    user.role === 'ORGANIZER'
      ? [
          { to: '/events', label: 'Events', icon: '📅' },
          { to: '/analytics', label: 'Analytics', icon: '📊' },
          ...(mobileDevice ? [{ to: '/scanner', label: 'Scanner', icon: '📷' }] : []),
        ]
      : [
          { to: '/events', label: 'Events', icon: '📅' },
          { to: '/tickets', label: 'Tickets', icon: '🎟️' },
          { to: '/orders', label: 'Orders', icon: '🧾' },
          ...(mobileDevice ? [{ to: '/scanner', label: 'Scanner', icon: '📷' }] : []),
        ];

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/events" className="brand-mark">
          <span className="brand-stamp">EP</span>
          <span>EventPass</span>
        </NavLink>

        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>

          <button
            type="button"
            className="profile-trigger"
            onClick={() => setProfileOpen(true)}
            aria-label="Open profile settings"
          >
            <span className="profile-avatar">{initials || 'U'}</span>
            <span>{user.name}</span>
          </button>
        </div>
      </header>

      <div className="shell-body">
        <nav className="desktop-rail" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="main-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
          >
            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}