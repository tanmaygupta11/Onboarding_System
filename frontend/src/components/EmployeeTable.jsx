function formatCtc(type, value) {
  if (!type || value === null || value === undefined || value === '') return '-';
  const v = Number(value ?? 0);
  const formatted = new Intl.NumberFormat('en-IN').format(v);
  return type === 'ANNUAL' ? `${formatted} / yr` : `${formatted} / mo`;
}

export default function EmployeeTable({
  rows,
  selectedIds,
  onToggle,
  onToggleAll,
  selectable = true,
  showJobColumns = true,
  actionLabel = null,
  onRowAction = null
}) {
  const allSelected = selectable && rows.length > 0 && rows.every(r => selectedIds.has(r.id));

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
        No employees in this category.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {selectable && (
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={e => onToggleAll(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
            )}
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-left px-4 py-2 font-medium">Mobile</th>
            <th className="text-left px-4 py-2 font-medium">Email</th>
            {showJobColumns && <th className="text-left px-4 py-2 font-medium">Designation</th>}
            {showJobColumns && <th className="text-left px-4 py-2 font-medium">DOJ</th>}
            {showJobColumns && <th className="text-left px-4 py-2 font-medium">CTC</th>}
            <th className="text-left px-4 py-2 font-medium">Status</th>
            {actionLabel && <th className="text-left px-4 py-2 font-medium">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => {
            const checked = selectedIds.has(r.id);
            return (
              <tr key={r.id} className={checked ? 'bg-indigo-50/40' : ''}>
                {selectable && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(r.id)}
                      aria-label={`Select ${r.name}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-slate-700">{r.mobile}</td>
                <td className="px-4 py-3 text-slate-700">{r.email}</td>
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{r.designation || '-'}</td>}
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{r.date_of_joining || '-'}</td>}
                {showJobColumns && <td className="px-4 py-3 text-slate-700">{formatCtc(r.ctc_type, r.ctc_value)}</td>}
                <td className="px-4 py-3">
                  <span className={`text-xs rounded px-2 py-0.5 ${
                    r.onboarding_initiated
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {r.onboarding_status}
                  </span>
                </td>
                {actionLabel && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onRowAction?.(r)}
                      className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      {actionLabel}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
