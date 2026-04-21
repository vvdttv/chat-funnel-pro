import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, AppRole } from '@/hooks/useAuth';

export interface OrgMember {
  user_id: string;
  username: string;
  display_name: string | null;
  role: AppRole;
}

/**
 * Lista membros da organização do usuário logado.
 * Só retorna dados úteis para admins (RLS impede corretores de ver perfis dos outros).
 */
export function useOrgMembers() {
  const { profile, isAdmin } = useAuth();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id || !isAdmin) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, username, display_name')
          .eq('organization_id', profile.organization_id),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('organization_id', profile.organization_id),
      ]);
      if (cancelled) return;
      const roleMap = new Map<string, AppRole>();
      (roles || []).forEach(r => roleMap.set(r.user_id, r.role as AppRole));
      setMembers(
        (profs || []).map(p => ({
          user_id: p.user_id,
          username: p.username,
          display_name: p.display_name,
          role: roleMap.get(p.user_id) || 'corretor',
        }))
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.organization_id, isAdmin]);

  return { members, loading };
}
