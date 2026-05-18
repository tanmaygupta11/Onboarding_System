import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export default function PayrollHeadClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAdminClients();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.client_name?.toLowerCase().includes(q) ||
      c.contract_code?.toLowerCase().includes(q) ||
      c.payroll_lead_name?.toLowerCase().includes(q) ||
      c.program_manager_name?.toLowerCase().includes(q)
    );
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">All Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Read-only view of every client across all Payroll Leads.
          </p>
        </div>
        <div className="w-64 shrink-0">
          <input
            type="search"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading clients…
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span>{error}</span>
          <button onClick={load} className="text-sm underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-slate-700 font-medium">
            {search ? 'No clients match your search.' : 'No clients found.'}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {search ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Client</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contract Code</th>
                  <th className="px-4 py-2.5 text-left font-medium">Payroll Lead</th>
                  <th className="px-4 py-2.5 text-left font-medium">Program Manager</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contract Period</th>
                  <th className="px-4 py-2.5 text-left font-medium">Insurance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.client_name}</p>
                      {c.designations?.length > 0 && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {c.designations.slice(0, 3).join(', ')}
                          {c.designations.length > 3 && ` +${c.designations.length - 3} more`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {c.contract_code || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.payroll_lead_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{c.program_manager_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(c.contract_start_date)} – {formatDate(c.contract_end_date)}
                    </td>
                    <td className="px-4 py-3">
                      {c.insurance_applicable ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          {c.insurance_name || 'Yes'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
