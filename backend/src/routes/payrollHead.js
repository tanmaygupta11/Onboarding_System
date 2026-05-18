import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

router.use(requireRole('PAYROLL_HEAD'));

// Effective monthly CTC: MONTHLY is raw value; ANNUAL is divided by 12.
function effectiveMonthlyCTC(ctcType, ctcValue) {
  if (ctcValue == null) return null;
  const v = Number(ctcValue);
  if (!isFinite(v)) return null;
  if (String(ctcType).toUpperCase() === 'ANNUAL') return v / 12;
  return v;
}

const ESIC_MONTHLY_LIMIT = 43900;

// GET /api/admin/clients — all clients across every Payroll Lead.
router.get('/clients', async (req, res, next) => {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('*, program_manager:program_manager_id(id, name, email), creator:created_by(id, name, email)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const clientRows = clients ?? [];
    if (clientRows.length === 0) return res.json([]);

    const ids = clientRows.map((c) => c.id);
    const { data: desigs, error: desigErr } = await supabaseAdmin
      .from('designations')
      .select('client_id, name')
      .in('client_id', ids);
    if (desigErr) throw desigErr;

    const byClient = new Map();
    for (const d of desigs ?? []) {
      if (!byClient.has(d.client_id)) byClient.set(d.client_id, []);
      byClient.get(d.client_id).push(d.name);
    }

    res.json(
      clientRows.map((c) => ({
        ...c,
        program_manager_name: c.program_manager?.name ?? null,
        payroll_lead_name: c.creator?.name ?? null,
        designations: byClient.get(c.id) ?? []
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/compliance-stats — Section 1 (form/UAN/ESIC counts) +
// Section 2 (A = PL-approved, B = dropout/absconding, Active = A-B).
router.get('/compliance-stats', async (req, res, next) => {
  try {
    // 1. Fetch all employees (we need ctc fields, identity numbers, joining_status).
    const { data: employees, error: eErr } = await supabaseAdmin
      .from('employees')
      .select(
        'id, client_id, ctc_type, ctc_value, payroll_pf_uan_number, payroll_esic_number, joining_status'
      );
    if (eErr) throw eErr;

    const employeeRows = employees ?? [];
    const employeeIds = employeeRows.map((e) => e.id);

    // 2. Fetch job_app_form data for those employees.
    const formMap = new Map();
    if (employeeIds.length > 0) {
      const { data: forms, error: fErr } = await supabaseAdmin
        .from('job_app_form')
        .select('employee_id, submission_status, payroll_review_status')
        .in('employee_id', employeeIds);
      if (fErr) throw fErr;
      for (const form of forms ?? []) {
        formMap.set(form.employee_id, form);
      }
    }

    // 3. Compute Section 1 and Section 2 totals.
    let formSubmitted = 0;
    let withUan = 0;
    let withoutUan = 0;
    let withEsicUnderLimit = 0;
    let withoutEsicUnderLimit = 0;
    let outsideEsicLimit = 0;

    // Section 2 — from PL-approved employees only (B ⊆ A).
    let totalOnboarded = 0;   // A
    let totalDropout = 0;     // B
    // active = A - B computed at the end

    for (const emp of employeeRows) {
      const form = formMap.get(emp.id);

      // Section 1: submitted form (first submit tracked via submission_status = 'Submitted').
      if (form?.submission_status === 'Submitted') formSubmitted += 1;

      // UAN / ESIC are meaningful for employees with assigned CTC.
      const monthlyCTC = effectiveMonthlyCTC(emp.ctc_type, emp.ctc_value);
      if (monthlyCTC !== null) {
        const hasUan =
          typeof emp.payroll_pf_uan_number === 'string' &&
          emp.payroll_pf_uan_number.trim() !== '';
        if (hasUan) withUan += 1;
        else withoutUan += 1;

        const hasEsic =
          typeof emp.payroll_esic_number === 'string' &&
          emp.payroll_esic_number.trim() !== '';

        if (monthlyCTC <= ESIC_MONTHLY_LIMIT) {
          if (hasEsic) withEsicUnderLimit += 1;
          else withoutEsicUnderLimit += 1;
        } else {
          outsideEsicLimit += 1;
        }
      }

      // Section 2: PL-approved employees.
      if (form?.payroll_review_status === 'PAYROLL_APPROVED') {
        totalOnboarded += 1; // A
        const js = emp.joining_status;
        if (js === 'NOT_JOINED' || js === 'JOINED_ABSCONDED') {
          totalDropout += 1; // B
        }
      }
    }

    res.json({
      section1: {
        form_submitted: formSubmitted,
        with_uan: withUan,
        without_uan: withoutUan,
        with_esic_under_limit: withEsicUnderLimit,
        without_esic_under_limit: withoutEsicUnderLimit,
        outside_esic_limit: outsideEsicLimit
      },
      section2: {
        total_onboarded: totalOnboarded,
        total_dropout: totalDropout,
        active_employees: totalOnboarded - totalDropout
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
