import { supabase } from './supabase';

/** Base URL for the Express API (no trailing slash). Empty = same-origin, paths like `/api/me`. */
const rawBase = import.meta.env.VITE_API_BASE_URL;
const BASE_URL = normalizeApiBaseUrl(rawBase);

function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!BASE_URL) return p;
  return `${BASE_URL}${p}`;
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (is the backend running at ${BASE_URL}?)`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Cannot reach backend at ${BASE_URL} (${err.message})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(options.headers || {})
  };
  const res = await fetchWithTimeout(apiUrl(path), { ...options, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = body?.details;
    throw err;
  }
  return body;
}

async function uploadRequest(path, formData) {
  const headers = { ...(await authHeader()) };
  const res = await fetchWithTimeout(apiUrl(path), { method: 'POST', headers, body: formData });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = body?.details;
    throw err;
  }
  return body;
}

async function fileRequest(path, options = {}) {
  const headers = {
    ...(await authHeader()),
    ...(options.headers || {})
  };
  const res = await fetchWithTimeout(apiUrl(path), { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const body = text ? JSON.parse(text) : null;
      message = body?.error || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.blob();
}

export const api = {
  me: () => request('/api/me'),
  listProgramManagers: () => request('/api/program-managers'),
  listClients: () => request('/api/clients'),
  getPayrollDashboardStats: () => request('/api/clients/dashboard-stats'),
  createClient: (payload) =>
    request('/api/clients', { method: 'POST', body: JSON.stringify(payload) }),
  updateClient: (id, payload) =>
    request(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listPmClients: () => request('/api/pm/clients'),
  getPmDashboardStats: () => request('/api/pm/clients/dashboard-stats'),
  listEmployees: (clientId) =>
    request(`/api/employees?client_id=${encodeURIComponent(clientId)}`),
  getEmployeeJobAppForm: ({ clientId, employeeId, payrollReview = false }) => {
    const q = new URLSearchParams();
    q.set('client_id', clientId);
    if (payrollReview) q.set('payroll_review', '1');
    return request(
      `/api/employees/${encodeURIComponent(employeeId)}/job-app-form?${q.toString()}`
    );
  },
  reviewEmployeeJobAppForm: ({ clientId, employeeId, payload }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/form-review`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, ...payload })
    }),
  reviewEmployeePayrollJobAppForm: ({ clientId, employeeId, payload }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/payroll-form-review`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, ...payload })
    }),
  payrollResetEmployeeToPl: ({ clientId, employeeId }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/payroll-reset-to-pl`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId })
    }),
  createEmployee: (payload) =>
    request('/api/employees', { method: 'POST', body: JSON.stringify(payload) }),
  setEmployeeRoleDetails: (id, payload) =>
    request(`/api/employees/${id}/role-details`, { method: 'PUT', body: JSON.stringify(payload) }),
  bulkSetRoleDetails: (employeeIds, payload) =>
    request('/api/employees/role-details', {
      method: 'POST',
      body: JSON.stringify({ employee_ids: employeeIds, ...payload })
    }),
  bulkSetJoiningStatus: ({ clientId, employeeIds, joiningStatus, joiningActualDate }) =>
    request('/api/employees/joining-status/bulk', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        employee_ids: employeeIds,
        joining_status: joiningStatus,
        joining_actual_date: joiningActualDate || null
      })
    }),
  setJoiningStatus: ({ clientId, employeeId, joiningStatus, joiningActualDate }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/joining-status`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        joining_status: joiningStatus,
        joining_actual_date: joiningActualDate || null
      })
    }),
  setPayrollIdentityNumbers: ({ clientId, employeeId, payrollPfUanNumber, payrollEsicNumber }) =>
    request(`/api/employees/${encodeURIComponent(employeeId)}/payroll-identity-numbers`, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        payroll_pf_uan_number: payrollPfUanNumber || null,
        payroll_esic_number: payrollEsicNumber || null
      })
    }),
  exportPayrollIdentityNumbersCsv: ({ clientId }) =>
    fileRequest(`/api/employees/identity-numbers/export?client_id=${encodeURIComponent(clientId)}`),
  importPayrollIdentityNumbersCsv: ({ clientId, file }) => {
    const fd = new FormData();
    fd.append('client_id', clientId);
    fd.append('file', file);
    return uploadRequest('/api/employees/identity-numbers/import', fd);
  },
  bulkUploadEmployees: (clientId, file) => {
    const fd = new FormData();
    fd.append('client_id', clientId);
    fd.append('file', file);
    return uploadRequest('/api/employees/bulk-upload', fd);
  },
  initiateOnboarding: (employeeIds) =>
    request('/api/employees/initiate-onboarding', {
      method: 'POST',
      body: JSON.stringify({ employee_ids: employeeIds })
    }),
  lookupOnboardingMobile: ({ mobile, employeeId }) =>
    request('/api/public/onboarding/mobile-lookup', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null })
    }),
  getOnboardingEmployeeSummary: ({ employeeId }) => {
    const q = new URLSearchParams();
    q.set('employee_id', employeeId);
    return request(`/api/public/onboarding/employee-summary?${q.toString()}`);
  },
  sendAadhaarOtp: ({ mobile, employeeId, aadhaar }) =>
    request('/api/public/onboarding/aadhaar/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, aadhaar })
    }),
  verifyAadhaarOtp: ({ mobile, employeeId, otp }) =>
    request('/api/public/onboarding/aadhaar/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, otp })
    }),
  verifyPan: ({ mobile, employeeId, panNumber }) =>
    request('/api/public/onboarding/pan/verify', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, pan_number: panNumber })
    }),
  verifyBankAccount: ({ mobile, employeeId, accountHolderName, accountNumber, ifsc }) =>
    request('/api/public/onboarding/bank/verify', {
      method: 'POST',
      body: JSON.stringify({
        mobile,
        employee_id: employeeId || null,
        account_holder_name: accountHolderName,
        account_number: accountNumber,
        ifsc
      })
    }),
  sendOnboardingStatusOtp: ({ mobile, employeeId }) =>
    request('/api/public/onboarding/status/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null })
    }),
  verifyOnboardingStatusOtp: ({ mobile, employeeId, otp }) =>
    request('/api/public/onboarding/status/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, employee_id: employeeId || null, otp })
    }),
  getOnboardingStatus: ({ mobile, employeeId, sessionToken }) => {
    const q = new URLSearchParams();
    q.set('mobile', mobile);
    if (employeeId) q.set('employee_id', employeeId);
    q.set('session_token', sessionToken);
    return request(`/api/public/onboarding/status?${q.toString()}`);
  },
  getJobAppForm: ({ mobile, employeeId }) => {
    const q = new URLSearchParams();
    q.set('mobile', mobile);
    if (employeeId) q.set('employee_id', employeeId);
    return request(`/api/public/onboarding/job-app-form?${q.toString()}`);
  },
  patchJobAppForm: (payload) =>
    request('/api/public/onboarding/job-app-form', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  uploadDrivingLicense: ({ mobile, employeeId, file }) => {
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest('/api/public/onboarding/driving-license-upload', fd);
  },
  uploadQualificationCertificate: ({ mobile, employeeId, file }) => {
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest('/api/public/onboarding/qualification-certificate-upload', fd);
  },
  uploadKycDocument: ({ mobile, employeeId, file, kind }) => {
    const q = new URLSearchParams();
    q.set('kind', kind);
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest(`/api/public/onboarding/kyc-document-upload?${q.toString()}`, fd);
  },
  listAdminClients: () => request('/api/admin/clients'),
  getAdminComplianceStats: () => request('/api/admin/compliance-stats'),

  uploadBpDocument: ({ mobile, employeeId, file, kind }) => {
    const q = new URLSearchParams();
    q.set('kind', kind);
    const fd = new FormData();
    fd.append('mobile', mobile);
    if (employeeId) fd.append('employee_id', employeeId);
    fd.append('file', file);
    return uploadRequest(`/api/public/onboarding/bp-document-upload?${q.toString()}`, fd);
  }
};
