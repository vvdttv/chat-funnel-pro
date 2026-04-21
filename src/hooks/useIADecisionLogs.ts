/**
 * Hook para auditoria das ia_decision_logs.
 *
 * Lê os últimos N logs da organização atual, com filtros opcionais por
 * deal, etapa (playbook code) e janela de tempo. Respeita RLS — admins
 * veem todos da org; corretores veem apenas dos deals atribuídos a eles.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface IADecisionLog {
  id: string;
  created_at: string;
  deal_id: string | null;
  funnel_id: string | null;
  stage_id: string | null;
  playbook_code: string | null;
  detected_behavior_codes: string[];
  applied_rule_codes: string[];
  intent: string | null;
  tone: string | null;
  action_taken: string;
  outcome: string | null;
  context: Record<string, unknown>;
  // ----- Sprint 6: proveniência composicional -----
  archetype_code: string | null;
  status_overlay_code: string | null;
  applied_override_ids: string[];
  context_tags: string[];
  deal_status: 'open' | 'won' | 'lost' | null;
}

export interface IALogFilters {
  playbookCode?: string;
  dealId?: string;
  sinceDays?: number;
  outcome?: string;
  intent?: string;
  limit?: number;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function useIADecisionLogs(filters: IALogFilters = {}) {
  const { session } = useAuth();
  const [logs, setLogs] = useState<IADecisionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    playbookCode, dealId, sinceDays, outcome, intent,
    limit = 100,
  } = filters;

  const fetchLogs = useCallback(async () => {
    if (!session) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('ia_decision_logs')
        .select('id,created_at,deal_id,funnel_id,stage_id,playbook_code,detected_behavior_codes,applied_rule_codes,intent,tone,action_taken,outcome,context,archetype_code,status_overlay_code,applied_override_ids,context_tags,deal_status')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (playbookCode) q = q.eq('playbook_code', playbookCode);
      if (dealId) q = q.eq('deal_id', dealId);
      if (outcome) q = q.eq('outcome', outcome);
      if (intent) q = q.eq('intent', intent);
      if (sinceDays && sinceDays > 0) {
        const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte('created_at', since);
      }

      const { data, error: err } = await q;
      if (err) throw err;
      const mapped = (data ?? []).map((r): IADecisionLog => ({
        id: r.id,
        created_at: r.created_at,
        deal_id: r.deal_id,
        funnel_id: r.funnel_id,
        stage_id: r.stage_id,
        playbook_code: r.playbook_code,
        detected_behavior_codes: asArray<string>(r.detected_behavior_codes),
        applied_rule_codes: asArray<string>(r.applied_rule_codes),
        intent: r.intent,
        tone: r.tone,
        action_taken: r.action_taken ?? '',
        outcome: r.outcome,
        context: asObj(r.context),
        archetype_code: (r as { archetype_code?: string | null }).archetype_code ?? null,
        status_overlay_code: (r as { status_overlay_code?: string | null }).status_overlay_code ?? null,
        applied_override_ids: asArray<string>((r as { applied_override_ids?: unknown }).applied_override_ids),
        context_tags: asArray<string>((r as { context_tags?: unknown }).context_tags),
        deal_status: ((r as { deal_status?: string | null }).deal_status ?? null) as IADecisionLog['deal_status'],
      }));
      setLogs(mapped);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar logs';
      console.error('[useIADecisionLogs]', e);
      setError(msg);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [session, playbookCode, dealId, sinceDays, outcome, intent, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const stats = useMemo(() => {
    const total = logs.length;
    const byOutcome = new Map<string, number>();
    const byIntent = new Map<string, number>();
    const byPlaybook = new Map<string, number>();
    for (const l of logs) {
      const o = l.outcome ?? 'sem_resultado';
      byOutcome.set(o, (byOutcome.get(o) ?? 0) + 1);
      if (l.intent) byIntent.set(l.intent, (byIntent.get(l.intent) ?? 0) + 1);
      if (l.playbook_code) byPlaybook.set(l.playbook_code, (byPlaybook.get(l.playbook_code) ?? 0) + 1);
    }
    return {
      total,
      byOutcome: Array.from(byOutcome.entries()).sort((a, b) => b[1] - a[1]),
      byIntent: Array.from(byIntent.entries()).sort((a, b) => b[1] - a[1]),
      byPlaybook: Array.from(byPlaybook.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [logs]);

  return { logs, stats, loading, error, refresh: fetchLogs };
}
