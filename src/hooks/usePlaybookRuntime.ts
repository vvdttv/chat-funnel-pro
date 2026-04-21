/**
 * Hook do runtime composicional (Sprint 5).
 *
 * Carrega catálogos globais (`stage_archetypes`, `status_archetypes`,
 * `funnel_stages`, `stage_playbooks`, `playbook_overrides`) e expõe
 * `compose(funnelId, stageId, dealStatus)` que devolve o `EffectivePlaybook`
 * pronto, bem como `renderPrompt` (atalho).
 *
 * As regras/comportamentos/escadas/triggers vêm do `useIABehavior` para evitar
 * fetches duplicados — quando a org ainda não foi semeada, ele cai no seed
 * local (`fromCloud=false`) automaticamente.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIABehavior } from '@/hooks/useIABehavior';
import {
  composeEffectivePlaybook, renderSystemPrompt,
  type ComposeInput, type EffectivePlaybook,
  type StageArchetype, type StatusArchetype, type PhysicalStage,
  type CatalogPlaybook, type PlaybookOverride, type StageIdentity,
} from '@/lib/playbookComposer';
import { useFunnels } from '@/hooks/useFunnels';

interface RuntimeState {
  loading: boolean;
  error: string | null;
  archetypes: StageArchetype[];
  statusArchetypes: StatusArchetype[];
  physicalStages: PhysicalStage[];
  catalogPlaybooks: CatalogPlaybook[];
  overrides: PlaybookOverride[];
}

const parseIdentity = (raw: unknown): StageIdentity => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as StageIdentity; } catch { return { identityNotes: raw }; }
  }
  if (typeof raw === 'object') return raw as StageIdentity;
  return {};
};

export function usePlaybookRuntime() {
  const { profile } = useAuth();
  const { funnels } = useFunnels();
  const ia = useIABehavior();
  const [state, setState] = useState<RuntimeState>({
    loading: true, error: null,
    archetypes: [], statusArchetypes: [], physicalStages: [],
    catalogPlaybooks: [], overrides: [],
  });

  const orgId = profile?.organization_id;

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [arch, statusArch, fStages, pbs, ovs] = await Promise.all([
        supabase.from('stage_archetypes').select('id,code,name,purpose,default_playbook_code,context_tags').eq('is_active', true),
        supabase.from('status_archetypes').select('id,code,name,default_overlay_rules').eq('is_active', true),
        supabase.from('funnel_stages').select('funnel_id,stage_id,position,stage_archetype_id,purpose,context_tags'),
        supabase.from('stage_playbooks').select('code,archetype_id,status_archetype_id,kind,goal,success_criteria,failure_criteria,default_ladder_code,typical_behavior_codes,identity').eq('is_active', true),
        supabase.from('playbook_overrides').select('scope_type,scope_id,layer,payload').eq('is_active', true),
      ]);
      const firstErr = [arch, statusArch, fStages, pbs, ovs].find(r => r.error)?.error;
      if (firstErr) throw firstErr;

      setState({
        loading: false, error: null,
        archetypes: (arch.data ?? []).map(r => ({
          id: r.id, code: r.code, name: r.name, purpose: r.purpose ?? '',
          defaultPlaybookCode: r.default_playbook_code ?? null,
          contextTags: Array.isArray(r.context_tags) ? (r.context_tags as string[]) : [],
        })),
        statusArchetypes: (statusArch.data ?? []).map(r => ({
          id: r.id, code: r.code as 'open' | 'won' | 'lost', name: r.name,
          defaultOverlayRules: (r.default_overlay_rules as Record<string, unknown>) ?? {},
        })),
        physicalStages: (fStages.data ?? []).map(r => ({
          funnelId: r.funnel_id, stageId: r.stage_id, position: r.position ?? 0,
          stageArchetypeId: r.stage_archetype_id ?? null,
          identity: parseIdentity(r.purpose),
          contextTags: Array.isArray(r.context_tags) ? (r.context_tags as string[]) : [],
        })),
        catalogPlaybooks: (pbs.data ?? []).map(r => ({
          code: r.code,
          archetypeId: r.archetype_id ?? null,
          statusArchetypeId: r.status_archetype_id ?? null,
          kind: (r.kind as 'stage' | 'overlay') ?? 'stage',
          goal: r.goal ?? '',
          successCriteria: Array.isArray(r.success_criteria) ? (r.success_criteria as string[]) : [],
          failureCriteria: Array.isArray(r.failure_criteria) ? (r.failure_criteria as string[]) : [],
          defaultLadderCode: r.default_ladder_code ?? null,
          typicalBehaviorCodes: Array.isArray(r.typical_behavior_codes) ? (r.typical_behavior_codes as string[]) : [],
          identity: parseIdentity(r.identity),
        })),
        overrides: (ovs.data ?? []).map(r => ({
          scopeType: r.scope_type as PlaybookOverride['scopeType'],
          scopeId: r.scope_id,
          layer: r.layer as PlaybookOverride['layer'],
          payload: (r.payload as PlaybookOverride['payload']) ?? {},
        })),
      });
    } catch (e) {
      console.error('[usePlaybookRuntime]', e);
      setState(s => ({
        ...s, loading: false,
        error: e instanceof Error ? e.message : 'Erro ao carregar runtime',
      }));
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const compose = useCallback(
    (funnelId: string, stageId: string, dealStatus: 'open' | 'won' | 'lost' = 'open'): EffectivePlaybook | null => {
      if (state.loading || ia.loading) return null;
      const funnel = funnels.find(f => f.id === funnelId);
      const funnelContextTags: string[] = (funnel as unknown as { context_tags?: string[] })?.context_tags ?? [];
      const input: ComposeInput = {
        funnelId, stageId, dealStatus, funnelContextTags,
        archetypes: state.archetypes,
        statusArchetypes: state.statusArchetypes,
        physicalStages: state.physicalStages,
        catalogPlaybooks: state.catalogPlaybooks,
        overrides: state.overrides,
        rules: ia.rules,
        behaviors: ia.behaviors,
        ladders: ia.ladders,
        triggers: ia.triggers,
      };
      return composeEffectivePlaybook(input);
    },
    [state, ia, funnels],
  );

  const renderPrompt = useCallback(
    (funnelId: string, stageId: string, dealStatus: 'open' | 'won' | 'lost' = 'open'): string => {
      const pb = compose(funnelId, stageId, dealStatus);
      return pb ? renderSystemPrompt(pb) : '';
    },
    [compose],
  );

  return useMemo(() => ({
    loading: state.loading || ia.loading,
    error: state.error ?? ia.error,
    refresh: fetchAll,
    compose,
    renderPrompt,
  }), [state.loading, state.error, ia.loading, ia.error, fetchAll, compose, renderPrompt]);
}
