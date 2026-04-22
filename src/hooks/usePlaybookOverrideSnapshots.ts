/**
 * Sprint 15 — Histórico versionado de `playbook_overrides`.
 *
 * Lê a tabela `playbook_override_snapshots` filtrando por escopo
 * (scope_type + scope_id + layer opcional) e expõe helpers para criar
 * novos snapshots a cada upsert/desativação/rollback.
 *
 * O componente caller é responsável por chamar `recordSnapshot` antes
 * ou depois de mutar o override. Mantemos o snapshot *imutável*: cada
 * entrada captura o payload no momento da ação, com `action` indicando
 * o motivo (upsert | deactivate | rollback).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { PlaybookOverride } from '@/lib/playbookComposer';

export interface OverrideSnapshot {
  id: string;
  overrideId: string | null;
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  layer: PlaybookOverride['layer'];
  payload: PlaybookOverride['payload'];
  isActive: boolean;
  action: 'upsert' | 'deactivate' | 'rollback';
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface RecordArgs {
  overrideId: string | null;
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  layer: PlaybookOverride['layer'];
  payload: PlaybookOverride['payload'];
  isActive: boolean;
  action: OverrideSnapshot['action'];
  note?: string;
}

interface Filter {
  scopeType?: PlaybookOverride['scopeType'];
  scopeId?: string;
  layer?: PlaybookOverride['layer'];
  limit?: number;
}

export function usePlaybookOverrideSnapshots(filter?: Filter) {
  const { user, profile } = useAuth();
  const orgId = profile?.organization_id;
  const [items, setItems] = useState<OverrideSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      let q = supabase
        .from('playbook_override_snapshots')
        .select('id,override_id,scope_type,scope_id,layer,payload,is_active,action,note,created_by,created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(filter?.limit ?? 50);
      if (filter?.scopeType) q = q.eq('scope_type', filter.scopeType);
      if (filter?.scopeId) q = q.eq('scope_id', filter.scopeId);
      if (filter?.layer) q = q.eq('layer', filter.layer);
      const { data, error: err } = await q;
      if (err) throw err;
      setItems((data ?? []).map(r => ({
        id: r.id,
        overrideId: r.override_id,
        scopeType: r.scope_type as PlaybookOverride['scopeType'],
        scopeId: r.scope_id,
        layer: r.layer as PlaybookOverride['layer'],
        payload: (r.payload as PlaybookOverride['payload']) ?? {},
        isActive: r.is_active,
        action: r.action as OverrideSnapshot['action'],
        note: r.note,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })));
    } catch (e) {
      console.error('[usePlaybookOverrideSnapshots]', e);
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }, [orgId, filter?.scopeType, filter?.scopeId, filter?.layer, filter?.limit]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const recordSnapshot = useCallback(async (args: RecordArgs) => {
    if (!orgId) throw new Error('sem_organizacao');
    const { error: err } = await supabase
      .from('playbook_override_snapshots')
      .insert({
        organization_id: orgId,
        override_id: args.overrideId,
        scope_type: args.scopeType,
        scope_id: args.scopeId,
        layer: args.layer,
        payload: args.payload as unknown as never,
        is_active: args.isActive,
        action: args.action,
        note: args.note ?? null,
        created_by: user?.id ?? null,
      });
    if (err) throw err;
    await fetchSnapshots();
  }, [orgId, user?.id, fetchSnapshots]);

  return { items, loading, error, refresh: fetchSnapshots, recordSnapshot };
}
