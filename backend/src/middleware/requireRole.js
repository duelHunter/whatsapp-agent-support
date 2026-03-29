const { supabaseAdmin } = require('../auth/supabase');

function normalizeRole(role) {
  if (!role) return null;
  return role.toLowerCase();
}

module.exports = function requireRole(allowedRoles = []) {
  const normalized = allowedRoles.map(normalizeRole);

  return async function (req, res, next) {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }

      const orgId =
        req.headers['x-org-id'] ||
        req.body?.org_id ||
        req.query?.org_id;

      if (!orgId) {
        return res.status(400).json({ error: 'x-org-id is required' });
      }

      if (!req.auth?.user?.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { data, error } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', req.auth.user.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error checking membership:', error);
        return res.status(500).json({ error: 'Membership check failed' });
      }

      if (!data?.role) {
        return res.status(403).json({ error: 'Not a member of this organization' });
      }

      const role = normalizeRole(data.role);
      req.auth.role = role;
      req.auth.org_id = orgId;

      if (normalized.length === 0) {
        return next();
      }

      if (!normalized.includes(role)) {
        return res.status(403).json({ error: 'Insufficient role for this action' });
      }

      next();
    } catch (err) {
      console.error('❌ Role check error:', err);
      res.status(500).json({ error: 'Role verification failed' });
    }
  };
};

