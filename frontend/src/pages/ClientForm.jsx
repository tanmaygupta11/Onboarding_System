import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import Navbar from '../components/Navbar';
import DesignationsInput from '../components/DesignationsInput';

const emptyForm = {
  client_name: '',
  contract_code: '',
  contract_start_date: '',
  contract_end_date: '',
  program_manager_id: '',
  insurance_applicable: false,
  insurance_name: '',
  designations: []
};

export default function ClientForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [pms, setPms] = useState([]);
  const [pmsLoading, setPmsLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    api.listProgramManagers()
      .then(setPms)
      .catch(err => setError(err.message))
      .finally(() => setPmsLoading(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api.listClients()
      .then(list => {
        const found = list.find(c => c.id === id);
        if (!found) {
          setError('Client not found');
          return;
        }
        setForm({
          client_name: found.client_name,
          contract_code: found.contract_code,
          contract_start_date: found.contract_start_date,
          contract_end_date: found.contract_end_date,
          program_manager_id: found.program_manager_id,
          insurance_applicable: found.insurance_applicable,
          insurance_name: found.insurance_name ?? '',
          designations: found.designations ?? []
        });
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const validate = () => {
    const errs = {};
    if (!form.client_name.trim()) errs.client_name = 'Required';
    if (!form.contract_code.trim()) errs.contract_code = 'Required';
    if (!form.contract_start_date) errs.contract_start_date = 'Required';
    if (!form.contract_end_date) errs.contract_end_date = 'Required';
    if (form.contract_start_date && form.contract_end_date
        && new Date(form.contract_end_date) < new Date(form.contract_start_date)) {
      errs.contract_end_date = 'End date must be on or after start date';
    }
    if (!form.program_manager_id) errs.program_manager_id = 'Required';
    if (form.insurance_applicable && !form.insurance_name.trim()) {
      errs.insurance_name = 'Required when insurance is applicable';
    }
    if (form.designations.length === 0) {
      errs.designations = 'Add at least one designation';
    }
    return errs;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        insurance_name: form.insurance_applicable ? form.insurance_name : null
      };
      if (isEdit) {
        await api.updateClient(id, payload);
      } else {
        await api.createClient(payload);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      if (err.details) setFieldErrors(err.details);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || pmsLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-3xl mx-auto px-6 py-8 text-slate-500">Loading...</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link to="/dashboard" className="text-sm text-indigo-600 hover:text-indigo-800">
            &larr; Back to clients
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 mt-2">
            {isEdit ? 'Edit Client' : 'Create Client'}
          </h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <Field label="Client Name" error={fieldErrors.client_name}>
            <input
              type="text"
              value={form.client_name}
              onChange={e => set({ client_name: e.target.value })}
              className="input"
            />
          </Field>

          <Field label="Contract Code" error={fieldErrors.contract_code}>
            <input
              type="text"
              value={form.contract_code}
              onChange={e => set({ contract_code: e.target.value })}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Contract Start Date" error={fieldErrors.contract_start_date}>
              <input
                type="date"
                value={form.contract_start_date}
                onChange={e => set({ contract_start_date: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Contract End Date" error={fieldErrors.contract_end_date}>
              <input
                type="date"
                value={form.contract_end_date}
                onChange={e => set({ contract_end_date: e.target.value })}
                className="input"
              />
            </Field>
          </div>

          <Field label="Program Manager" error={fieldErrors.program_manager_id}>
            <select
              value={form.program_manager_id}
              onChange={e => set({ program_manager_id: e.target.value })}
              className="input"
            >
              <option value="">Select a program manager</option>
              {pms.map(pm => (
                <option key={pm.id} value={pm.id}>{pm.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Insurance Applicable">
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.insurance_applicable === true}
                  onChange={() => set({ insurance_applicable: true })}
                />
                Yes
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.insurance_applicable === false}
                  onChange={() => set({ insurance_applicable: false, insurance_name: '' })}
                />
                No
              </label>
            </div>
          </Field>

          {form.insurance_applicable && (
            <Field label="Insurance Name" error={fieldErrors.insurance_name}>
              <input
                type="text"
                value={form.insurance_name}
                onChange={e => set({ insurance_name: e.target.value })}
                className="input"
              />
            </Field>
          )}

          <Field label="Designations" error={fieldErrors.designations}>
            <DesignationsInput
              value={form.designations}
              onChange={designations => set({ designations })}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              to="/dashboard"
              className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Client')}
            </button>
          </div>
        </form>
      </main>
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
