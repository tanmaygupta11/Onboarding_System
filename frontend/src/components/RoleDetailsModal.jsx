import { useState } from 'react';

const empty = {
  designation: '',
  date_of_joining: '',
  ctc_type: 'MONTHLY',
  ctc_value: ''
};

export default function RoleDetailsModal({
  title,
  description,
  designations = [],
  submitting = false,
  showSendOnboardingOption = false,
  onClose,
  onSubmit
}) {
  const [form, setForm] = useState(() => ({
    ...empty,
    designation: designations[0] ?? ''
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [sendOnboardingNow, setSendOnboardingNow] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validate = () => {
    const errors = {};
    if (!form.designation) errors.designation = 'Required';
    if (!form.date_of_joining) errors.date_of_joining = 'Required';
    if (!['MONTHLY', 'ANNUAL'].includes(form.ctc_type)) errors.ctc_type = 'Invalid';
    const ctc = Number(form.ctc_value);
    if (!Number.isFinite(ctc) || ctc < 0) errors.ctc_value = 'Must be a non-negative number';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    await onSubmit(
      {
        designation: form.designation,
        date_of_joining: form.date_of_joining,
        ctc_type: form.ctc_type,
        ctc_value: Number(form.ctc_value)
      },
      { sendOnboardingNow }
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Close">x</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {description && <p className="text-sm text-slate-600">{description}</p>}

          <Field label="Designation" error={fieldErrors.designation}>
            <select
              className="input"
              value={form.designation}
              onChange={(e) => set({ designation: e.target.value })}
            >
              {designations.length === 0 && <option value="">No designations found</option>}
              {designations.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of Joining" error={fieldErrors.date_of_joining}>
              <input
                className="input"
                type="date"
                value={form.date_of_joining}
                onChange={(e) => set({ date_of_joining: e.target.value })}
              />
            </Field>
            <Field label="CTC Type" error={fieldErrors.ctc_type}>
              <select className="input" value={form.ctc_type} onChange={(e) => set({ ctc_type: e.target.value })}>
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </Field>
          </div>

          <Field label="CTC Value" error={fieldErrors.ctc_value}>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={form.ctc_value}
              onChange={(e) => set({ ctc_value: e.target.value })}
            />
          </Field>

          {showSendOnboardingOption && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sendOnboardingNow}
                onChange={(e) => setSendOnboardingNow(e.target.checked)}
                className="mt-0.5"
              />
              <span>Also send onboarding form immediately after saving details</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || designations.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
