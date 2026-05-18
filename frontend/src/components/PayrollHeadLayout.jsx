import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PayrollHeadLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, signOut } = useAuth();
  const initials = useMemo(
    () => initialsFromName(profile?.name ?? user?.email ?? ''),
    [profile?.name, user?.email]
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (location.pathname === '/admin-dashboard') {
    return <Navigate to="/admin-dashboard/dashboard" replace />;
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-100">
      <aside className="hidden h-full w-64 shrink-0 border-r border-slate-800 bg-slate-900 lg:flex lg:flex-col">
        <div className="border-b border-slate-700/80 px-5 py-6">
          <button
            type="button"
            onClick={() => navigate('/admin-dashboard/dashboard')}
            className="text-left text-lg font-semibold tracking-tight text-white hover:text-indigo-200"
          >
            Onboarding System
          </button>
          <p className="mt-1 text-xs text-slate-400">Payroll Head portal</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <NavLink to="/admin-dashboard/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin-dashboard/clients" className={navLinkClass}>
            Clients
          </NavLink>
        </nav>

        <div className="border-t border-slate-700/80 p-4">
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{profile?.name ?? 'Profile'}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-sm font-medium text-slate-200 hover:border-red-500/50 hover:bg-red-950/40 hover:text-red-100"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
