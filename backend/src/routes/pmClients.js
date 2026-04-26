import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

router.use(requireRole('PROGRAM_MANAGER'));

router.get('/', async (req, res, next) => {
  try {
    const { data: clients, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('program_manager_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (clients.length === 0) return res.json([]);

    const ids = clients.map(c => c.id);
    const { data: desigs, error: dErr } = await supabaseAdmin
      .from('designations')
      .select('client_id, name')
      .in('client_id', ids);
    if (dErr) throw dErr;

    const byClient = new Map();
    for (const d of desigs) {
      if (!byClient.has(d.client_id)) byClient.set(d.client_id, []);
      byClient.get(d.client_id).push(d.name);
    }

    res.json(clients.map(c => ({
      ...c,
      designations: byClient.get(c.id) ?? []
    })));
  } catch (err) {
    next(err);
  }
});

export default router;
