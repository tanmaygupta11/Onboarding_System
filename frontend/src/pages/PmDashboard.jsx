import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

export default function PmDashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api.listPmClients()
      .then(data => { if (active) setClients(data); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Assigned Clients</h1>
          <p className="text-sm text-slate-500">Clients where you are the Program Manager.</p>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
            Loading clients...
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
            <p className="text-slate-700 font-medium">No clients assigned to you yet</p>
            <p className="text-sm text-slate-500 mt-1">Ask the Payroll Lead to assign a client to your profile.</p>
          </div>
        )}

        {!loading && !error && clients.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map(c => (
              <Link
                key={c.id}
                to={`/pm-dashboard/client/${c.id}`}
                className="bg-white border border-slate-200 rounded-lg p-5 hover:border-indigo-400 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{c.client_name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{c.contract_code}</p>
                  </div>
                  {c.insurance_applicable && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">Insured</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  {c.contract_start_date} &rarr; {c.contract_end_date}
                </p>
                <div className="flex flex-wrap gap-1">
                  {c.designations.map(d => (
                    <span key={d} className="bg-slate-100 text-slate-700 text-xs rounded px-2 py-0.5">
                      {d}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
