import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook da Fase J-2b-1c: gerencia funnel_access (quais funis um usuario/corretor
 * acessa). A roleta de cada funil so distribui entre quem tem acesso (J-2b-1a).
 * Permissao por user_id. Admin/superadmin veem tudo sem precisar de registro.
 */
export interface FunnelAccessRow {
  id: string;
  user_id: string;
  funnel_id: string;
}

export function useFunnelAccess() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [rows, setRows] = useState<FunnelAccessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) { setRows([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('funnel_access')
      .select('id, user_id, funnel_id');
    if (error) { console.error('[useFunnelAccess]', error); setRows([]); }
    else setRows((data || []) as FunnelAccessRow[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  // Funis que um usuario acessa.
  const funnelsForUser = useCallback(
    (userId: string | null) => userId ? rows.filter(r => r.user_id === userId).map(r => r.funnel_id) : [],
    [rows],
  );

  // Liga/desliga acesso de um usuario a um funil.
  const toggleAccess = useCallback(async (userId: string, funnelId: string, grant: boolean) => {
    if (!orgId || !userId) return;
    if (grant) {
      const { error } = await supabase.from('funnel_access')
        .insert({ organization_id: orgId, user_id: userId, funnel_id: funnelId });
      if (error && error.code !== '23505') { // ignora duplicado
        console.error('[useFunnelAccess] grant', error);
        const { toast } = await import('sonner');
        toast.error('Não foi possível conceder o acesso ao funil.');
        return;
      }
    } else {
      const { error } = await supabase.from('funnel_access')
        .delete().eq('user_id', userId).eq('funnel_id', funnelId);
      if (error) {
        console.error('[useFunnelAccess] revoke', error);
        const { toast } = await import('sonner');
        toast.error('Não foi possível remover o acesso ao funil.');
        return;
      }
    }
    await load();
  }, [orgId, load]);

  return { rows, loading, funnelsForUser, toggleAccess, reload: load };
}
