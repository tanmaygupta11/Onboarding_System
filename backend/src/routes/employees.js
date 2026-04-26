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
    res.json(data);
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
      .select('id');
    if (error) throw error;

    res.json({ updated: updated.length, employee_ids: updated.map(r => r.id) });
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
