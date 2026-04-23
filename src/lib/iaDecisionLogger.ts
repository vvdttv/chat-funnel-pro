/**
 * Logger composicional (Sprint 6).
 *
 * Recebe um `EffectivePlaybook` (saída do `playbookComposer`) + dados da
 * interação concreta da IA e grava uma linha em `ia_decision_logs` já com
 * todos os campos composicionais (arquétipo, overlay, overrides, context_tags
 * e status do deal). Esses metadados permitem reconstruir EXATAMENTE qual
 * combinação de camadas produziu cada resposta — base para A/B testing,
 * regression e auditoria de viés.
 *
 * Uso típico (após a IA decidir o que fazer):
 *
 * ```ts
 * await logIADecision({
 *   dealId, funnelId, stageId, playbook,
 *   actionTaken: 'enviou pergunta de orçamento',
 *   intent: 'qualificar_orcamento',
 *   tone: 'cordial',
 *   detectedBehaviorCodes: ['LB_INTERESSE_FORTE'],
 *   outcome: 'lead_respondeu',
 * });
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import type { EffectivePlaybook } from './playbookComposer';

export interface LogIADecisionInput {
  organizationId: string;
  dealId?: string | null;
  funnelId?: string | null;
  stageId?: string | null;
  playbook: EffectivePlaybook;
  /** Código(s) do(s) playbook(s) ativo(s) — geralmente o do arquétipo */
  playbookCode?: string | null;
  actionTaken: string;
  intent?: string | null;
  tone?: string | null;
  detectedBehaviorCodes?: string[];
  outcome?: string | null;
  /** Contexto livre — payload analisado pela IA, prompts, etc. */
  context?: Record<string, unknown>;
  /** Sprint 32 — código da skill que efetivamente ativou esta resposta. */
  activatedSkillCode?: string | null;
}

export async function logIADecision(input: LogIADecisionInput): Promise<{ error: string | null }> {
  const {
    organizationId, dealId, funnelId, stageId, playbook, playbookCode,
    actionTaken, intent, tone, detectedBehaviorCodes = [], outcome, context = {},
    activatedSkillCode,
  } = input;

  const appliedRuleCodes = playbook.applicableRules.map(r => r.id);

  const { error } = await supabase.from('ia_decision_logs').insert([{
    organization_id: organizationId,
    deal_id: dealId ?? null,
    funnel_id: funnelId ?? null,
    stage_id: stageId ?? null,
    playbook_code: playbookCode ?? null,
    action_taken: actionTaken,
    intent: intent ?? null,
    tone: tone ?? null,
    detected_behavior_codes: detectedBehaviorCodes,
    applied_rule_codes: appliedRuleCodes,
    outcome: outcome ?? null,
    context: context as never,
    archetype_code: playbook.provenance.archetypeCode ?? null,
    status_overlay_code: playbook.provenance.statusOverlayCode ?? null,
    applied_override_ids: playbook.provenance.overrideIds,
    context_tags: playbook.provenance.contextTags,
    deal_status: playbook.provenance.dealStatus,
    activated_skill_code: activatedSkillCode ?? null,
  }]);

  if (error) {
    console.error('[logIADecision]', error);
    return { error: error.message };
  }
  return { error: null };
}
