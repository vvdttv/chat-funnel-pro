import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { FunnelStage } from '@/data/mockData';
import { translateSyncError } from '@/lib/funnelStageSyncMessages';

/**
 * Hook da Fase J-2b-0b: sincroniza etapas de um funil via RPC sync_funnel_stages,
 * que reconcilia funnels.stages (jsonb do front) E funnel_stages (tabela do motor)
 * numa transacao. Substitui a gravacao direta-so-jsonb do useFunnels para etapas,
 * fechando a divida em que o motor ficava dessincronizado.
 *
 * Tambem carrega o catalogo de papeis (stage_roles) para o seletor de papel.
 */
export interface StageRole {
  role: string;
  label: string;
  description: string | null;
  is_critical: boolean;
  position: number;
}

export function useStageRoles() {
  const [roles, setRoles] = useState<StageRole[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('stage_roles')
        .select('*')
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) { console.error('[useStageRoles]', error); setRoles([]); }
      else setRoles((data || []) as StageRole[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);
  return { roles, loading };
}

export function useFunnelStageSync() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Persiste a lista COMPLETA de etapas (na ordem desejada) via RPC.
   * Retorna true em sucesso. Em erro (ex.: papel critico removido), guarda a
   * mensagem traduzida em `error` e retorna false (o chamador reverte o estado).
   */
  const syncStages = useCallback(async (funnelId: string, stages: FunnelStage[]): Promise<boolean> => {
    setSaving(true);
    setError(null);
    // Mapeia o formato do front para o payload da RPC.
    const payload = stages.map((s) => ({
      id: s.id,
      name: s.name,
      probability: s.probability,
      maxDaysInStage: s.maxDaysInStage,
      touchpoints: s.touchpoints || [],
      playbookCode: s.playbookCode,
      playbookOverride: s.playbookOverride,
      role: s.role || null,
    }));
    const { error: rpcErr } = await supabase.rpc('sync_funnel_stages', {
      p_funnel_id: funnelId,
      p_stages: payload as unknown as never,
    });
    setSaving(false);
    if (rpcErr) {
      setError(translateSyncError(rpcErr.message));
      console.error('[useFunnelStageSync]', rpcErr);
      return false;
    }
    return true;
  }, []);

  return { syncStages, saving, error, clearError: () => setError(null) };
}

export { translateSyncError };
