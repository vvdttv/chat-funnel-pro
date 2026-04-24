/**
 * Hook para carregar atividades de um deal e expor `resolveActivity`
 * — wrapper sobre a RPC `resolve_deal_activity` que centraliza:
 *   marcar pendente como feita, criar próxima, mover etapa, mudar status.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealActivityRow {
  id: string;
  deal_id: string;
  organization_id: string;
  type_code: string;
  title: string;
  description: string;
  scheduled_at: string | null;
  done_at: string | null;
  outcome_summary: string;
  next_action_required: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResolveActivityInput {
  doneActivityId?: string | null;
  outcomeSummary?: string;
  nextTypeCode?: string | null;
  nextScheduledAt?: string | null;
  nextDescription?: string | null;
  newStageId?: string | null;
  newStatus?: 'open' | 'won' | 'lost' | null;
  lossReason?: string | null;
  archive?: boolean;
}

const ERR_MAP: Record<string, string> = {
  sem_organizacao: 'Sua sessão não está vinculada a uma organização.',
  deal_nao_encontrado: 'Negócio não encontrado.',
  sem_permissao: 'Você não tem permissão para alterar este negócio.',
};

const translate = (raw?: string | null) => {
  if (!raw) return 'Erro desconhecido';
  for (const k of Object.keys(ERR_MAP)) if (raw.includes(k)) return ERR_MAP[k];
  return raw;
};

export function useDealActivities(dealId: string | null) {
  const [activities, setActivities] = useState<DealActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!dealId) { setActivities([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('deal_activities')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });
    if (!error) setActivities((data || []) as DealActivityRow[]);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { refresh(); }, [refresh]);

  const pendingActivity = activities
    .filter(a => !a.done_at && a.scheduled_at)
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))[0] || null;

  const lastDoneActivity = activities
    .filter(a => a.done_at)
    .sort((a, b) => (a.done_at! > b.done_at! ? -1 : 1))[0] || null;

  const resolveActivity = useCallback(async (input: ResolveActivityInput) => {
    if (!dealId) return { error: 'Sem deal selecionado' };
    const { error } = await supabase.rpc('resolve_deal_activity', {
      p_deal_id: dealId,
      p_done_activity_id: input.doneActivityId ?? null,
      p_outcome_summary: input.outcomeSummary ?? '',
      p_next_type_code: input.nextTypeCode ?? null,
      p_next_scheduled_at: input.nextScheduledAt ?? null,
      p_next_description: input.nextDescription ?? '',
      p_new_stage_id: input.newStageId ?? null,
      p_new_status: input.newStatus ?? null,
      p_loss_reason: input.lossReason ?? null,
      p_archive: input.archive ?? false,
    });
    if (error) return { error: translate(error.message) };
    await refresh();
    return { error: null };
  }, [dealId, refresh]);

  return { activities, pendingActivity, lastDoneActivity, loading, refresh, resolveActivity };
}
