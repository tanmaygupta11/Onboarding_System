import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import readXlsxFile, { parseExcelDate } from 'read-excel-file/node';
import { supabaseAdmin } from '../supabase.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
const SEND_ONBOARDING_EMAIL_EDGE_FUNCTION =
  process.env.SEND_ONBOARDING_EMAIL_EDGE_FUNCTION || 'send-onboarding-email';
const SEND_ONBOARDING_WHATSAPP_EDGE_FUNCTION =
  process.env.SEND_ONBOARDING_WHATSAPP_EDGE_FUNCTION || 'send-onboarding-whatsapp';
const WHATSAPP_COUNTRY_CODE = String(process.env.WHATSAPP_COUNTRY_CODE || '91').replace(/\D/g, '') || '91';
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:8088').trim() || 'http://localhost:8088';
const ONBOARDING_EMAIL_SUBJECT = 'Complete your onboarding with Awign';

function buildOnboardingFormLink(employeeId) {
  const trimmedId = String(employeeId ?? '').trim();
  if (!trimmedId) return `${FRONTEND_URL.replace(/\/+$/, '')}/onboardingform`;
  try {
    const url = new URL('/onboardingform', FRONTEND_URL);
    url.searchParams.set('employee_id', trimmedId);
    return url.toString();
  } catch {
    const base = FRONTEND_URL.replace(/\/+$/, '');
    return `${base}/onboardingform?employee_id=${encodeURIComponent(trimmedId)}`;
  }
}

async function invokeSendOnboardingEmailEdge({ recipients }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }
  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(SEND_ONBOARDING_EMAIL_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subject: ONBOARDING_EMAIL_SUBJECT,
      recipients
    })
  });
  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    throw err;
  }
  return body ?? {};
}

function formatWhatsAppNumber(rawMobile) {
  const digits = String(rawMobile ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const targetLength = WHATSAPP_COUNTRY_CODE.length + 10;
  if (digits.startsWith(WHATSAPP_COUNTRY_CODE) && digits.length === targetLength) {
    return digits;
  }
  const localTenDigits = digits.length >= 10 ? digits.slice(-10) : digits;
  if (localTenDigits.length !== 10) return null;
  return `${WHATSAPP_COUNTRY_CODE}${localTenDigits}`;
}

async function invokeSendOnboardingWhatsappEdge({ recipients }) {
  const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to invoke edge functions.');
  }
  const endpoint = `${supabaseUrl}/functions/v1/${encodeURIComponent(SEND_ONBOARDING_WHATSAPP_EDGE_FUNCTION)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipients })
  });
  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const msg = body?.error || body?.message || `Edge function failed (${resp.status})`;
    const err = new Error(msg);
    err.details = body?.upstream ?? body ?? null;
    throw err;
  }
  return body ?? {};
}

async function fetchOwnedClient(req, clientId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, program_manager_id, created_by')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ownedByPm = data.program_manager_id === req.user.id;
  const ownedByLead = data.created_by === req.user.id;
  return ownedByPm || ownedByLead ? data : null;
}

async function fetchPayrollLeadOwnedClient(req, clientId) {
  const { data: userRow, error: uErr } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', req.user.id)
    .maybeSingle();
  if (uErr) throw uErr;
  if (userRow?.role !== 'PAYROLL_LEAD') return null;
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, created_by')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.created_by !== req.user.id) return null;
  return data;
}

async function fetchProgramManagerOwnedClient(req, clientId) {
  const { data: userRow, error: uErr } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', req.user.id)
    .maybeSingle();
  if (uErr) throw uErr;
  if (userRow?.role !== 'PROGRAM_MANAGER') return null;
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, program_manager_id')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.program_manager_id !== req.user.id) return null;
  return data;
}

async function fetchClientDesignations(clientId) {
  const { data, error } = await supabaseAdmin
    .from('designations')
    .select('name')
    .eq('client_id', clientId);
  if (error) throw error;
  return new Set(data.map(d => d.name.toLowerCase()));
}

function validateRoleDetails(raw, designationSet) {
  const errors = [];
  const designation = String(raw.designation ?? '').trim();
  const doj = String(raw.date_of_joining ?? '').trim();
  const ctcType = String(raw.ctc_type ?? '').trim().toUpperCase();
  const ctcValueRaw = raw.ctc_value;

  if (!designation) errors.push('designation required');
  if (!doj) errors.push('date_of_joining required');
  if (!['MONTHLY', 'ANNUAL'].includes(ctcType)) errors.push('ctc_type must be MONTHLY or ANNUAL');
  const ctcValue = Number(ctcValueRaw);
  if (!Number.isFinite(ctcValue) || ctcValue < 0) errors.push('ctc_value must be a non-negative number');
  if (doj && Number.isNaN(Date.parse(doj))) errors.push('date_of_joining must be a valid date');
  if (designation && !designationSet.has(designation.toLowerCase())) {
    errors.push(`designation "${designation}" is not defined on this client`);
  }
  if (errors.length) return { errors };
  return {
    roleDetails: {
      designation,
      date_of_joining: doj,
      ctc_type: ctcType,
      ctc_value: ctcValue
    }
  };
}

const REVIEWABLE_JOB_FORM_FIELDS = [
  'name',
  'mobile',
  'email',
  'aadhaar_number',
  'aad_profile_photo',
  'aad_care_of',
  'aad_dob',
  'aad_gender',
  'aad_address',
  'aad_state',
  'aad_district',
  'aad_pincode',
  'pd_alternate_number',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'pd_city',
  'pd_age',
  'qual_highest_qualification',
  'qual_education_certificate_url',
  'qual_additional_certificates_url',
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_url',
  'kyc_pan_number',
  'kyc_pan_card_url',
  'kyc_account_holder_name',
  'kyc_account_number',
  'kyc_ifsc_code',
  'kyc_bank_passbook_url',
  'bp_passport_photo_url',
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_police_verification_url'
];
const CORRECTION_EDITABLE_FIELDS = new Set([
  'pd_alternate_number',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'qual_highest_qualification',
  'qual_education_certificate_url',
  'qual_additional_certificates_url',
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_url',
  'kyc_pan_number',
  'kyc_pan_card_url',
  'kyc_account_holder_name',
  'kyc_account_number',
  'kyc_ifsc_code',
  'kyc_bank_passbook_url',
  'bp_passport_photo_url',
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_police_verification_url'
]);
const REVIEW_DECISIONS = new Set(['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED']);
const PAYROLL_FORM_REVIEW_DECISIONS = new Set(['APPROVED', 'REJECTED']);
const JOINING_STATUSES = new Set([
  'JOINED',
  'NOT_JOINED',
  'JOINED_OTHER_DATE',
  'JOINED_ABSCONDED'
]);
const UAN_REGEX = /^\d{12}$/;
const ESIC_REGEX = /^\d{10}$/;

function normalizeDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

function isJoinedStatus(joiningStatus) {
  const s = String(joiningStatus ?? '').trim().toUpperCase();
  return s === 'JOINED' || s === 'JOINED_OTHER_DATE';
}

function normalizeRejectedFields(raw) {
  if (!Array.isArray(raw)) return [];
  const uniq = new Set();
  for (const f of raw) {
    const key = String(f ?? '').trim();
    if (!key || !REVIEWABLE_JOB_FORM_FIELDS.includes(key)) continue;
    uniq.add(key);
  }
  return Array.from(uniq);
}

function hasProvidedReviewValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.trim());
  return true;
}

function normalizeJoiningDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

function validateJoiningTransition(currentStatus, currentCount, nextStatus) {
  const curr = String(currentStatus ?? '').trim().toUpperCase();
  const count = Number(currentCount ?? 0);
  if (count <= 0 || !curr) return { ok: true };
  if (count >= 3) return { ok: false, message: 'Joining status can no longer be updated for this employee.' };
  if (count >= 2) {
    if (curr === 'JOINED_OTHER_DATE' && nextStatus === 'JOINED_ABSCONDED') {
      return { ok: true };
    }
    return { ok: false, message: 'Only Joined on other date -> Joined and absconded is allowed at this stage.' };
  }
  if ((curr === 'JOINED' || curr === 'JOINED_OTHER_DATE') && nextStatus === 'JOINED_ABSCONDED') {
    return { ok: true };
  }
  if (curr === 'NOT_JOINED' && nextStatus === 'JOINED_OTHER_DATE') {
    return { ok: true };
  }
  return { ok: false, message: 'Invalid joining status transition for this employee.' };
}

async function nextPayrollReviewCycle(jobAppFormId) {
  const { data: rows, error } = await supabaseAdmin
    .from('job_app_form_payroll_reviews')
    .select('cycle_no')
    .eq('job_app_form_id', jobAppFormId)
    .order('cycle_no', { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = rows?.[0]?.cycle_no;
  return Number(max ?? 0) + 1;
}

// Returns a Set of mobile values that already exist in the employees table
// for the given mobile list. Used to skip duplicates during batch inserts.
async function fetchExistingMobiles(mobiles) {
  if (!mobiles.length) return new Set();
  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('mobile')
    .in('mobile', mobiles);
  if (error) throw error;
  return new Set(data.map(r => r.mobile));
}

function validateEmployeeRow(raw, designationSet) {
  const errors = [];
  const name = String(raw.name ?? '').trim();
  const mobile = String(raw.mobile ?? '').trim();
  const email = String(raw.email ?? '').trim();
  const designation = String(raw.designation ?? '').trim();
  const doj = String(raw.date_of_joining ?? '').trim();
  const ctcType = String(raw.ctc_type ?? '').trim().toUpperCase();
  const ctcValueRaw = raw.ctc_value;

  if (!name) errors.push('name required');
  if (!mobile) errors.push('mobile required');
  if (!email) errors.push('email required');
  if (designation && !designationSet.has(designation.toLowerCase())) {
    errors.push(`designation "${designation}" is not defined on this client`);
  }
  if (doj && Number.isNaN(Date.parse(doj))) errors.push('date_of_joining must be a valid date');

  const hasCtcType = ctcType.length > 0;
  const hasCtcValue = String(ctcValueRaw ?? '').trim().length > 0;
  if (hasCtcType && !['MONTHLY', 'ANNUAL'].includes(ctcType)) {
    errors.push('ctc_type must be MONTHLY or ANNUAL');
  }
  if (hasCtcType !== hasCtcValue) {
    errors.push('ctc_type and ctc_value must be provided together');
  }

  let ctcValue = null;
  if (hasCtcValue) {
    ctcValue = Number(ctcValueRaw);
    if (!Number.isFinite(ctcValue) || ctcValue < 0) {
      errors.push('ctc_value must be a non-negative number');
    }
  }

  if (errors.length) return { errors };
  return {
    row: {
      name,
      mobile,
      email,
      designation: designation || null,
      date_of_joining: doj || null,
      ctc_type: hasCtcType ? ctcType : null,
      ctc_value: ctcValue
    }
  };
}

function excelDateToISO(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = parseExcelDate(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return String(value ?? '').trim();
}

async function rowsFromSpreadsheet(buffer, isCsv) {
  if (isCsv) {
    const { data, errors } = Papa.parse(buffer.toString('utf8'), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => normalizeHeaderKey(String(h ?? ''))
    });
    const fatal = errors.find((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
    if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
    return (data || []).map((row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k) continue;
        out[k] = v ?? '';
      }
      return out;
    });
  }

  const matrix = await readXlsxFile(buffer);
  if (!matrix.length) return [];
  const headers = matrix[0].map((c) => normalizeHeaderKey(String(c ?? '')));
  return matrix.slice(1).map((row) => {
    const out = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;
      out[h] = row[i] ?? '';
    }
    return out;
  });
}

function normalizeHeaderKey(k) {
  return String(k).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

router.get('/', async (req, res, next) => {
  try {
    const clientId = req.query.client_id;
    if (!clientId) return res.status(400).json({ error: 'client_id query param required' });

    const owned = await fetchOwnedClient(req, clientId);
    if (!owned) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    const employeeIds = rows.map((r) => r.id);
    let formMap = new Map();
    let pmUserNameById = new Map();
    if (employeeIds.length > 0) {
      const { data: forms, error: formErr } = await supabaseAdmin
        .from('job_app_form')
        .select('employee_id, submission_status, review_status, payroll_review_status, payroll_review_reason, reviewed_by, bp_pf_uan_number, bp_esic_number')
        .in('employee_id', employeeIds);
      if (formErr) throw formErr;
      formMap = new Map((forms ?? []).map((f) => [f.employee_id, f]));
      const reviewedByIds = Array.from(
        new Set((forms ?? []).map((f) => f.reviewed_by).filter((id) => typeof id === 'string' && id))
      );
      if (reviewedByIds.length > 0) {
        const { data: pmUsers, error: pmUsersErr } = await supabaseAdmin
          .from('users')
          .select('id, name')
          .in('id', reviewedByIds);
        if (pmUsersErr) throw pmUsersErr;
        pmUserNameById = new Map((pmUsers ?? []).map((u) => [u.id, u.name ?? null]));
      }
    }
    const out = rows.map((r) => {
      const f = formMap.get(r.id);
      return {
        ...r,
        form_submission_status: f?.submission_status ?? null,
        form_review_status: f?.review_status ?? null,
        form_payroll_review_status: f?.payroll_review_status ?? null,
        form_payroll_review_reason: f?.payroll_review_reason ?? null,
        form_pm_approver_name: f?.reviewed_by ? pmUserNameById.get(f.reviewed_by) ?? null : null,
        form_bp_pf_uan_number: f?.bp_pf_uan_number ?? null,
        form_bp_esic_number: f?.bp_esic_number ?? null
      };
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const clientId = body.client_id;
    const isBatch = Array.isArray(body.employees);
    const list = isBatch ? body.employees : [body];

    if (!clientId) return res.status(400).json({ error: 'client_id required' });

    const owned = await fetchOwnedClient(req, clientId);
    if (!owned) return res.status(403).json({ error: 'Not authorized for this client' });

    const designationSet = await fetchClientDesignations(clientId);

    const validated = [];
    const errors = [];
    list.forEach((raw, idx) => {
      const result = validateEmployeeRow(raw, designationSet);
      if (result.errors) {
        errors.push({ index: idx, errors: result.errors });
      } else {
        const normalizedRow = {
          ...result.row,
          designation: null,
          date_of_joining: null,
          ctc_type: null,
          ctc_value: null
        };
        validated.push({
          source_index: idx,
          payload: {
            ...normalizedRow,
            client_id: clientId,
            created_by: req.user.id,
            onboarding_status: 'AVAILABLE'
          }
        });
      }
    });

    // Skip rows whose mobile already exists in the DB or appears earlier in
    // this same batch. Each skipped row is reported in `errors`.
    const existingMobiles = await fetchExistingMobiles(validated.map(v => v.payload.mobile));
    const seenInBatch = new Set();
    const toInsert = [];
    for (const v of validated) {
      const mobile = v.payload.mobile;
      if (existingMobiles.has(mobile)) {
        errors.push({ index: v.source_index, errors: [`mobile "${mobile}" already exists`] });
        continue;
      }
      if (seenInBatch.has(mobile)) {
        errors.push({ index: v.source_index, errors: [`mobile "${mobile}" is duplicated in this batch`] });
        continue;
      }
      seenInBatch.add(mobile);
      toInsert.push(v.payload);
    }

    // Single-row request with a duplicate -> 409 for a clearer UX.
    if (!isBatch && toInsert.length === 0 && errors.length > 0) {
      const firstErr = errors[0].errors[0];
      const status = /already exists/.test(firstErr) ? 409 : 400;
      return res.status(status).json({ error: firstErr });
    }

    if (errors.length && toInsert.length === 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    let inserted = [];
    if (toInsert.length) {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .insert(toInsert)
        .select();
      if (error) throw error;
      inserted = data;
    }

    res.status(errors.length ? 207 : 201).json({
      inserted: inserted.length,
      skipped: errors.length,
      errors,
      rows: inserted
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required (.xlsx or .csv)' });
    const clientId = req.body.client_id;
    if (!clientId) return res.status(400).json({ error: 'client_id required' });

    const owned = await fetchOwnedClient(req, clientId);
    if (!owned) return res.status(403).json({ error: 'Not authorized for this client' });

    const originalName = (req.file.originalname || '').toLowerCase();
    const mime = (req.file.mimetype || '').toLowerCase();
    const isCsv = originalName.endsWith('.csv') || mime === 'text/csv' || mime === 'application/csv';
    const isXlsx = originalName.endsWith('.xlsx')
      || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || mime === 'application/vnd.ms-excel';
    if (!isCsv && !isXlsx) {
      return res.status(400).json({ error: 'Only .xlsx and .csv files are supported' });
    }

    let rowsRaw;
    try {
      rowsRaw = await rowsFromSpreadsheet(req.file.buffer, isCsv);
    } catch (parseErr) {
      return res.status(400).json({ error: parseErr.message || 'Could not read spreadsheet' });
    }
    if (!rowsRaw.length) return res.status(400).json({ error: 'Empty workbook' });

    const normalized = rowsRaw.map((row) => {
      const out = { ...row };
      if (out.date_of_joining !== undefined) {
        out.date_of_joining = excelDateToISO(out.date_of_joining);
      }
      return out;
    });

    const designationSet = await fetchClientDesignations(clientId);

    const validated = [];
    const errors = [];
    normalized.forEach((raw, idx) => {
      const result = validateEmployeeRow(raw, designationSet);
      if (result.errors) {
        errors.push({ row: idx + 2, errors: result.errors });
      } else {
        const normalizedRow = {
          ...result.row,
          designation: null,
          date_of_joining: null,
          ctc_type: null,
          ctc_value: null
        };
        validated.push({
          source_row: idx + 2,
          payload: {
            ...normalizedRow,
            client_id: clientId,
            created_by: req.user.id,
            onboarding_status: 'AVAILABLE'
          }
        });
      }
    });

    // Skip rows whose mobile already exists in the DB or appears earlier in
    // this same file. Reported in `errors` with the original spreadsheet row.
    const existingMobiles = await fetchExistingMobiles(validated.map(v => v.payload.mobile));
    const seenInFile = new Set();
    const toInsert = [];
    for (const v of validated) {
      const mobile = v.payload.mobile;
      if (existingMobiles.has(mobile)) {
        errors.push({ row: v.source_row, errors: [`mobile "${mobile}" already exists`] });
        continue;
      }
      if (seenInFile.has(mobile)) {
        errors.push({ row: v.source_row, errors: [`mobile "${mobile}" is duplicated in this file`] });
        continue;
      }
      seenInFile.add(mobile);
      toInsert.push(v.payload);
    }

    let inserted = 0;
    if (toInsert.length) {
      const { error } = await supabaseAdmin.from('employees').insert(toInsert);
      if (error) throw error;
      inserted = toInsert.length;
    }

    res.json({ inserted, skipped: errors.length, errors });
  } catch (err) {
    next(err);
  }
});

router.post('/initiate-onboarding', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.employee_ids) ? req.body.employee_ids : [];
    if (ids.length === 0) return res.status(400).json({ error: 'employee_ids required (non-empty array)' });

    const { data: targetClients, error: ownErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .or(`program_manager_id.eq.${req.user.id},created_by.eq.${req.user.id}`);
    if (ownErr) throw ownErr;
    const ownedClientIds = targetClients.map(c => c.id);
    if (ownedClientIds.length === 0) {
      return res.status(403).json({ error: 'No clients accessible to you' });
    }

    const { data: candidates, error: fetchErr } = await supabaseAdmin
      .from('employees')
      .select('id, onboarding_status')
      .in('id', ids)
      .in('client_id', ownedClientIds);
    if (fetchErr) throw fetchErr;
    const validIds = candidates
      .filter((row) => row.onboarding_status === 'ROLE_ASSIGNED')
      .map((row) => row.id);
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No ROLE_ASSIGNED employees selected' });
    }
    const { data: updated, error } = await supabaseAdmin
      .from('employees')
      .update({ onboarding_initiated: true, onboarding_status: 'FORM_SENT' })
      .in('id', validIds)
      .select('id, name, email, mobile');
    if (error) throw error;
    const updatedRows = updated ?? [];

    const skippedRecipients = [];
    const emailRecipients = [];
    const skippedWhatsappRecipients = [];
    const whatsappRecipients = [];
    for (const row of updatedRows) {
      const trimmedName = String(row.name ?? '').trim();
      const employeeLink = buildOnboardingFormLink(row.id);
      const email = String(row.email ?? '').trim();
      if (!email) {
        skippedRecipients.push({
          employee_id: row.id,
          reason: 'no_email'
        });
      } else {
        emailRecipients.push({
          employee_id: row.id,
          name: trimmedName,
          email,
          link: employeeLink
        });
      }

      const to = formatWhatsAppNumber(row.mobile);
      if (!to) {
        skippedWhatsappRecipients.push({
          employee_id: row.id,
          reason: 'no_mobile'
        });
      } else {
        whatsappRecipients.push({
          employee_id: row.id,
          name: trimmedName,
          empid: String(row.id),
          to
        });
      }
    }

    let emailedRecipients = [];
    let emailFailedRecipients = [];
    if (emailRecipients.length > 0) {
      try {
        const emailResult = await invokeSendOnboardingEmailEdge({ recipients: emailRecipients });
        const sent = Array.isArray(emailResult?.sent) ? emailResult.sent : [];
        const failed = Array.isArray(emailResult?.failed) ? emailResult.failed : [];
        emailedRecipients = sent
          .map((item) => ({
            employee_id: String(item.employee_id ?? '').trim(),
            email: String(item.email ?? '').trim()
          }))
          .filter((item) => Boolean(item.employee_id));
        emailFailedRecipients = failed
          .map((item) => ({
            employee_id: String(item.employee_id ?? '').trim(),
            email: String(item.email ?? '').trim(),
            error: String(item.error ?? 'Email send failed').trim()
          }))
          .filter((item) => Boolean(item.employee_id));
        if (emailedRecipients.length === 0 && emailFailedRecipients.length === 0) {
          emailedRecipients = emailRecipients.map((r) => ({ employee_id: r.employee_id, email: r.email }));
        }
      } catch (sendErr) {
        const reason = String(sendErr?.message || 'Email service unavailable');
        emailFailedRecipients = emailRecipients.map((r) => ({
          employee_id: r.employee_id,
          email: r.email,
          error: reason
        }));
      }
    }

    let whatsappSentRecipients = [];
    let whatsappFailedRecipients = [];
    if (whatsappRecipients.length > 0) {
      try {
        const whatsappResult = await invokeSendOnboardingWhatsappEdge({ recipients: whatsappRecipients });
        const sent = Array.isArray(whatsappResult?.sent) ? whatsappResult.sent : [];
        const failed = Array.isArray(whatsappResult?.failed) ? whatsappResult.failed : [];
        whatsappSentRecipients = sent
          .map((item) => ({
            employee_id: String(item.employee_id ?? '').trim(),
            to: String(item.to ?? '').trim()
          }))
          .filter((item) => Boolean(item.employee_id));
        whatsappFailedRecipients = failed
          .map((item) => ({
            employee_id: String(item.employee_id ?? '').trim(),
            to: String(item.to ?? '').trim(),
            error: String(item.error ?? 'WhatsApp send failed').trim()
          }))
          .filter((item) => Boolean(item.employee_id));
        if (whatsappSentRecipients.length === 0 && whatsappFailedRecipients.length === 0) {
          whatsappSentRecipients = whatsappRecipients.map((r) => ({
            employee_id: r.employee_id,
            to: r.to
          }));
        }
      } catch (sendErr) {
        const reason = String(sendErr?.message || 'WhatsApp service unavailable');
        whatsappFailedRecipients = whatsappRecipients.map((r) => ({
          employee_id: r.employee_id,
          to: r.to,
          error: reason
        }));
      }
    }

    res.json({
      updated: updatedRows.length,
      employee_ids: updatedRows.map((r) => r.id),
      emailed: emailedRecipients.length,
      emailed_employee_ids: emailedRecipients.map((r) => r.employee_id),
      skipped: skippedRecipients.length,
      skipped_recipients: skippedRecipients,
      failed: emailFailedRecipients.length,
      failed_recipients: emailFailedRecipients,
      whatsapp_sent: whatsappSentRecipients.length,
      whatsapp_sent_employee_ids: whatsappSentRecipients.map((r) => r.employee_id),
      whatsapp_skipped: skippedWhatsappRecipients.length,
      whatsapp_skipped_recipients: skippedWhatsappRecipients,
      whatsapp_failed: whatsappFailedRecipients.length,
      whatsapp_failed_recipients: whatsappFailedRecipients
    });
  } catch (err) {
    next(err);
  }
});

router.post('/role-details', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.employee_ids) ? req.body.employee_ids : [];
    if (ids.length === 0) return res.status(400).json({ error: 'employee_ids required (non-empty array)' });
    const { designation, date_of_joining, ctc_type, ctc_value } = req.body || {};

    const { data: targetClients, error: ownErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .or(`program_manager_id.eq.${req.user.id},created_by.eq.${req.user.id}`);
    if (ownErr) throw ownErr;
    const ownedClientIds = targetClients.map(c => c.id);
    if (ownedClientIds.length === 0) {
      return res.status(403).json({ error: 'No clients accessible to you' });
    }

    const { data: candidates, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, onboarding_status')
      .in('id', ids)
      .in('client_id', ownedClientIds);
    if (empErr) throw empErr;
    if (!candidates.length) {
      return res.status(404).json({ error: 'No matching employees found in your clients' });
    }
    const availableRows = candidates.filter((row) => row.onboarding_status === 'AVAILABLE');
    if (!availableRows.length) {
      return res.status(400).json({ error: 'Selected employees must be in AVAILABLE status' });
    }

    const clientId = availableRows[0].client_id;
    const sameClient = availableRows.every((row) => row.client_id === clientId);
    if (!sameClient) {
      return res.status(400).json({ error: 'Bulk role details require employees from the same client' });
    }

    const designationSet = await fetchClientDesignations(clientId);
    const validation = validateRoleDetails({ designation, date_of_joining, ctc_type, ctc_value }, designationSet);
    if (validation.errors) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('employees')
      .update({ ...validation.roleDetails, onboarding_status: 'ROLE_ASSIGNED' })
      .in('id', availableRows.map((row) => row.id))
      .select('id');
    if (error) throw error;

    res.json({ updated: updated.length, employee_ids: updated.map((r) => r.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/joining-status/bulk', async (req, res, next) => {
  try {
    const clientId = String(req.body?.client_id ?? '').trim();
    const ids = Array.isArray(req.body?.employee_ids) ? req.body.employee_ids : [];
    const joiningStatus = String(req.body?.joining_status ?? '').trim().toUpperCase();
    const joiningDate = normalizeJoiningDate(req.body?.joining_actual_date);

    if (!clientId) return res.status(400).json({ error: 'client_id is required.' });
    if (ids.length === 0) return res.status(400).json({ error: 'employee_ids required (non-empty array)' });
    if (!JOINING_STATUSES.has(joiningStatus)) {
      return res.status(400).json({
        error: 'joining_status must be JOINED, NOT_JOINED, JOINED_OTHER_DATE, or JOINED_ABSCONDED.'
      });
    }
    if (joiningStatus === 'JOINED_OTHER_DATE' && !joiningDate) {
      return res.status(400).json({ error: 'joining_actual_date is required for JOINED_OTHER_DATE (YYYY-MM-DD).' });
    }

    const ownedPm = await fetchProgramManagerOwnedClient(req, clientId);
    if (!ownedPm) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: employees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, joining_status, joining_status_change_count')
      .in('id', ids)
      .eq('client_id', clientId);
    if (empErr) throw empErr;
    if (!employees?.length) {
      return res.status(404).json({ error: 'No matching employees found for this client' });
    }

    const employeeIds = employees.map((e) => e.id);
    const { data: forms, error: formsErr } = await supabaseAdmin
      .from('job_app_form')
      .select('employee_id, review_status, payroll_review_status')
      .in('employee_id', employeeIds);
    if (formsErr) throw formsErr;
    const formByEmployeeId = new Map((forms ?? []).map((f) => [f.employee_id, f]));

    const failed = [];
    const updatedIds = [];
    const now = new Date().toISOString();

    for (const row of employees) {
      const form = formByEmployeeId.get(row.id);
      if (!form || form.review_status !== 'APPROVED' || form.payroll_review_status !== 'PAYROLL_APPROVED') {
        failed.push({
          employee_id: row.id,
          error: 'Joining status can only be updated for employees approved by Payroll Lead.'
        });
        continue;
      }

      const currentCount = Number(row.joining_status_change_count ?? 0);
      if (currentCount > 0 || String(row.joining_status ?? '').trim()) {
        failed.push({
          employee_id: row.id,
          error: 'Bulk joining status is allowed only for first-time status setting.'
        });
        continue;
      }

      const transition = validateJoiningTransition(row.joining_status, currentCount, joiningStatus);
      if (!transition.ok) {
        failed.push({ employee_id: row.id, error: transition.message });
        continue;
      }

      const nextCount = currentCount + 1;
      const payload = {
        joining_status: joiningStatus,
        joining_actual_date: joiningStatus === 'JOINED_OTHER_DATE' ? joiningDate : null,
        joining_status_change_count: nextCount,
        joining_status_updated_at: now,
        joining_status_updated_by: req.user.id
      };
      if (Number(row.joining_status_change_count ?? 0) === 0) {
        payload.joining_status_set_at = now;
        payload.joining_status_set_by = req.user.id;
      }

      const { error: upErr } = await supabaseAdmin
        .from('employees')
        .update(payload)
        .eq('id', row.id)
        .eq('client_id', clientId);
      if (upErr) {
        failed.push({ employee_id: row.id, error: upErr.message || 'Could not update joining status.' });
        continue;
      }
      updatedIds.push(row.id);
    }

    return res.json({
      updated: updatedIds.length,
      employee_ids: updatedIds,
      failed
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/joining-status', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const clientId = String(req.body?.client_id ?? '').trim();
    const joiningStatus = String(req.body?.joining_status ?? '').trim().toUpperCase();
    const joiningDate = normalizeJoiningDate(req.body?.joining_actual_date);

    if (!clientId) return res.status(400).json({ error: 'client_id is required.' });
    if (!JOINING_STATUSES.has(joiningStatus)) {
      return res.status(400).json({
        error: 'joining_status must be JOINED, NOT_JOINED, JOINED_OTHER_DATE, or JOINED_ABSCONDED.'
      });
    }
    if (joiningStatus === 'JOINED_OTHER_DATE' && !joiningDate) {
      return res.status(400).json({ error: 'joining_actual_date is required for JOINED_OTHER_DATE (YYYY-MM-DD).' });
    }

    const ownedPm = await fetchProgramManagerOwnedClient(req, clientId);
    if (!ownedPm) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: row, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, joining_status, joining_status_change_count')
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!row) return res.status(404).json({ error: 'Employee not found for this client' });

    const { data: form, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('review_status, payroll_review_status')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form || form.review_status !== 'APPROVED' || form.payroll_review_status !== 'PAYROLL_APPROVED') {
      return res.status(400).json({
        error: 'Joining status can only be updated for employees approved by Payroll Lead.'
      });
    }

    const currentCount = Number(row.joining_status_change_count ?? 0);
    const transition = validateJoiningTransition(row.joining_status, currentCount, joiningStatus);
    if (!transition.ok) {
      return res.status(400).json({ error: transition.message });
    }

    const nextCount = currentCount + 1;
    const now = new Date().toISOString();
    const payload = {
      joining_status: joiningStatus,
      joining_actual_date: joiningStatus === 'JOINED_OTHER_DATE' ? joiningDate : null,
      joining_status_change_count: nextCount,
      joining_status_updated_at: now,
      joining_status_updated_by: req.user.id
    };
    if (currentCount === 0) {
      payload.joining_status_set_at = now;
      payload.joining_status_set_by = req.user.id;
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from('employees')
      .update(payload)
      .eq('id', row.id)
      .eq('client_id', clientId)
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;

    return res.json({ employee: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/identity-numbers/export', async (req, res, next) => {
  try {
    const clientId = String(req.query?.client_id ?? '').trim();
    if (!clientId) return res.status(400).json({ error: 'client_id query param required' });

    const ownedPl = await fetchPayrollLeadOwnedClient(req, clientId);
    if (!ownedPl) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: employees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (empErr) throw empErr;
    const rows = employees ?? [];
    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="uan-esic-template.csv"');
      return res.send('employee_id,client_id,name,mobile,email,joining_status,joining_actual_date,effective_pf_uan_number,effective_esic_number\n');
    }

    const employeeIds = rows.map((r) => r.id);
    const { data: forms, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('employee_id, review_status, payroll_review_status, bp_pf_uan_number, bp_esic_number')
      .in('employee_id', employeeIds);
    if (formErr) throw formErr;
    const formMap = new Map((forms ?? []).map((f) => [f.employee_id, f]));

    const exportRows = rows
      .filter((r) => {
        const form = formMap.get(r.id);
        return (
          form &&
          form.review_status === 'APPROVED' &&
          form.payroll_review_status === 'PAYROLL_APPROVED' &&
          isJoinedStatus(r.joining_status)
        );
      })
      .map((r) => {
        const form = formMap.get(r.id) || {};
        return {
          employee_id: r.id,
          client_id: r.client_id,
          name: r.name ?? '',
          mobile: r.mobile ?? '',
          email: r.email ?? '',
          designation: r.designation ?? '',
          date_of_joining: r.date_of_joining ?? '',
          ctc_type: r.ctc_type ?? '',
          ctc_value: r.ctc_value ?? '',
          onboarding_status: r.onboarding_status ?? '',
          joining_status: r.joining_status ?? '',
          joining_actual_date: r.joining_actual_date ?? '',
          form_review_status: form.review_status ?? '',
          form_payroll_review_status: form.payroll_review_status ?? '',
          effective_pf_uan_number: String(form.bp_pf_uan_number ?? '').trim() || String(r.payroll_pf_uan_number ?? '').trim(),
          effective_esic_number: String(form.bp_esic_number ?? '').trim() || String(r.payroll_esic_number ?? '').trim()
        };
      });

    const csv = Papa.unparse(exportRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="uan-esic-template.csv"');
    return res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.post('/identity-numbers/import', upload.single('file'), async (req, res, next) => {
  try {
    const clientId = String(req.body?.client_id ?? '').trim();
    if (!clientId) return res.status(400).json({ error: 'client_id is required.' });
    if (!req.file?.buffer) return res.status(400).json({ error: 'CSV file is required.' });

    const ownedPl = await fetchPayrollLeadOwnedClient(req, clientId);
    if (!ownedPl) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: parsed, errors } = Papa.parse(req.file.buffer.toString('utf8'), {
      header: true,
      skipEmptyLines: 'greedy'
    });
    const fatal = (errors || []).find((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
    if (fatal) return res.status(400).json({ error: `CSV parse error: ${fatal.message}` });
    const rows = Array.isArray(parsed) ? parsed : [];
    if (rows.length === 0) return res.status(400).json({ error: 'CSV has no data rows.' });

    const employeeIds = Array.from(
      new Set(rows.map((r) => String(r.employee_id ?? '').trim()).filter(Boolean))
    );
    if (employeeIds.length === 0) return res.status(400).json({ error: 'employee_id column is required in CSV.' });

    const { data: employees, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, joining_status, payroll_pf_uan_number, payroll_esic_number')
      .in('id', employeeIds)
      .eq('client_id', clientId);
    if (empErr) throw empErr;
    const employeeMap = new Map((employees ?? []).map((e) => [e.id, e]));

    const { data: forms, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('employee_id, review_status, payroll_review_status, bp_pf_uan_number, bp_esic_number')
      .in('employee_id', employeeIds);
    if (formErr) throw formErr;
    const formMap = new Map((forms ?? []).map((f) => [f.employee_id, f]));

    let updated = 0;
    const failed = [];
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const csvRow = rows[i] || {};
      const employeeId = String(csvRow.employee_id ?? '').trim();
      if (!employeeId) {
        failed.push({ row: i + 2, error: 'employee_id is missing.' });
        continue;
      }
      const emp = employeeMap.get(employeeId);
      if (!emp) {
        failed.push({ row: i + 2, employee_id: employeeId, error: 'Employee not found for this client.' });
        continue;
      }
      const form = formMap.get(employeeId);
      if (!form || form.review_status !== 'APPROVED' || form.payroll_review_status !== 'PAYROLL_APPROVED') {
        failed.push({ row: i + 2, employee_id: employeeId, error: 'Employee is not approved by Payroll Lead.' });
        continue;
      }
      if (!isJoinedStatus(emp.joining_status)) {
        failed.push({ row: i + 2, employee_id: employeeId, error: 'Employee joining status is not eligible.' });
        continue;
      }

      const csvUan = normalizeDigits(
        csvRow.effective_pf_uan_number ??
        csvRow.effective_uan_number ??
        csvRow.pf_uan_number ??
        csvRow.uan_number ??
        csvRow.uan
      );
      const csvEsic = normalizeDigits(
        csvRow.effective_esic_number ??
        csvRow.effective_esic ??
        csvRow.esic_number ??
        csvRow.esic
      );
      const formUan = String(form.bp_pf_uan_number ?? '').trim();
      const formEsic = String(form.bp_esic_number ?? '').trim();

      if (csvUan && !UAN_REGEX.test(csvUan)) {
        failed.push({ row: i + 2, employee_id: employeeId, error: 'Payroll UAN must be 12 digits.' });
        continue;
      }
      if (csvEsic && !ESIC_REGEX.test(csvEsic)) {
        failed.push({ row: i + 2, employee_id: employeeId, error: 'Payroll ESIC must be 10 digits.' });
        continue;
      }

      const existingPayrollUan = String(emp.payroll_pf_uan_number ?? '').trim();
      const existingPayrollEsic = String(emp.payroll_esic_number ?? '').trim();
      const nextPayrollUan = formUan ? (existingPayrollUan || null) : (csvUan || existingPayrollUan || null);
      const nextPayrollEsic = formEsic ? (existingPayrollEsic || null) : (csvEsic || existingPayrollEsic || null);
      const effectiveUan = formUan || nextPayrollUan;
      const effectiveEsic = formEsic || nextPayrollEsic;
      if (!effectiveUan || !effectiveEsic) {
        failed.push({
          row: i + 2,
          employee_id: employeeId,
          error: 'Missing UAN/ESIC. Provide missing numbers in CSV.'
        });
        continue;
      }

      const changed =
        String(emp.payroll_pf_uan_number ?? '').trim() !== String(nextPayrollUan ?? '').trim() ||
        String(emp.payroll_esic_number ?? '').trim() !== String(nextPayrollEsic ?? '').trim();
      if (!changed) continue;

      const { error: upErr } = await supabaseAdmin
        .from('employees')
        .update({
          payroll_pf_uan_number: nextPayrollUan,
          payroll_esic_number: nextPayrollEsic,
          payroll_numbers_updated_at: now,
          payroll_numbers_updated_by: req.user.id
        })
        .eq('id', employeeId)
        .eq('client_id', clientId);
      if (upErr) {
        failed.push({ row: i + 2, employee_id: employeeId, error: upErr.message || 'Update failed.' });
        continue;
      }
      updated += 1;
    }

    return res.json({ updated, failed, total_rows: rows.length });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payroll-identity-numbers', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const clientId = String(req.body?.client_id ?? '').trim();
    const pfUanRaw = String(req.body?.payroll_pf_uan_number ?? '').trim();
    const esicRaw = String(req.body?.payroll_esic_number ?? '').trim();
    const payrollPfUan = pfUanRaw ? pfUanRaw.replace(/\s/g, '') : null;
    const payrollEsic = esicRaw ? esicRaw.replace(/\s/g, '') : null;

    if (!clientId) return res.status(400).json({ error: 'client_id is required.' });
    const ownedPl = await fetchPayrollLeadOwnedClient(req, clientId);
    if (!ownedPl) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: emp, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, joining_status')
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!emp) return res.status(404).json({ error: 'Employee not found for this client' });

    const joiningStatus = String(emp.joining_status ?? '').trim().toUpperCase();
    if (joiningStatus !== 'JOINED' && joiningStatus !== 'JOINED_OTHER_DATE') {
      return res.status(400).json({ error: 'Identity numbers can only be updated for joined employees.' });
    }

    const { data: form, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('review_status, payroll_review_status, bp_pf_uan_number, bp_esic_number')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form || form.review_status !== 'APPROVED' || form.payroll_review_status !== 'PAYROLL_APPROVED') {
      return res.status(400).json({ error: 'Employee must be approved by Payroll Lead.' });
    }

    const formPfUan = String(form.bp_pf_uan_number ?? '').trim();
    const formEsic = String(form.bp_esic_number ?? '').trim();
    const effectivePfUan = formPfUan || payrollPfUan || null;
    const effectiveEsic = formEsic || payrollEsic || null;
    if (!effectivePfUan || !effectiveEsic) {
      return res.status(400).json({
        error: 'Both UAN and ESIC are required. Provide missing values if employee has not supplied them.'
      });
    }

    if (payrollPfUan && !UAN_REGEX.test(payrollPfUan)) {
      return res.status(400).json({ error: 'Payroll UAN must be exactly 12 digits.' });
    }
    if (payrollEsic && !ESIC_REGEX.test(payrollEsic)) {
      return res.status(400).json({ error: 'Payroll ESIC number must be exactly 10 digits.' });
    }

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabaseAdmin
      .from('employees')
      .update({
        payroll_pf_uan_number: payrollPfUan,
        payroll_esic_number: payrollEsic,
        payroll_numbers_updated_at: now,
        payroll_numbers_updated_by: req.user.id
      })
      .eq('id', emp.id)
      .eq('client_id', clientId)
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;

    return res.json({ employee: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/job-app-form', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const clientId = req.query.client_id;
    const payrollReview =
      String(req.query.payroll_review ?? '').trim() === '1' ||
      String(req.query.payroll_review ?? '').toLowerCase() === 'true';

    if (!clientId) {
      return res.status(400).json({ error: 'client_id query param required' });
    }

    const owned = await fetchOwnedClient(req, clientId);
    if (!owned) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: emp, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, name')
      .eq('id', employeeId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!emp || emp.client_id !== clientId) {
      return res.status(404).json({ error: 'Employee not found for this client' });
    }

    const { data: form, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form) {
      return res.status(404).json({ error: 'Application form not found for this employee' });
    }

    let previousCorrectionRejectedFields = [];
    if (!payrollReview) {
      const attemptNo = Number(form.submission_attempt_count ?? 1);
      if (attemptNo > 1) {
        const { data: prevCorrection, error: prevErr } = await supabaseAdmin
          .from('job_app_form_reviews')
          .select('rejected_fields')
          .eq('employee_id', employeeId)
          .eq('decision_status', 'CORRECTION_REQUESTED')
          .eq('attempt_no', attemptNo - 1)
          .order('reviewed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevErr) throw prevErr;
        if (Array.isArray(prevCorrection?.rejected_fields)) {
          previousCorrectionRejectedFields = prevCorrection.rejected_fields;
        }
      }
    }

    let pmApprover = null;
    if (form.reviewed_by) {
      const { data: pmUser, error: pmUserErr } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .eq('id', form.reviewed_by)
        .maybeSingle();
      if (pmUserErr) throw pmUserErr;
      if (pmUser) {
        pmApprover = { id: pmUser.id, name: pmUser.name };
      }
    }

    res.json({
      employee: { id: emp.id, name: emp.name },
      form,
      previous_correction_rejected_fields: previousCorrectionRejectedFields,
      pm_approver: pmApprover
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/form-review', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const clientId = String(req.body?.client_id ?? '').trim();
    const decisionStatus = String(req.body?.decision_status ?? '').trim().toUpperCase();
    const reasonRaw = String(req.body?.decision_reason ?? '');
    const decisionReason = reasonRaw.trim();
    const fieldMarks = req.body?.field_marks ?? {};

    if (!clientId) {
      return res.status(400).json({ error: 'client_id is required.' });
    }
    if (!REVIEW_DECISIONS.has(decisionStatus)) {
      return res.status(400).json({ error: 'decision_status must be APPROVED, REJECTED, or CORRECTION_REQUESTED.' });
    }
    if (!fieldMarks || typeof fieldMarks !== 'object' || Array.isArray(fieldMarks)) {
      return res.status(400).json({ error: 'field_marks must be an object keyed by form field names.' });
    }

    const owned = await fetchOwnedClient(req, clientId);
    if (!owned) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: emp, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!emp || emp.client_id !== clientId) {
      return res.status(404).json({ error: 'Employee not found for this client' });
    }

    const { data: form, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('id, employee_id, client_id, submission_status, review_status, submission_attempt_count')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form) {
      return res.status(404).json({ error: 'Application form not found for this employee' });
    }
    if (form.submission_status !== 'Submitted') {
      return res.status(400).json({ error: 'Only submitted applications can be reviewed.' });
    }
    if (form.review_status === 'APPROVED' || form.review_status === 'REJECTED') {
      return res.status(400).json({ error: `Application is already ${String(form.review_status).toLowerCase()}.` });
    }

    const markErrors = [];
    const incorrectFromMarks = [];
    const requiredMarkedFields = REVIEWABLE_JOB_FORM_FIELDS.filter(
      (key) => CORRECTION_EDITABLE_FIELDS.has(key) && hasProvidedReviewValue(form[key])
    );
    for (const key of requiredMarkedFields) {
      const mark = String(fieldMarks[key] ?? '').trim().toLowerCase();
      if (mark !== 'correct' && mark !== 'incorrect') {
        markErrors.push(key);
      } else if (mark === 'incorrect') {
        incorrectFromMarks.push(key);
      }
    }
    if (markErrors.length > 0) {
      return res.status(400).json({
        error: 'Please mark every field before taking action.',
        details: { unmarked_fields: markErrors }
      });
    }

    const rejectedFieldsInput = normalizeRejectedFields(req.body?.rejected_fields);
    const incorrectSet = new Set(incorrectFromMarks);
    const rejectedFields =
      rejectedFieldsInput.length > 0
        ? rejectedFieldsInput
        : incorrectFromMarks;
    const correctionEligibleRejectedFields = rejectedFields.filter((f) => CORRECTION_EDITABLE_FIELDS.has(f));

    if (decisionStatus === 'APPROVED') {
      if (incorrectFromMarks.length > 0) {
        return res.status(400).json({
          error: 'Please verify this field first.',
          details: { incorrect_fields: incorrectFromMarks }
        });
      }
    }
    if (decisionStatus === 'REJECTED' && !decisionReason) {
      return res.status(400).json({ error: 'Reason is required when rejecting an application.' });
    }
    if (decisionStatus === 'CORRECTION_REQUESTED') {
      const attemptNo = Number(form.submission_attempt_count ?? 1);
      if (attemptNo >= 3) {
        return res.status(400).json({
          error: 'Maximum submission attempts reached. You can only approve or reject this application now.'
        });
      }
      if (!decisionReason) {
        return res.status(400).json({ error: 'Reason is required when requesting correction.' });
      }
      if (rejectedFields.length === 0) {
        return res.status(400).json({ error: 'Mark at least one field as incorrect to request correction.' });
      }
      if (correctionEligibleRejectedFields.length === 0) {
        return res.status(400).json({
          error: 'Request correction can only be raised on employee-editable fields.'
        });
      }
      // If marks include incorrect fields, rejected fields must be a subset.
      // If marks parsing misses for some reason, still accept explicit rejected_fields payload.
      if (incorrectFromMarks.length > 0 && rejectedFields.some((f) => !incorrectSet.has(f))) {
        return res.status(400).json({
          error: 'Rejected fields must be selected from the incorrect-marked fields only.'
        });
      }
    }

    const now = new Date().toISOString();
    const reviewStatus = decisionStatus;
    const nextEditableFields = decisionStatus === 'CORRECTION_REQUESTED' ? correctionEligibleRejectedFields : [];
    const nextReason = decisionStatus === 'APPROVED' ? null : decisionReason || null;

    const { error: reviewInsertErr } = await supabaseAdmin
      .from('job_app_form_reviews')
      .insert({
        job_app_form_id: form.id,
        employee_id: form.employee_id,
        client_id: form.client_id,
        attempt_no: form.submission_attempt_count ?? 1,
        decision_status: decisionStatus,
        rejected_fields: rejectedFields,
        decision_reason: nextReason,
        reviewed_by: req.user.id,
        reviewed_at: now
      });
    if (reviewInsertErr) throw reviewInsertErr;

    const formUpdatePayload = {
      review_status: reviewStatus,
      editable_fields: nextEditableFields,
      review_reason: nextReason,
      reviewed_by: req.user.id,
      reviewed_at: now,
      updated_at: now
    };
    if (decisionStatus === 'APPROVED') {
      formUpdatePayload.payroll_review_status = 'PENDING_PAYROLL_LEAD';
      formUpdatePayload.payroll_review_reason = null;
      formUpdatePayload.payroll_reviewed_by = null;
      formUpdatePayload.payroll_reviewed_at = null;
    }

    const { data: updatedForm, error: upErr } = await supabaseAdmin
      .from('job_app_form')
      .update(formUpdatePayload)
      .eq('id', form.id)
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;

    // Correction request moves the employee back to FORM_SENT for resubmission.
    if (decisionStatus === 'CORRECTION_REQUESTED') {
      const { error: empUpdateErr } = await supabaseAdmin
        .from('employees')
        .update({ onboarding_status: 'FORM_SENT' })
        .eq('id', employeeId);
      if (empUpdateErr) throw empUpdateErr;
    }

    return res.json({ form: updatedForm });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payroll-form-review', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const clientId = String(req.body?.client_id ?? '').trim();
    const decisionStatus = String(req.body?.decision_status ?? '').trim().toUpperCase();
    const reasonRaw = String(req.body?.decision_reason ?? '');
    const decisionReason = reasonRaw.trim();
    const fieldMarks = req.body?.field_marks ?? {};

    if (!clientId) {
      return res.status(400).json({ error: 'client_id is required.' });
    }
    if (!PAYROLL_FORM_REVIEW_DECISIONS.has(decisionStatus)) {
      return res.status(400).json({ error: 'decision_status must be APPROVED or REJECTED.' });
    }
    if (!fieldMarks || typeof fieldMarks !== 'object' || Array.isArray(fieldMarks)) {
      return res.status(400).json({ error: 'field_marks must be an object keyed by form field names.' });
    }

    const ownedPl = await fetchPayrollLeadOwnedClient(req, clientId);
    if (!ownedPl) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: emp, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!emp || emp.client_id !== clientId) {
      return res.status(404).json({ error: 'Employee not found for this client' });
    }

    const { data: formFull, error: fullErr } = await supabaseAdmin
      .from('job_app_form')
      .select('*')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (fullErr) throw fullErr;
    if (!formFull) {
      return res.status(404).json({ error: 'Application form not found for this employee' });
    }
    if (formFull.submission_status !== 'Submitted') {
      return res.status(400).json({ error: 'Only submitted applications can be reviewed.' });
    }
    if (formFull.review_status !== 'APPROVED') {
      return res.status(400).json({ error: 'Application must be approved by Program Manager first.' });
    }
    if (formFull.payroll_review_status !== 'PENDING_PAYROLL_LEAD') {
      return res.status(400).json({
        error: 'Application is not awaiting Payroll Lead review.',
      });
    }

    if (decisionStatus === 'REJECTED' && !decisionReason) {
      return res.status(400).json({ error: 'Reason is required when rejecting an application.' });
    }

    const markErrors = [];
    const incorrectFromMarks = [];
    const requiredMarkedFields = REVIEWABLE_JOB_FORM_FIELDS.filter(
      (key) => CORRECTION_EDITABLE_FIELDS.has(key) && hasProvidedReviewValue(formFull[key])
    );
    if (decisionStatus === 'APPROVED') {
      for (const key of requiredMarkedFields) {
        const mark = String(fieldMarks[key] ?? '').trim().toLowerCase();
        if (mark !== 'correct' && mark !== 'incorrect') {
          markErrors.push(key);
        } else if (mark === 'incorrect') {
          incorrectFromMarks.push(key);
        }
      }
      if (markErrors.length > 0) {
        return res.status(400).json({
          error: 'Please mark every field before taking action.',
          details: { unmarked_fields: markErrors },
        });
      }
      if (incorrectFromMarks.length > 0) {
        return res.status(400).json({
          error: 'Please verify this field first.',
          details: { incorrect_fields: incorrectFromMarks },
        });
      }
    }

    const now = new Date().toISOString();
    const payrollReason = decisionStatus === 'APPROVED' ? null : decisionReason || null;
    const payrollStatus = decisionStatus === 'APPROVED' ? 'PAYROLL_APPROVED' : 'PAYROLL_REJECTED';
    const cycleNo = await nextPayrollReviewCycle(formFull.id);

    const { error: reviewInsertErr } = await supabaseAdmin.from('job_app_form_payroll_reviews').insert({
      job_app_form_id: formFull.id,
      employee_id: formFull.employee_id,
      client_id: formFull.client_id,
      cycle_no: cycleNo,
      decision_status: decisionStatus,
      rejected_fields: [],
      decision_reason: payrollReason,
      reviewed_by: req.user.id,
      reviewed_at: now,
    });
    if (reviewInsertErr) throw reviewInsertErr;

    const { data: updatedForm, error: upErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        payroll_review_status: payrollStatus,
        payroll_review_reason: payrollReason,
        payroll_reviewed_by: req.user.id,
        payroll_reviewed_at: now,
        updated_at: now,
      })
      .eq('id', formFull.id)
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;

    return res.json({ form: updatedForm });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payroll-reset-to-pl', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const clientId = String(req.body?.client_id ?? '').trim();
    if (!clientId) {
      return res.status(400).json({ error: 'client_id is required.' });
    }

    const ownedPm = await fetchProgramManagerOwnedClient(req, clientId);
    if (!ownedPm) return res.status(403).json({ error: 'Not authorized for this client' });

    const { data: emp, error: empErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!emp || emp.client_id !== clientId) {
      return res.status(404).json({ error: 'Employee not found for this client' });
    }

    const { data: formRow, error: formErr } = await supabaseAdmin
      .from('job_app_form')
      .select('id, employee_id, review_status, payroll_review_status')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!formRow) {
      return res.status(404).json({ error: 'Application form not found for this employee' });
    }
    if (formRow.review_status !== 'APPROVED') {
      return res.status(400).json({ error: 'Application is not approved by Program Manager.' });
    }
    if (formRow.payroll_review_status !== 'PAYROLL_REJECTED') {
      return res.status(400).json({ error: 'Application was not rejected by Payroll Lead.' });
    }

    const now = new Date().toISOString();
    const { data: updatedForm, error: upErr } = await supabaseAdmin
      .from('job_app_form')
      .update({
        payroll_review_status: 'PENDING_PAYROLL_LEAD',
        payroll_review_reason: null,
        payroll_reviewed_by: null,
        payroll_reviewed_at: null,
        updated_at: now,
      })
      .eq('id', formRow.id)
      .select('*')
      .maybeSingle();
    if (upErr) throw upErr;

    return res.json({ form: updatedForm });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/role-details', async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('employees')
      .select('id, client_id, onboarding_status')
      .eq('id', employeeId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return res.status(404).json({ error: 'Employee not found' });

    const owned = await fetchOwnedClient(req, row.client_id);
    if (!owned) return res.status(403).json({ error: 'Not authorized for this employee' });
    if (row.onboarding_status !== 'AVAILABLE') {
      return res.status(400).json({ error: 'Only AVAILABLE employees can be role-specified' });
    }

    const designationSet = await fetchClientDesignations(row.client_id);
    const validation = validateRoleDetails(req.body || {}, designationSet);
    if (validation.errors) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('employees')
      .update({ ...validation.roleDetails, onboarding_status: 'ROLE_ASSIGNED' })
      .eq('id', employeeId)
      .select('*')
      .maybeSingle();
    if (error) throw error;

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
