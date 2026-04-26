import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const router = Router();

function validateClientPayload(body) {
  const errors = {};
  const required = [
    'client_name',
    'contract_code',
    'contract_start_date',
    'contract_end_date',
    'program_manager_id'
  ];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === '') {
      errors[key] = 'required';
    }
  }
  if (typeof body.insurance_applicable !== 'boolean') {
    errors.insurance_applicable = 'must be boolean';
  }
  if (body.insurance_applicable === true) {
    if (!body.insurance_name || !String(body.insurance_name).trim()) {
      errors.insurance_name = 'required when insurance is applicable';
    }
  }
  if (body.contract_start_date && body.contract_end_date) {
    if (new Date(body.contract_end_date) < new Date(body.contract_start_date)) {
      errors.contract_end_date = 'must be on or after contract_start_date';
    }
  }
  if (!Array.isArray(body.designations)) {
    errors.designations = 'must be an array of strings';
  } else {
    const cleaned = body.designations.map(d => String(d).trim()).filter(Boolean);
    if (cleaned.length === 0) {
      errors.designations = 'at least one designation required';
    }
  }
  return errors;
}

function normalizedDesignations(input) {
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const name = String(raw).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

async function fetchClientWithRelations(clientId) {
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*, program_manager:program_manager_id(id, name, email)')
    .eq('id', clientId)
    .single();
  if (clientErr) throw clientErr;

  const { data: designations, error: desigErr } = await supabaseAdmin
    .from('designations')
    .select('name')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (desigErr) throw desigErr;

  return {
    ...client,
    program_manager_name: client.program_manager?.name ?? null,
    designations: designations.map(d => d.name)
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('*, program_manager:program_manager_id(id, name, email)')
      .eq('created_by', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (clients.length === 0) return res.json([]);

    const ids = clients.map(c => c.id);
    const { data: desigs, error: desigErr } = await supabaseAdmin
      .from('designations')
      .select('client_id, name')
      .in('client_id', ids);
    if (desigErr) throw desigErr;

    const byClient = new Map();
    for (const d of desigs) {
      if (!byClient.has(d.client_id)) byClient.set(d.client_id, []);
      byClient.get(d.client_id).push(d.name);
    }

    res.json(clients.map(c => ({
      ...c,
      program_manager_name: c.program_manager?.name ?? null,
      designations: byClient.get(c.id) ?? []
    })));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const errors = validateClientPayload(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { data: pm, error: pmErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', req.body.program_manager_id)
      .maybeSingle();
    if (pmErr) throw pmErr;
    if (!pm || pm.role !== 'PROGRAM_MANAGER') {
      return res.status(400).json({ error: 'Invalid program_manager_id' });
    }

    const insertPayload = {
      client_name: req.body.client_name.trim(),
      contract_code: req.body.contract_code.trim(),
      contract_start_date: req.body.contract_start_date,
      contract_end_date: req.body.contract_end_date,
      program_manager_id: req.body.program_manager_id,
      insurance_applicable: req.body.insurance_applicable,
      insurance_name: req.body.insurance_applicable ? req.body.insurance_name.trim() : null,
      created_by: req.user.id
    };

    const { data: created, error: insertErr } = await supabaseAdmin
      .from('clients')
      .insert(insertPayload)
      .select()
      .single();
    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'contract_code already exists' });
      }
      throw insertErr;
    }

    const designations = normalizedDesignations(req.body.designations);
    if (designations.length) {
      const rows = designations.map(name => ({ client_id: created.id, name }));
      const { error: desigErr } = await supabaseAdmin.from('designations').insert(rows);
      if (desigErr) {
        await supabaseAdmin.from('clients').delete().eq('id', created.id);
        throw desigErr;
      }
    }

    const full = await fetchClientWithRelations(created.id);
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('clients')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing || existing.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const errors = validateClientPayload(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { data: pm, error: pmErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', req.body.program_manager_id)
      .maybeSingle();
    if (pmErr) throw pmErr;
    if (!pm || pm.role !== 'PROGRAM_MANAGER') {
      return res.status(400).json({ error: 'Invalid program_manager_id' });
    }

    const updatePayload = {
      client_name: req.body.client_name.trim(),
      contract_code: req.body.contract_code.trim(),
      contract_start_date: req.body.contract_start_date,
      contract_end_date: req.body.contract_end_date,
      program_manager_id: req.body.program_manager_id,
      insurance_applicable: req.body.insurance_applicable,
      insurance_name: req.body.insurance_applicable ? req.body.insurance_name.trim() : null
    };

    const { error: updateErr } = await supabaseAdmin
      .from('clients')
      .update(updatePayload)
      .eq('id', id);
    if (updateErr) {
      if (updateErr.code === '23505') {
        return res.status(409).json({ error: 'contract_code already exists' });
      }
      throw updateErr;
    }

    const { error: delErr } = await supabaseAdmin
      .from('designations')
      .delete()
      .eq('client_id', id);
    if (delErr) throw delErr;

    const designations = normalizedDesignations(req.body.designations);
    if (designations.length) {
      const rows = designations.map(name => ({ client_id: id, name }));
      const { error: insErr } = await supabaseAdmin.from('designations').insert(rows);
      if (insErr) throw insErr;
    }

    const full = await fetchClientWithRelations(id);
    res.json(full);
  } catch (err) {
    next(err);
  }
});

export default router;
