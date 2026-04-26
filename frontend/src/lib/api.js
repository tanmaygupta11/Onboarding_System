import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, { ...options, headers });
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
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, { method: 'POST', headers, body: formData });
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

export const api = {
  me: () => request('/api/me'),
  listProgramManagers: () => request('/api/program-managers'),
  listClients: () => request('/api/clients'),
  createClient: (payload) =>
    request('/api/clients', { method: 'POST', body: JSON.stringify(payload) }),
  updateClient: (id, payload) =>
    request(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listPmClients: () => request('/api/pm/clients'),
  listEmployees: (clientId) =>
    request(`/api/employees?client_id=${encodeURIComponent(clientId)}`),
  createEmployee: (payload) =>
    request('/api/employees', { method: 'POST', body: JSON.stringify(payload) }),
  setEmployeeRoleDetails: (id, payload) =>
    request(`/api/employees/${id}/role-details`, { method: 'PUT', body: JSON.stringify(payload) }),
  bulkSetRoleDetails: (employeeIds, payload) =>
    request('/api/employees/role-details', {
      method: 'POST',
      body: JSON.stringify({ employee_ids: employeeIds, ...payload })
    }),
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
    })
};
