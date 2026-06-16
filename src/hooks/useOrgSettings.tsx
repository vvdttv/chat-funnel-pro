import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Configurações da organização (`organizations.metadata`), Fase 3B.
 * Hoje guarda `max_projection_pct` (% de projeção de avaliação de imóvel usada
 * pelo match engine quando o imóvel não tem avaliação explícita). Escrita
 * restrita a admin (RLS de organizations).
 */
export interface OrgSettings {
  maxProjectionPct: number;
}

const DEFAULT_SETTINGS: OrgSettings = { maxProjectionPct: 0 };

export function useOrgSettings() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setSettings(DEFAULT_SETTINGS); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations').select('metadata').eq('id', orgId).maybeSingle();
    if (error) { setError(error.message); setLoading(false); return; }
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    const pct = Number(meta.max_projection_pct);
    setSettings({ maxProjectionPct: Number.isFinite(pct) ? pct : 0 });
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const updateMaxProjectionPct = useCallback(async (pct: number) => {
    if (!orgId) return { error: 'sem_organizacao' };
    // Lê o metadata atual e faz merge para não sobrescrever outras chaves.
    const { data: cur } = await supabase
      .from('organizations').select('metadata').eq('id', orgId).maybeSingle();
    const meta = { ...((cur?.metadata ?? {}) as Record<string, unknown>), max_projection_pct: pct };
    const { error } = await supabase.from('organizations').update({ metadata: meta }).eq('id', orgId);
    if (error) { console.error('[useOrgSettings] atualizar pct', error); return { error: error.message }; }
    setSettings(s => ({ ...s, maxProjectionPct: pct }));
    return {};
  }, [orgId]);

  return { settings, loading, error, updateMaxProjectionPct, reload: load };
}
