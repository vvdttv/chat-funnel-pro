/**
 * Sprint 11 — CRUD de `playbook_overrides` por funil/etapa.
 *
 * Wrapper fino sobre `supabase.from('playbook_overrides')` com:
 *  - busca com filtro por escopo/layer (memoizada por chave)
 *  - upsert (insert se não existe, update caso contrário)
 *  - delete suave (`is_active=false`) — mantemos histórico para auditoria
 *
 * RLS já garante que admins editam só sua org. Aqui assumimos que o caller
 * só passa scopeIds de funis/etapas que ele tem acesso.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { PlaybookOverride } from '@/lib/playbookComposer';

interface OverrideRow extends PlaybookOverride {
  id: string;
  isActive: boolean;
}

export interface UpsertOverrideArgs {
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  layer: PlaybookOverride['layer'];
  payload: PlaybookOverride['payload'];
}

export function usePlaybookOverrides(scopeFilter?: {
  scopeType?: PlaybookOverride['scopeType'];
  scopeId?: string;
}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = profile?.organization_id;

  const fetchOverrides = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      let q = supabase
        .from('playbook_overrides')
        .select('id,scope_type,scope_id,layer,payload,is_active')
        .eq('organization_id', orgId);
      if (scopeFilter?.scopeType) q = q.eq('scope_type', scopeFilter.scopeType);
      if (scopeFilter?.scopeId) q = q.eq('scope_id', scopeFilter.scopeId);
      const { data, error: err } = await q;
      if (err) throw err;
      setItems((data ?? []).map(r => ({
        id: r.id,
        scopeType: r.scope_type as PlaybookOverride['scopeType'],
        scopeId: r.scope_id,
        layer: r.layer as PlaybookOverride['layer'],
        payload: (r.payload as PlaybookOverride['payload']) ?? {},
        isActive: r.is_active,
      })));
    } catch (e) {
      console.error('[usePlaybookOverrides]', e);
      setError(e instanceof Error ? e.message : 'Erro ao carregar overrides');
    } finally {
      setLoading(false);
    }
  }, [orgId, scopeFilter?.scopeType, scopeFilter?.scopeId]);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  const upsert = useCallback(async (args: UpsertOverrideArgs) => {
    if (!orgId) throw new Error('sem_organizacao');
    const { data: existing } = await supabase
      .from('playbook_overrides')
      .select('id')
      .eq('organization_id', orgId)
      .eq('scope_type', args.scopeType)
      .eq('scope_id', args.scopeId)
      .eq('layer', args.layer)
      .maybeSingle();

    if (existing?.id) {
      const { error: err } = await supabase
        .from('playbook_overrides')
        .update({
          payload: args.payload as unknown as never,
          is_active: true,
        })
        .eq('id', existing.id);
      if (err) throw err;
      return existing.id;
    }
    const { data: inserted, error: err } = await supabase
      .from('playbook_overrides')
      .insert({
        organization_id: orgId,
        scope_type: args.scopeType,
        scope_id: args.scopeId,
        layer: args.layer,
        payload: args.payload as unknown as never,
        is_active: true,
      })
      .select('id')
      .maybeSingle();
    if (err) throw err;
    await fetchOverrides();
    return inserted?.id ?? '';
  }, [orgId, fetchOverrides]);

  const deactivate = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('playbook_overrides')
      .update({ is_active: false })
      .eq('id', id);
    if (err) throw err;
    await fetchOverrides();
  }, [fetchOverrides]);

  return { items, loading, error, refresh: fetchOverrides, upsert, deactivate };
}
