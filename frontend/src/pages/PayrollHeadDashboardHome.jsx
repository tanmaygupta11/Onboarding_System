import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function StatCard({ title, value, tone = 'slate' }) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'indigo'
          ? 'text-indigo-700'
          : tone === 'amber'
            ? 'text-amber-700'
            : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value ?? '—'}</p>
    </div>
  );
}

function SectionHeading({ label }) {
  return (
    <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </h2>
  );
}

const EMPTY_STATS = {
  section1: {
    form_submitted: 0,
    with_uan: 0,
    without_uan: 0,
    with_esic_under_limit: 0,
    without_esic_under_limit: 0,
    outside_esic_limit: 0
  },
  section2: {
    total_onboarded: 0,
    total_dropout: 0,
    active_employees: 0
  }
};

export default function PayrollHeadDashboardHome() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(EMPTY_STATS);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getAdminComplianceStats()
      .then((data) => {
        if (!active) return;
        setStats({
          section1: data?.section1 ?? EMPTY_STATS.section1,
          section2: data?.section2 ?? EMPTY_STATS.section2
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load compliance stats.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const s1 = stats.section1;
  const s2 = stats.section2;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Compliance Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Org-wide compliance overview across all clients and employees.
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading compliance data…
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Section 1 */}
          <SectionHeading label="Section 1 — Form submission & identity numbers" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Employees submitted the form"
              value={s1.form_submitted}
              tone="indigo"
            />
            <StatCard title="Employees with UAN" value={s1.with_uan} tone="emerald" />
            <StatCard title="Employees without UAN" value={s1.without_uan} tone="amber" />
            <StatCard
              title="With ESIC number (CTC ≤ ₹43,900/mo)"
              value={s1.with_esic_under_limit}
              tone="emerald"
            />
            <StatCard
              title="Without ESIC number (CTC ≤ ₹43,900/mo)"
              value={s1.without_esic_under_limit}
              tone="rose"
            />
            <StatCard
              title="Outside ESIC limit (CTC > ₹43,900/mo)"
              value={s1.outside_esic_limit}
            />
          </div>

          {/* Section 2 */}
          <SectionHeading label="Section 2 — Onboarding & attrition" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Total employees onboarded (A)"
              value={s2.total_onboarded}
              tone="indigo"
            />
            <StatCard
              title="Total dropout / absconding (B)"
              value={s2.total_dropout}
              tone="rose"
            />
            <StatCard
              title="Active employees (A − B)"
              value={s2.active_employees}
              tone="emerald"
            />
          </div>
        </>
      )}
    </main>
  );
}
