import { Link, useNavigate } from 'react-router-dom';
import { useAuth, homeRouteForRole } from '../context/AuthContext';

const ROLE_LABEL = {
  PAYROLL_LEAD: 'Payroll Lead',
  PROGRAM_MANAGER: 'Program Manager'
};

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const home = profile ? homeRouteForRole(profile.role) : '/';

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to={home} className="font-semibold text-slate-900">
          Onboarding System
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="text-slate-800">{profile?.name ?? user?.email}</div>
            {profile?.role && (
              <div className="text-xs text-slate-500">{ROLE_LABEL[profile.role] ?? profile.role}</div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
