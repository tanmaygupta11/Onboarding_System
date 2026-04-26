import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Navbar from '../components/Navbar';

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listClients();
      setClients(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
            <p className="text-sm text-slate-500">Manage your client contracts.</p>
          </div>
          <Link
            to="/clients/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2"
          >
            + Add Client
          </Link>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
            Loading clients...
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={load}
              className="text-sm underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <p className="text-slate-700 font-medium">No clients yet</p>
            <p className="text-sm text-slate-500 mt-1 mb-4">Create your first one to get started.</p>
            <Link
              to="/clients/new"
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2"
            >
              + Add Client
            </Link>
          </div>
        )}

        {!loading && !error && clients.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Client</th>
                  <th className="text-left px-4 py-2 font-medium">Contract Code</th>
                  <th className="text-left px-4 py-2 font-medium">Program Manager</th>
                  <th className="text-left px-4 py-2 font-medium">Insurance</th>
                  <th className="text-left px-4 py-2 font-medium">Start</th>
                  <th className="text-left px-4 py-2 font-medium">End</th>
                  <th className="text-left px-4 py-2 font-medium">Designations</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.client_name}</td>
                    <td className="px-4 py-3 text-slate-700">{c.contract_code}</td>
                    <td className="px-4 py-3 text-slate-700">{c.program_manager_name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.insurance_applicable ? `Yes - ${c.insurance_name}` : 'No'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.contract_start_date}</td>
                    <td className="px-4 py-3 text-slate-700">{c.contract_end_date}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="flex flex-wrap gap-1">
                        {c.designations.map(d => (
                          <span key={d} className="bg-slate-100 text-slate-700 text-xs rounded px-2 py-0.5">
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/clients/${c.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
