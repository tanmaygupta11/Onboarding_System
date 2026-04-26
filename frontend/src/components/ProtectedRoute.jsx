import { Navigate } from 'react-router-dom';
import { useAuth, homeRouteForRole } from '../context/AuthContext';

export default function ProtectedRoute({ children, role }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading...
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (role && profile.role !== role) {
    return <Navigate to={homeRouteForRole(profile.role)} replace />;
  }

  return children;
}
