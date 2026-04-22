/**
 * Sprint 18 — Auto-sugestão de overrides composicionais.
 *
 * Núcleo PURO de análise dos `ia_decision_logs`. A partir do histórico recente
 * a função `analyzeDecisionLogs` detecta padrões de falha/sucesso e devolve
 * sugestões já no formato que o `PlaybookOverrideEditor` espera (scope + layer
 * + payload). O componente UI apenas renderiza, o admin clica em "aplicar" e
 * o motor de upsert + snapshot do Sprint 17 cuida do resto.
 *
 * Nada de chamadas de rede aqui — facilita testar e reusar em edge functions.
 *
 * Heurísticas (todas configuráveis):
 *
 *  1. **LB problemático por etapa**
 *     Para cada combinação (funnelId, stageId, detectedBehaviorCode), se
 *     `failureRate >= minFailureRateLB` e `sample >= minSampleLB` →
 *     sugere override de tom/notas explicando que o LB merece atenção.
 *
 *  2. **Etapa cronicamente perdida**
 *     Para cada (funnelId, stageId), se `failureRate >= minFailureRateStage`
 *     e `sample >= minSampleStage` → sugere ajustar goal.
 *
 *  3. **Context tag tóxica**
 *     Para cada contextTag, se atravessa várias etapas e tem failureRate
 *     consistentemente alto → sugere override em escopo `funnel` quando todos
 *     os logs vierem do mesmo funil; senão escopo `org`.
 *
 * O `outcome` considerado falha = qualquer um em FAILURE_OUTCOMES (default:
 * 'failure', 'lost'). Sucesso = SUCCESS_OUTCOMES. Demais são neutros.
 */

import type { IADecisionLog } from '@/hooks/useIADecisionLogs';
import type { PlaybookOverride } from '@/lib/playbookComposer';

export const FAILURE_OUTCOMES = new Set(['failure', 'lost']);
export const SUCCESS_OUTCOMES = new Set(['success', 'won']);

export type SuggestionKind = 'lb_problematic' | 'stage_chronic_loss' | 'context_tag_toxic';

export interface OverrideSuggestion {
  /** id determinístico (kind:scopeType:scopeId:layer:hint) — útil pra dedupe */
  id: string;
  kind: SuggestionKind;
  scope: { type: PlaybookOverride['scopeType']; id: string };
  layer: PlaybookOverride['layer'];
  /** Payload pré-preenchido para inserir/mesclar no override */
  payload: PlaybookOverride['payload'];
  /** Texto curto (1 linha) p/ render em listagem */
  title: string;
  /** Explicação humana do porquê foi sugerido */
  rationale: string;
  /** Severidade: 'critical' = ação recomendada com urgência */
  severity: 'critical' | 'warning' | 'info';
  /** Métricas brutas que justificam a sugestão (renderizadas como chips) */
  evidence: {
    sample: number;
    failureRate: number;
    successRate: number;
    /** Códigos extras (ex.: behaviorCode, contextTag) */
    label?: string;
  };
}

export interface AnalyzeOptions {
  minSampleLB?: number;
  minFailureRateLB?: number;
  minSampleStage?: number;
  minFailureRateStage?: number;
  minSampleTag?: number;
  minFailureRateTag?: number;
  /** Limite máximo de sugestões devolvidas (ordenadas por severidade × failureRate × sample). */
  maxSuggestions?: number;
}

const DEFAULTS: Required<AnalyzeOptions> = {
  minSampleLB: 5,
  minFailureRateLB: 0.6,
  minSampleStage: 8,
  minFailureRateStage: 0.5,
  minSampleTag: 10,
  minFailureRateTag: 0.55,
  maxSuggestions: 30,
};

interface Counter {
  total: number;
  fail: number;
  success: number;
}

const newCounter = (): Counter => ({ total: 0, fail: 0, success: 0 });

const tally = (c: Counter, log: IADecisionLog) => {
  c.total += 1;
  if (log.outcome && FAILURE_OUTCOMES.has(log.outcome)) c.fail += 1;
  else if (log.outcome && SUCCESS_OUTCOMES.has(log.outcome)) c.success += 1;
};

const rate = (n: number, d: number): number => (d > 0 ? n / d : 0);

const severityFromRate = (failureRate: number, sample: number): OverrideSuggestion['severity'] => {
  if (failureRate >= 0.8 && sample >= 10) return 'critical';
  if (failureRate >= 0.65) return 'warning';
  return 'info';
};

const SEVERITY_WEIGHT: Record<OverrideSuggestion['severity'], number> = {
  critical: 3, warning: 2, info: 1,
};

export function analyzeDecisionLogs(
  logs: IADecisionLog[],
  options: AnalyzeOptions = {},
): OverrideSuggestion[] {
  const opts = { ...DEFAULTS, ...options };
  const suggestions: OverrideSuggestion[] = [];

  // ---- 1. LB problemático por (funnel, stage, behavior) ----
  const lbCounters = new Map<string, Counter & { funnelId: string; stageId: string; behaviorCode: string }>();
  for (const l of logs) {
    if (!l.funnel_id || !l.stage_id) continue;
    for (const bc of l.detected_behavior_codes) {
      const key = `${l.funnel_id}::${l.stage_id}::${bc}`;
      const c = lbCounters.get(key) ?? {
        ...newCounter(), funnelId: l.funnel_id, stageId: l.stage_id, behaviorCode: bc,
      };
      tally(c, l);
      lbCounters.set(key, c);
    }
  }
  for (const c of lbCounters.values()) {
    const failureRate = rate(c.fail, c.total);
    if (c.total < opts.minSampleLB || failureRate < opts.minFailureRateLB) continue;
    const scopeId = `${c.funnelId}::${c.stageId}`;
    suggestions.push({
      id: `lb_problematic:stage:${scopeId}:stage:${c.behaviorCode}`,
      kind: 'lb_problematic',
      scope: { type: 'stage', id: scopeId },
      layer: 'stage',
      payload: {
        identity: {
          identityNotes: `Atenção: leads exibindo ${c.behaviorCode} fecharam como falha em ${(failureRate * 100).toFixed(0)}% dos casos (n=${c.total}). Reforçar abordagem antes de seguir o roteiro.`,
        },
        expectedBehaviorIds: [c.behaviorCode],
      },
      title: `LB ${c.behaviorCode} sinaliza risco nesta etapa`,
      rationale: `Em ${c.total} decisões nesta etapa onde o comportamento ${c.behaviorCode} foi detectado, ${c.fail} terminaram em falha (${(failureRate * 100).toFixed(0)}%). Vale destacar o LB nas notas internas e ajustar a postura.`,
      severity: severityFromRate(failureRate, c.total),
      evidence: { sample: c.total, failureRate, successRate: rate(c.success, c.total), label: c.behaviorCode },
    });
  }

  // ---- 2. Etapa cronicamente perdedora ----
  const stageCounters = new Map<string, Counter & { funnelId: string; stageId: string }>();
  for (const l of logs) {
    if (!l.funnel_id || !l.stage_id) continue;
    const key = `${l.funnel_id}::${l.stage_id}`;
    const c = stageCounters.get(key) ?? { ...newCounter(), funnelId: l.funnel_id, stageId: l.stage_id };
    tally(c, l);
    stageCounters.set(key, c);
  }
  for (const c of stageCounters.values()) {
    const failureRate = rate(c.fail, c.total);
    if (c.total < opts.minSampleStage || failureRate < opts.minFailureRateStage) continue;
    const scopeId = `${c.funnelId}::${c.stageId}`;
    suggestions.push({
      id: `stage_chronic_loss:stage:${scopeId}:stage`,
      kind: 'stage_chronic_loss',
      scope: { type: 'stage', id: scopeId },
      layer: 'stage',
      payload: {
        goal: `Reverter padrão de perda — esta etapa fechou negativamente em ${(failureRate * 100).toFixed(0)}% das últimas ${c.total} decisões. Priorizar diagnóstico antes do pitch.`,
      },
      title: `Etapa com ${(failureRate * 100).toFixed(0)}% de falha em ${c.total} decisões`,
      rationale: `O playbook atual não está convertendo: ${c.fail}/${c.total} resultaram em ${'failure/lost'}. Reescrever o objetivo da etapa pode ajudar a IA a recalibrar o comportamento.`,
      severity: severityFromRate(failureRate, c.total),
      evidence: { sample: c.total, failureRate, successRate: rate(c.success, c.total) },
    });
  }

  // ---- 3. Context tag tóxica ----
  interface TagCounter extends Counter { funnelIds: Set<string>; }
  const tagCounters = new Map<string, TagCounter>();
  for (const l of logs) {
    for (const tag of l.context_tags) {
      const c = tagCounters.get(tag) ?? { ...newCounter(), funnelIds: new Set<string>() };
      tally(c, l);
      if (l.funnel_id) c.funnelIds.add(l.funnel_id);
      tagCounters.set(tag, c);
    }
  }
  for (const [tag, c] of tagCounters.entries()) {
    const failureRate = rate(c.fail, c.total);
    if (c.total < opts.minSampleTag || failureRate < opts.minFailureRateTag) continue;
    // Se todos os logs com essa tag vieram de UM funil só, sugerimos override de funil;
    // senão aplica em toda a organização.
    const scope: OverrideSuggestion['scope'] = c.funnelIds.size === 1
      ? { type: 'funnel', id: Array.from(c.funnelIds)[0] }
      : { type: 'org', id: 'org' }; // o caller (UI) substitui pelo orgId real
    suggestions.push({
      id: `context_tag_toxic:${scope.type}:${scope.id}:stage:${tag}`,
      kind: 'context_tag_toxic',
      scope,
      layer: 'stage',
      payload: {
        identity: {
          identityNotes: `Contextos com a tag #${tag} apresentaram ${(failureRate * 100).toFixed(0)}% de falha em ${c.total} interações. Adaptar tom e ritmo ao tipo de lead que carrega essa tag.`,
        },
      },
      title: `Tag #${tag} acumulando falhas`,
      rationale: `Em ${c.total} decisões cujo contexto incluía #${tag}, ${c.fail} foram para falha (${(failureRate * 100).toFixed(0)}%). Considerar uma camada extra para esse perfil de lead.`,
      severity: severityFromRate(failureRate, c.total),
      evidence: { sample: c.total, failureRate, successRate: rate(c.success, c.total), label: tag },
    });
  }

  // Ordenação: severidade desc → failureRate desc → sample desc
  suggestions.sort((a, b) => {
    const sw = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (sw !== 0) return sw;
    if (b.evidence.failureRate !== a.evidence.failureRate) return b.evidence.failureRate - a.evidence.failureRate;
    return b.evidence.sample - a.evidence.sample;
  });

  return suggestions.slice(0, opts.maxSuggestions);
}

/**
 * Mescla um payload sugerido sobre um payload existente, preservando o que
 * o admin já tinha customizado. Strings só sobrescrevem se o original for
 * vazio. Arrays viram união (sem duplicatas). Identity faz merge campo a
 * campo com a mesma regra.
 */
export function mergeSuggestionPayload(
  existing: PlaybookOverride['payload'] | undefined,
  suggested: PlaybookOverride['payload'],
): PlaybookOverride['payload'] {
  const base: PlaybookOverride['payload'] = existing ? { ...existing } : {};

  // Strings escalares: só copia se vazio
  if (suggested.goal && !base.goal) base.goal = suggested.goal;

  // Identity: merge por campo
  if (suggested.identity) {
    const id = { ...(base.identity ?? {}) };
    (Object.keys(suggested.identity) as Array<keyof typeof suggested.identity>).forEach(k => {
      const v = suggested.identity?.[k];
      if (v && !id[k]) id[k] = v;
    });
    base.identity = id;
  }

  // Arrays: união sem duplicatas
  const unionArr = (a?: string[], b?: string[]): string[] | undefined => {
    if (!a?.length && !b?.length) return undefined;
    return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  };
  const sc = unionArr(base.successCriteria, suggested.successCriteria);
  if (sc) base.successCriteria = sc;
  const fc = unionArr(base.failureCriteria, suggested.failureCriteria);
  if (fc) base.failureCriteria = fc;
  const eb = unionArr(base.expectedBehaviorIds, suggested.expectedBehaviorIds);
  if (eb) base.expectedBehaviorIds = eb;
  const ra = unionArr(base.rulesAdd, suggested.rulesAdd);
  if (ra) base.rulesAdd = ra;
  const rr = unionArr(base.rulesRemove, suggested.rulesRemove);
  if (rr) base.rulesRemove = rr;

  return base;
}
