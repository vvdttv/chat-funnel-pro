/**
 * Bloqueio de oportunidades por falta de registro de atividade
 * (padrão Enermac).
 *
 * Cada deal pode estar em um destes estados forçados:
 *  - 'resolve_overdue'  → tem atividade pendente vencida (precisa registrar resultado)
 *  - 'register_outcome' → nunca foi registrada nenhuma atividade nem agendada uma próxima
 *  - 'schedule_next'    → última atividade foi registrada mas não há próxima ação
 *  - null               → deal está em dia ou em estado terminal (won/lost arquivado)
 *
 * As regras espelham a lógica `inferForcedStep` do projeto Enermac, adaptadas
 * aos campos shortcut presentes em `deals` (mantidos pelo trigger
 * `sync_deal_next_action`).
 */

export type ForcedStep = 'resolve_overdue' | 'register_outcome' | 'schedule_next' | null;

export interface DealActivityShortcuts {
  status?: string | null;
  lostSubstage?: string | null;
  nextActionAt?: string | Date | null;
  lastActivityAt?: string | Date | null;
}

const toDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export function inferForcedStep(
  deal: DealActivityShortcuts,
  now: Date = new Date(),
): ForcedStep {
  const status = deal.status ?? 'open';
  const next = toDate(deal.nextActionAt);
  const last = toDate(deal.lastActivityAt);

  // Arquivado nunca bloqueia
  if (status === 'lost' && deal.lostSubstage === 'arquivado') return null;

  // Ganho/perdido sem atividade futura: sem bloqueio
  if ((status === 'won' || status === 'lost') && !next) return null;

  // Atividade vencida sem resolução posterior
  if (next && next.getTime() < now.getTime()) {
    if (!last || last.getTime() < next.getTime()) return 'resolve_overdue';
  }

  // Sem nada registrado
  if (!last && !next) return 'register_outcome';

  // Tem registro mas falta próxima ação
  if (last && !next) return 'schedule_next';

  return null;
}

export const FORCED_STEP_LABELS: Record<Exclude<ForcedStep, null>, { title: string; description: string; cta: string }> = {
  resolve_overdue: {
    title: 'Atividade vencida',
    description: 'Registre o resultado do atendimento para liberar este negócio.',
    cta: 'Registrar resultado',
  },
  register_outcome: {
    title: 'Sem registro de atendimento',
    description: 'Este negócio ainda não tem nenhum atendimento registrado.',
    cta: 'Registrar atendimento',
  },
  schedule_next: {
    title: 'Sem próxima ação',
    description: 'Defina a próxima ação para manter o follow-up.',
    cta: 'Agendar próxima',
  },
};
