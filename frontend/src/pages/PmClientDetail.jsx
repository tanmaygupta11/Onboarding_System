import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import EmployeeTable from '../components/EmployeeTable';
import AddEmployeeModal from '../components/AddEmployeeModal';
import BulkUploadModal from '../components/BulkUploadModal';
import RoleDetailsModal from '../components/RoleDetailsModal';
import { api } from '../lib/api';

const TABS = [
  { key: 'pending', label: 'Available Employees' },
  { key: 'role_assigned', label: 'Role Assigned' },
  { key: 'in_progress', label: 'Onboarding In Progress' }
];
const PAGE_SIZE = 50;

export default function PmClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState(null);
  const [ctaLoading, setCtaLoading] = useState(false);
  const [roleDetailsLoading, setRoleDetailsLoading] = useState(false);
  const [availableFilters, setAvailableFilters] = useState({ name: '', mobile: '', email: '' });
  const [roleFilters, setRoleFilters] = useState({
    name: '',
    mobile: '',
    email: '',
    designation: '',
    ctc_type: ''
  });
  const [pageByTab, setPageByTab] = useState({ pending: 1, role_assigned: 1, in_progress: 1 });
  const [bulkRoleModalOpen, setBulkRoleModalOpen] = useState(false);
  const [rowRoleModalEmployee, setRowRoleModalEmployee] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clients, emps] = await Promise.all([
        api.listPmClients(),
        api.listEmployees(id)
      ]);
      const found = clients.find(c => c.id === id);
      if (!found) {
        setError('Client not found or not assigned to you.');
      } else {
        setClient(found);
        setEmployees(emps);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [id]);

  const pending = useMemo(
    () => employees.filter((e) => e.onboarding_status === 'AVAILABLE' || e.onboarding_status === 'PENDING'),
    [employees]
  );
  const roleAssigned = useMemo(() => employees.filter((e) => e.onboarding_status === 'ROLE_ASSIGNED'), [employees]);
  const inProgress = useMemo(
    () => employees.filter((e) => e.onboarding_initiated || e.onboarding_status === 'FORM_SENT'),
    [employees]
  );
  const filteredPending = useMemo(() => {
    const nameQ = availableFilters.name.trim().toLowerCase();
    const mobileQ = availableFilters.mobile.trim().toLowerCase();
    const emailQ = availableFilters.email.trim().toLowerCase();
    return pending.filter((row) => {
      const name = String(row.name ?? '').toLowerCase();
      const mobile = String(row.mobile ?? '').toLowerCase();
      const email = String(row.email ?? '').toLowerCase();
      if (nameQ && !name.includes(nameQ)) return false;
      if (mobileQ && !mobile.includes(mobileQ)) return false;
      if (emailQ && !email.includes(emailQ)) return false;
      return true;
    });
  }, [pending, availableFilters.name, availableFilters.mobile, availableFilters.email]);
  const filteredRoleAssigned = useMemo(() => {
    const nameQ = roleFilters.name.trim().toLowerCase();
    const mobileQ = roleFilters.mobile.trim().toLowerCase();
    const emailQ = roleFilters.email.trim().toLowerCase();
    const designationQ = roleFilters.designation.trim().toLowerCase();
    const ctcTypeQ = roleFilters.ctc_type.trim().toUpperCase();
    return roleAssigned.filter((row) => {
      const name = String(row.name ?? '').toLowerCase();
      const mobile = String(row.mobile ?? '').toLowerCase();
      const email = String(row.email ?? '').toLowerCase();
      const designation = String(row.designation ?? '').toLowerCase();
      const ctcType = String(row.ctc_type ?? '').toUpperCase();
      if (nameQ && !name.includes(nameQ)) return false;
      if (mobileQ && !mobile.includes(mobileQ)) return false;
      if (emailQ && !email.includes(emailQ)) return false;
      if (designationQ && designation !== designationQ) return false;
      if (ctcTypeQ && ctcType !== ctcTypeQ) return false;
      return true;
    });
  }, [roleAssigned, roleFilters.name, roleFilters.mobile, roleFilters.email, roleFilters.designation, roleFilters.ctc_type]);
  const hasActiveAvailableFilters = Boolean(availableFilters.name || availableFilters.mobile || availableFilters.email);
  const hasActiveRoleFilters = Boolean(
    roleFilters.name ||
    roleFilters.mobile ||
    roleFilters.email ||
    roleFilters.designation ||
    roleFilters.ctc_type
  );
  const paginationDisabled = activeTab === 'pending' && hasActiveAvailableFilters;
  const visibleRows = activeTab === 'pending'
    ? filteredPending
    : activeTab === 'role_assigned'
      ? filteredRoleAssigned
      : inProgress;
  const effectivePageSize = paginationDisabled ? Math.max(visibleRows.length, 1) : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / effectivePageSize));
  const currentPage = Math.min(pageByTab[activeTab], totalPages);
  const pagedRows = useMemo(() => {
    if (paginationDisabled) return visibleRows;
    const start = (currentPage - 1) * effectivePageSize;
    return visibleRows.slice(start, start + effectivePageSize);
  }, [visibleRows, currentPage, paginationDisabled, effectivePageSize]);

  useEffect(() => { setSelectedIds(new Set()); }, [activeTab]);
  useEffect(() => {
    if (pageByTab[activeTab] > totalPages) {
      setPageByTab((prev) => ({ ...prev, [activeTab]: totalPages }));
    }
  }, [activeTab, pageByTab, totalPages]);

  const toggle = (empId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  };

  const toggleAll = (checked) => {
    if (!checked) { setSelectedIds(new Set()); return; }
    setSelectedIds(new Set(pagedRows.map(r => r.id)));
  };

  const handleInitiate = async () => {
    if (selectedIds.size === 0) return;
    setCtaLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.initiateOnboarding(ids);
      setToast(`Onboarding initiated for ${res.updated} employee${res.updated === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
      await loadAll();
      setActiveTab('in_progress');
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setCtaLoading(false);
    }
  };

  const handleBulkRoleDetails = async (payload, options = {}) => {
    if (selectedIds.size === 0) return;
    setRoleDetailsLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.bulkSetRoleDetails(ids, payload);
      if (options.sendOnboardingNow && (res.employee_ids?.length ?? 0) > 0) {
        const initiateRes = await api.initiateOnboarding(res.employee_ids);
        setToast(
          `Role details set and onboarding initiated for ${initiateRes.updated} employee${initiateRes.updated === 1 ? '' : 's'}`
        );
        setActiveTab('in_progress');
      } else {
        setToast(`Role details set for ${res.updated} employee${res.updated === 1 ? '' : 's'}`);
        setActiveTab('role_assigned');
      }
      setBulkRoleModalOpen(false);
      setSelectedIds(new Set());
      await loadAll();
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setRoleDetailsLoading(false);
    }
  };

  const handleSingleRoleDetails = async (payload) => {
    if (!rowRoleModalEmployee) return;
    setRoleDetailsLoading(true);
    setError(null);
    try {
      await api.setEmployeeRoleDetails(rowRoleModalEmployee.id, payload);
      setToast(`Role details set for ${rowRoleModalEmployee.name}`);
      setRowRoleModalEmployee(null);
      setSelectedIds(new Set());
      await loadAll();
      setActiveTab('role_assigned');
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setRoleDetailsLoading(false);
    }
  };

  const onRowsChanged = async () => {
    await loadAll();
  };

  const setAvailableFilter = (key, value) => {
    setAvailableFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setRoleFilter = (key, value) => {
    setRoleFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAvailableFilters = () => {
    setAvailableFilters({ name: '', mobile: '', email: '' });
    setPageByTab((prev) => ({ ...prev, pending: 1 }));
  };

  const clearRoleFilters = () => {
    setRoleFilters({ name: '', mobile: '', email: '', designation: '', ctc_type: '' });
    setPageByTab((prev) => ({ ...prev, role_assigned: 1 }));
  };

  if (loading && !client) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-6xl mx-auto px-6 py-8 text-slate-500">Loading...</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-4">
          <Link to="/pm-dashboard" className="text-sm text-indigo-600 hover:text-indigo-800">
            &larr; Back to clients
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        {toast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-3 py-2 text-sm mb-4">
            {toast}
          </div>
        )}

        {client && (
          <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{client.client_name}</h1>
                <p className="text-sm text-slate-500">{client.contract_code}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {client.contract_start_date} &rarr; {client.contract_end_date}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {client.designations.map(d => (
                  <span key={d} className="bg-slate-100 text-slate-700 text-xs rounded px-2 py-0.5">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex border border-slate-200 bg-white rounded-md overflow-hidden text-sm">
            {TABS.map(t => {
              const count = t.key === 'pending' ? pending.length : t.key === 'role_assigned' ? roleAssigned.length : inProgress.length;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 border-r last:border-r-0 border-slate-200 ${
                    active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t.label} <span className={active ? 'text-indigo-100' : 'text-slate-400'}>({count})</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            {activeTab === 'pending' && (
              <>
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Upload Available Employees
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  + Add Available Employee
                </button>
                <button
                  onClick={() => setBulkRoleModalOpen(true)}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set Role Details{selectedIds.size ? ` (${selectedIds.size})` : ''}
                </button>
              </>
            )}
            {activeTab === 'role_assigned' && (
              <button
                onClick={handleInitiate}
                disabled={selectedIds.size === 0 || ctaLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ctaLoading ? 'Sending...' : `Send Onboarding Form${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
              </button>
            )}
          </div>
        </div>

        {activeTab === 'pending' && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by name</label>
                <input
                  type="text"
                  value={availableFilters.name}
                  onChange={(e) => setAvailableFilter('name', e.target.value)}
                  placeholder="Type a name"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by mobile</label>
                <input
                  type="text"
                  value={availableFilters.mobile}
                  onChange={(e) => setAvailableFilter('mobile', e.target.value)}
                  placeholder="Type a mobile"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by email</label>
                <input
                  type="text"
                  value={availableFilters.email}
                  onChange={(e) => setAvailableFilter('email', e.target.value)}
                  placeholder="Type an email"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={clearAvailableFilters}
                disabled={!hasActiveAvailableFilters}
                className="px-3 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

        {activeTab === 'role_assigned' && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by name</label>
                <input
                  type="text"
                  value={roleFilters.name}
                  onChange={(e) => setRoleFilter('name', e.target.value)}
                  placeholder="Type a name"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by mobile</label>
                <input
                  type="text"
                  value={roleFilters.mobile}
                  onChange={(e) => setRoleFilter('mobile', e.target.value)}
                  placeholder="Type a mobile"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Filter by email</label>
                <input
                  type="text"
                  value={roleFilters.email}
                  onChange={(e) => setRoleFilter('email', e.target.value)}
                  placeholder="Type an email"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="min-w-[180px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
                <select
                  value={roleFilters.designation}
                  onChange={(e) => setRoleFilter('designation', e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">All designations</option>
                  {(client?.designations ?? []).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium text-slate-600 mb-1">CTC Type</label>
                <div className="flex border border-slate-300 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setRoleFilter('ctc_type', '')}
                    className={`px-3 py-2 text-sm border-r border-slate-300 ${roleFilters.ctc_type === '' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('ctc_type', 'MONTHLY')}
                    className={`px-3 py-2 text-sm border-r border-slate-300 ${roleFilters.ctc_type === 'MONTHLY' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('ctc_type', 'ANNUAL')}
                    className={`px-3 py-2 text-sm ${roleFilters.ctc_type === 'ANNUAL' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    Annual
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={clearRoleFilters}
                disabled={!hasActiveRoleFilters}
                className="px-3 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

        <EmployeeTable
          rows={pagedRows}
          selectedIds={selectedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          selectable={activeTab === 'pending' || activeTab === 'role_assigned'}
          showJobColumns={activeTab !== 'pending'}
          actionLabel={activeTab === 'pending' ? 'Set Details' : null}
          onRowAction={activeTab === 'pending' ? (row) => setRowRoleModalEmployee(row) : null}
        />

        {visibleRows.length > 0 && !paginationDisabled && (
          <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
            <div>
              Showing {(currentPage - 1) * effectivePageSize + 1}
              {' - '}
              {Math.min(currentPage * effectivePageSize, visibleRows.length)}
              {' of '}
              {visibleRows.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageByTab((prev) => ({ ...prev, [activeTab]: Math.max(1, currentPage - 1) }))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-slate-700">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPageByTab((prev) => ({ ...prev, [activeTab]: Math.min(totalPages, currentPage + 1) }))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {showAdd && (
          <AddEmployeeModal
            clientId={id}
            onClose={() => setShowAdd(false)}
            onCreated={async () => { setShowAdd(false); await onRowsChanged(); }}
          />
        )}

        {showUpload && (
          <BulkUploadModal
            clientId={id}
            onClose={() => setShowUpload(false)}
            onDone={onRowsChanged}
          />
        )}
        {bulkRoleModalOpen && (
          <RoleDetailsModal
            title="Set Role Details (Bulk)"
            description={`Apply the same role details to ${selectedIds.size} selected available employee${selectedIds.size === 1 ? '' : 's'}.`}
            designations={client?.designations ?? []}
            submitting={roleDetailsLoading}
            showSendOnboardingOption
            onClose={() => setBulkRoleModalOpen(false)}
            onSubmit={handleBulkRoleDetails}
          />
        )}
        {rowRoleModalEmployee && (
          <RoleDetailsModal
            title={`Set Role Details - ${rowRoleModalEmployee.name}`}
            description="Set designation, DOJ, and CTC for this employee."
            designations={client?.designations ?? []}
            submitting={roleDetailsLoading}
            onClose={() => setRowRoleModalEmployee(null)}
            onSubmit={handleSingleRoleDetails}
          />
        )}
      </main>
    </div>
  );
}
