/**
 * Helpers de transição atômica para deals (Sprint 6).
 *
 * Encapsulam as RPCs `move_deal_stage` e `change_deal_status` (que usam
 * `SELECT FOR UPDATE` no servidor) para impedir condições de corrida quando
 * dois usuários — ou duas abas — alteram o mesmo deal simultaneamente.
 *
 * Cada helper retorna `{ data, error }` no estilo Supabase. Erros conhecidos
 * vindos do PL/pgSQL (`deal_nao_encontrado`, `sem_permissao`, etc.) são
 * traduzidos para mensagens em português prontas para o toast.
 */

import { supabase } from '@/integrations/supabase/client';
import { translate } from '@/lib/transitionMessages';

export { translate };

export type DealStatus = 'open' | 'won' | 'lost';

export interface MoveStageResult {
  dealId: string;
  fromStageId: string | null;
  toStageId: string;
  movedAt: string;
}

export interface ChangeStatusResult {
  dealId: string;
  fromStatus: DealStatus;
  toStatus: DealStatus;
  changedAt: string;
}

export async function moveDealStageAtomic(
  dealId: string,
  newStageId: string,
  reason?: string,
): Promise<{ data: MoveStageResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('move_deal_stage', {
    p_deal_id: dealId,
    p_new_stage_id: newStageId,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error('[moveDealStageAtomic]', error);
    return { data: null, error: translate(error.message) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: 'Sem retorno do servidor' };
  return {
    data: {
      dealId: row.deal_id,
      fromStageId: row.from_stage_id,
      toStageId: row.to_stage_id,
      movedAt: row.moved_at,
    },
    error: null,
  };
}

export async function changeDealStatusAtomic(
  dealId: string,
  newStatus: DealStatus,
  reason?: string,
  lostSubstage?: string,
): Promise<{ data: ChangeStatusResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('change_deal_status', {
    p_deal_id: dealId,
    p_new_status: newStatus,
    p_reason: reason ?? null,
    p_lost_substage: lostSubstage ?? null,
  });
  if (error) {
    console.error('[changeDealStatusAtomic]', error);
    return { data: null, error: translate(error.message) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: 'Sem retorno do servidor' };
  return {
    data: {
      dealId: row.deal_id,
      fromStatus: row.from_status as DealStatus,
      toStatus: row.to_status as DealStatus,
      changedAt: row.changed_at,
    },
    error: null,
  };
}
