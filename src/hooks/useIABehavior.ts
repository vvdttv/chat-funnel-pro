/**
 * Hooks da camada comportamental da IA — Fase 5.
 *
 * Lê as 5 tabelas (`ia_rules`, `lead_behaviors`, `followup_ladders`,
 * `handoff_triggers`, `stage_playbooks`) do Lovable Cloud, com fallback
 * automático para o seed estático em `src/data/iaBehavior.ts` quando a
 * tabela está vazia (organização ainda não semeada). Expõe também ações
 * de upsert/delete e o gatilho `seedFromDefaults` que invoca a edge function
 * `seed-ia-behavior`.
 *
 * Os retornos preservam o shape dos tipos de domínio do `iaBehavior.ts`
 * para que `StagePlaybookEditor` e `AIWorkflowBuilder` consumam o mesmo
 * formato que já usam hoje.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  IA_UNIVERSAL_RULES, STAGE_SPECIFIC_RULES, LEAD_BEHAVIORS,
  FOLLOWUP_LADDERS, HANDOFF_TRIGGERS, STAGE_PLAYBOOKS,
  type IABehaviorRule, type IARuleKind, type IARuleScope,
  type LeadBehavior, type LeadBehaviorCategory,
  type FollowUpLadder, type HandoffTrigger, type HandoffPriority,
  type StagePlaybook,
} from '@/data/iaBehavior';
import { SKILL_SEEDS } from '@/data/iaSkills';

// ----------------------------------------------------------------------------
// Linhas brutas do banco -> tipos de domínio
// ----------------------------------------------------------------------------

interface RuleRow {
  id: string; code: string; kind: string; scope: string;
  text: string; meta: string | null;
}
interface BehaviorRow {
  id: string; code: string; label: string; category: string;
  typical_stages: unknown; detection_hints: unknown;
  default_reaction: string; next_step: string;
}
interface LadderRow {
  id: string; code: string; name: string; description: string; steps: unknown;
}
interface TriggerRow {
  id: string; code: string; priority: string; label: string;
  stage: string; condition: string; action: string;
}
interface PlaybookRow {
  id: string; code: string; goal: string;
  success_criteria: unknown; failure_criteria: unknown;
  default_ladder_code: string | null; typical_behavior_codes: unknown;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const ruleFromRow = (r: RuleRow): IABehaviorRule => ({
  id: r.code,
  kind: r.kind as IARuleKind,
  scope: r.scope as IARuleScope,
  text: r.text,
  meta: r.meta ?? undefined,
});

const behaviorFromRow = (r: BehaviorRow): LeadBehavior => ({
  id: r.code,
  label: r.label,
  category: r.category as LeadBehaviorCategory,
  typicalStages: asArray<LeadBehavior['typicalStages'][number]>(r.typical_stages),
  detectionHints: asArray<string>(r.detection_hints),
  defaultReaction: r.default_reaction,
  nextStep: r.next_step,
});

const ladderFromRow = (r: LadderRow): FollowUpLadder => ({
  id: r.code,
  name: r.name,
  description: r.description,
  steps: asArray<FollowUpLadder['steps'][number]>(r.steps),
});

const triggerFromRow = (r: TriggerRow): HandoffTrigger => ({
  id: r.code,
  priority: r.priority as HandoffPriority,
  label: r.label,
  stage: r.stage as HandoffTrigger['stage'],
  condition: r.condition,
  action: r.action,
});

const playbookFromRow = (r: PlaybookRow): StagePlaybook => ({
  stageCode: r.code as StagePlaybook['stageCode'],
  goal: r.goal,
  successCriteria: asArray<string>(r.success_criteria),
  failureCriteria: asArray<string>(r.failure_criteria),
  expectedBehaviorIds: asArray<string>(r.typical_behavior_codes),
  stageRuleIds: [],
  advanceTriggers: [],
  archiveTriggers: [],
  handoffTriggerIds: [],
  followUpLadderId: r.default_ladder_code ?? '',
});

// ----------------------------------------------------------------------------
// Hook agregador
// ----------------------------------------------------------------------------

export interface IABehaviorState {
  loading: boolean;
  error: string | null;
  /** True quando carregamos do banco; false quando estamos usando o seed local */
  fromCloud: boolean;
  rules: IABehaviorRule[];
  behaviors: LeadBehavior[];
  ladders: FollowUpLadder[];
  triggers: HandoffTrigger[];
  playbooks: StagePlaybook[];
  refresh: () => Promise<void>;
  seedFromDefaults: (overwrite?: boolean) => Promise<{ ok: boolean; error?: string }>;
}

const FALLBACK_RULES: IABehaviorRule[] = [...IA_UNIVERSAL_RULES, ...STAGE_SPECIFIC_RULES];

export function useIABehavior(): IABehaviorState {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCloud, setFromCloud] = useState(false);
  const [rules, setRules] = useState<IABehaviorRule[]>(FALLBACK_RULES);
  const [behaviors, setBehaviors] = useState<LeadBehavior[]>(LEAD_BEHAVIORS);
  const [ladders, setLadders] = useState<FollowUpLadder[]>(FOLLOWUP_LADDERS);
  const [triggers, setTriggers] = useState<HandoffTrigger[]>(HANDOFF_TRIGGERS);
  const [playbooks, setPlaybooks] = useState<StagePlaybook[]>(STAGE_PLAYBOOKS);

  const fetchAll = useCallback(async () => {
    if (!session) {
      // Sem sessão -> usa seed local (preview público)
      setRules(FALLBACK_RULES);
      setBehaviors(LEAD_BEHAVIORS);
      setLadders(FOLLOWUP_LADDERS);
      setTriggers(HANDOFF_TRIGGERS);
      setPlaybooks(STAGE_PLAYBOOKS);
      setFromCloud(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        supabase.from('ia_rules').select('id,code,kind,scope,text,meta').eq('is_active', true),
        supabase.from('lead_behaviors').select('id,code,label,category,typical_stages,detection_hints,default_reaction,next_step').eq('is_active', true),
        supabase.from('followup_ladders').select('id,code,name,description,steps').eq('is_active', true),
        supabase.from('handoff_triggers').select('id,code,priority,label,stage,condition,action').eq('is_active', true),
        supabase.from('stage_playbooks').select('id,code,goal,success_criteria,failure_criteria,default_ladder_code,typical_behavior_codes').eq('is_active', true),
      ]);

      const firstErr = [r1, r2, r3, r4, r5].find(r => r.error)?.error;
      if (firstErr) throw firstErr;

      const cloudRules = (r1.data ?? []).map(ruleFromRow as (r: any) => IABehaviorRule);
      const cloudBehaviors = (r2.data ?? []).map(behaviorFromRow as (r: any) => LeadBehavior);
      const cloudLadders = (r3.data ?? []).map(ladderFromRow as (r: any) => FollowUpLadder);
      const cloudTriggers = (r4.data ?? []).map(triggerFromRow as (r: any) => HandoffTrigger);
      const cloudPlaybooks = (r5.data ?? []).map(playbookFromRow as (r: any) => StagePlaybook);

      // Se a org ainda não foi semeada, fica com fallback local; caso contrário usa o cloud
      const hasAny =
        cloudRules.length > 0 || cloudBehaviors.length > 0 ||
        cloudLadders.length > 0 || cloudTriggers.length > 0 ||
        cloudPlaybooks.length > 0;

      setFromCloud(hasAny);
      setRules(hasAny ? cloudRules : FALLBACK_RULES);
      setBehaviors(hasAny ? cloudBehaviors : LEAD_BEHAVIORS);
      setLadders(hasAny ? cloudLadders : FOLLOWUP_LADDERS);
      setTriggers(hasAny ? cloudTriggers : HANDOFF_TRIGGERS);
      setPlaybooks(hasAny ? cloudPlaybooks : STAGE_PLAYBOOKS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar comportamento da IA';
      console.error('[useIABehavior]', e);
      setError(msg);
      // Em erro, mantém o seed local para a UI nunca quebrar
      setFromCloud(false);
      setRules(FALLBACK_RULES);
      setBehaviors(LEAD_BEHAVIORS);
      setLadders(FOLLOWUP_LADDERS);
      setTriggers(HANDOFF_TRIGGERS);
      setPlaybooks(STAGE_PLAYBOOKS);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const seedFromDefaults = useCallback(async (overwrite = false) => {
    try {
      const payload = {
        overwrite,
        rules: FALLBACK_RULES,
        behaviors: LEAD_BEHAVIORS,
        ladders: FOLLOWUP_LADDERS,
        triggers: HANDOFF_TRIGGERS,
        playbooks: STAGE_PLAYBOOKS,
        skills: SKILL_SEEDS,
      };
      const { data, error } = await supabase.functions.invoke('seed-ia-behavior', {
        body: payload,
      });
      if (error) return { ok: false, error: error.message };
      if ((data as { error?: string })?.error) {
        return { ok: false, error: (data as { error: string }).error };
      }
      await fetchAll();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Erro inesperado' };
    }
  }, [fetchAll]);

  return useMemo(() => ({
    loading, error, fromCloud,
    rules, behaviors, ladders, triggers, playbooks,
    refresh: fetchAll,
    seedFromDefaults,
  }), [loading, error, fromCloud, rules, behaviors, ladders, triggers, playbooks, fetchAll, seedFromDefaults]);
}

// ----------------------------------------------------------------------------
// Helpers de derivação (substituem getRule/getBehavior do iaBehavior.ts
// quando você já tem o dataset em mãos via hook)
// ----------------------------------------------------------------------------

export function selectRulesByScope(
  rules: IABehaviorRule[],
  scope: IARuleScope,
  kind?: IARuleKind,
): IABehaviorRule[] {
  return rules.filter(r => r.scope === scope && (!kind || r.kind === kind));
}

export function selectRule(rules: IABehaviorRule[], id: string): IABehaviorRule | undefined {
  return rules.find(r => r.id === id);
}

export function selectBehavior(behaviors: LeadBehavior[], id: string): LeadBehavior | undefined {
  return behaviors.find(b => b.id === id);
}

export function selectPlaybook(
  playbooks: StagePlaybook[],
  stageCode: StagePlaybook['stageCode'],
): StagePlaybook | undefined {
  return playbooks.find(p => p.stageCode === stageCode);
}
