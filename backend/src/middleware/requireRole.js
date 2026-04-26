import { supabaseAdmin } from '../supabase.js';

export function requireRole(role) {
  return async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', req.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(403).json({ error: 'User profile not found' });
      if (data.role !== role) {
        return res.status(403).json({ error: `Forbidden: requires role ${role}` });
      }
      req.user.role = data.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
