import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Critério de pré-qualificação (tabela `stage_qualification_criteria`, Fase 2B).
 * Define, por etapa de funil, o que a IA precisa confirmar na conversa para
 * sugerir o avanço do lead à próxima etapa. Avaliação é conversacional (não
 * questionário) — o `ia-respond-to-lead` lê estes critérios e devolve a
 * sugestão de transição quando os obrigatórios são satisfeitos.
 */
export interface QualificationCriterion {
  id: string;
  funnelId: string;
  stageId: string;
  key: string;
  label: string;
  criterionType: 'boolean' | 'threshold' | 'enum' | 'text' | 'select_single' | 'select_multi';
  owner: 'ia' | 'corretor' | 'ambos';
  config: Record<string, unknown>;
  questionHint: string;
  isRequired: boolean;
  position: number;
  isActive: boolean;
  createdAt: string;
}

type DBCriterionRow = {
  id: string;
  funnel_id: string;
  stage_id: string;
  key: string;
  label: string;
  criterion_type: string;
  owner: string | null;
  config: Record<string, unknown> | null;
  question_hint: string;
  is_required: boolean;
  position: number;
  is_active: boolean;
  created_at: string;
};

function rowToCriterion(row: DBCriterionRow): QualificationCriterion {
  return {
    id: row.id,
    funnelId: row.funnel_id,
    stageId: row.stage_id,
    key: row.key,
    label: row.label,
    criterionType: (row.criterion_type as QualificationCriterion['criterionType']) ?? 'boolean',
    owner: (row.owner as QualificationCriterion['owner']) ?? 'ia',
    config: row.config ?? {},
    questionHint: row.question_hint ?? '',
    isRequired: row.is_required,
    position: row.position ?? 0,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export interface CriterionInput {
  funnelId: string;
  stageId: string;
  key: string;
  label: string;
  criterionType?: QualificationCriterion['criterionType'];
  owner?: QualificationCriterion['owner'];
  config?: Record<string, unknown>;
  questionHint?: string;
  isRequired?: boolean;
  isActive?: boolean;
}

const toDBPatch = (input: Partial<CriterionInput>) => ({
  ...(input.funnelId !== undefined ? { funnel_id: input.funnelId } : {}),
  ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}),
  ...(input.key !== undefined ? { key: input.key } : {}),
  ...(input.label !== undefined ? { label: input.label } : {}),
  ...(input.criterionType !== undefined ? { criterion_type: input.criterionType } : {}),
  ...(input.owner !== undefined ? { owner: input.owner } : {}),
  ...(input.config !== undefined ? { config: input.config } : {}),
  ...(input.questionHint !== undefined ? { question_hint: input.questionHint } : {}),
  ...(input.isRequired !== undefined ? { is_required: input.isRequired } : {}),
  ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
});

/**
 * Carrega os critérios de qualificação da organização (RLS filtra) e mantém
 * via realtime. Espelha o padrão de `usePersonas`/`useWhatsappNumbers`.
 */
export function useQualificationCriteria() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [criteria, setCriteria] = useState<QualificationCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setCriteria([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('stage_qualification_criteria')
        .select('*')
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setCriteria((data || []).map(r => rowToCriterion(r as DBCriterionRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`stage-qualification-criteria-org-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_qualification_criteria' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as DBCriterionRow;
            setCriteria(prev => prev.some(c => c.id === row.id) ? prev : [...prev, rowToCriterion(row)]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as DBCriterionRow;
            setCriteria(prev => prev.map(c => c.id === row.id ? rowToCriterion(row) : c));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as { id?: string };
            if (row?.id) setCriteria(prev => prev.filter(c => c.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const addCriterion = useCallback(async (input: CriterionInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const sameStage = criteria.filter(c => c.funnelId === input.funnelId && c.stageId === input.stageId);
    const { error } = await supabase.from('stage_qualification_criteria').insert({
      organization_id: orgId,
      position: sameStage.length,
      ...toDBPatch(input),
    });
    if (error) { console.error('[useQualificationCriteria] erro ao criar critério', error); return { error: error.message }; }
    return {};
  }, [orgId, criteria]);

  const updateCriterion = useCallback(async (id: string, input: Partial<CriterionInput>) => {
    const { error } = await supabase.from('stage_qualification_criteria').update(toDBPatch(input)).eq('id', id);
    if (error) { console.error('[useQualificationCriteria] erro ao atualizar critério', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteCriterion = useCallback(async (id: string) => {
    const { error } = await supabase.from('stage_qualification_criteria').delete().eq('id', id);
    if (error) { console.error('[useQualificationCriteria] erro ao deletar critério', error); return { error: error.message }; }
    return {};
  }, []);

  return { criteria, loading, error, addCriterion, updateCriterion, deleteCriterion };
}

// ========== Contexto global (estado compartilhado) ==========

const QualificationCriteriaContext = createContext<ReturnType<typeof useQualificationCriteria> | null>(null);

export function QualificationCriteriaProvider({ children }: { children: React.ReactNode }) {
  const value = useQualificationCriteria();
  return <QualificationCriteriaContext.Provider value={value}>{children}</QualificationCriteriaContext.Provider>;
}

export function useQualificationCriteriaContext() {
  const ctx = useContext(QualificationCriteriaContext);
  if (!ctx) throw new Error('useQualificationCriteriaContext deve ser usado dentro de QualificationCriteriaProvider');
  return ctx;
}
