import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !anonKey) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-lg bg-white border border-amber-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Supabase configuration missing</h1>
          <p className="text-sm text-slate-600 mb-3">
            Create <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">frontend/.env</code> with
            {' '}
            <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code>
            {' '}and{' '}
            <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>
            {' '}(see <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">.env.example</code>), then restart the dev server.
          </p>
          <p className="text-xs text-slate-500">
            Without these variables the app cannot start because the Supabase client is required for authentication.
          </p>
        </div>
      </div>
    </StrictMode>
  );
} else {
  await import('./bootstrap.jsx');
}
