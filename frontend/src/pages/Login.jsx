import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homeRouteForRole } from '../context/AuthContext';

export default function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const [email, setEmail] = useState('payrolllead@test.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session && profile) {
      navigate(homeRouteForRole(profile.role), { replace: true });
    }
  }, [loading, session, profile, navigate]);

  // Safety: re-enable the button if the auth flow doesn't finish within 20s
  // (normally sign-in completes in <1s; anything longer indicates a hang).
  useEffect(() => {
    if (!submitting) return;
    const t = setTimeout(() => {
      setSubmitting(false);
      setError(
        'Sign-in took too long. Make sure the backend is running at the URL in VITE_API_BASE_URL, then try again.'
      );
    }, 20_000);
    return () => clearTimeout(t);
  }, [submitting]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      // AuthContext picks up the new session, loads the profile in a
      // separate effect (outside the auth lock), and the useEffect above
      // navigates to the right dashboard once both are set.
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Sign in failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-slate-200"
      >
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-6">Payroll Lead portal</p>

        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md px-4 py-2 text-sm disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="text-xs text-slate-500 mt-4 space-y-1">
          <p>Demo logins (all password <code>123456</code>):</p>
          <p>Payroll Lead: <code>payrolllead@test.com</code></p>
          <p>Program Manager: <code>rahul.pm@test.com</code></p>
        </div>
      </form>
    </div>
  );
}
