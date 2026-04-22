/**
 * Sprint 23 — Mede a efetividade de sugestões aplicadas.
 *
 * Núcleo PURO. Para cada snapshot do tipo "auto-sugestão" (note começando
 * com 'auto-sugestão' ou contendo um batchId) compara o `failureRate`
 * dos `ia_decision_logs` para o mesmo escopo nos N dias ANTES vs DEPOIS
 * do snapshot, devolvendo o delta.
 *
 * Aplicada principalmente no painel de sugestões (UI):
 *   - delta < 0 (queda de falha) → sucesso (verde, ▼)
 *   - delta > 0 (aumento de falha) → atenção/reverter (vermelho, ▲)
 *   - amostra insuficiente em qualquer lado → 'inconclusive'
 */

import type { IADecisionLog } from '@/hooks/useIADecisionLogs';
import type { OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';
import type { PlaybookOverride } from '@/lib/playbookComposer';
import { extractBatchId } from '@/lib/playbookSuggestionBatch';

// Os outcomes considerados falha/sucesso vivem no módulo de sugestões;
// re-declaramos aqui para evitar dependência circular.
const FAILURE_OUTCOMES = new Set(['failure', 'lost', 'abandoned', 'fallback']);
const SUCCESS_OUTCOMES = new Set(['success', 'won', 'advanced']);

export interface EffectivenessResult {
  snapshotId: string;
  appliedAt: string;
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  /** Identificador do lote (se foi parte de um); null para aplicação avulsa. */
  batchId: string | null;
  before: { sample: number; failureRate: number; successRate: number };
  after: { sample: number; failureRate: number; successRate: number };
  /** Delta de failureRate: after - before. Negativo = melhora. */
  failureRateDelta: number;
  status: 'improved' | 'worsened' | 'neutral' | 'inconclusive';
  /** Texto curto pronto para chip ('▼ 18pp falha' / '▲ 5pp falha' / 'sem dados'). */
  label: string;
}

export interface EffectivenessOptions {
  /** Janela em dias para amostra antes/depois (default 14). */
  windowDays?: number;
  /** Mínimo de logs em CADA lado para devolver veredicto (default 5). */
  minSamplePerSide?: number;
  /** Threshold absoluto para considerar mudança não 'neutral' (default 0.05 = 5pp). */
  neutralThreshold?: number;
}

const DEFAULTS: Required<EffectivenessOptions> = {
  windowDays: 14,
  minSamplePerSide: 5,
  neutralThreshold: 0.05,
};

interface Bucket { sample: number; fail: number; success: number; }
const newBucket = (): Bucket => ({ sample: 0, fail: 0, success: 0 });

const tally = (b: Bucket, log: IADecisionLog) => {
  b.sample += 1;
  if (log.outcome && FAILURE_OUTCOMES.has(log.outcome)) b.fail += 1;
  else if (log.outcome && SUCCESS_OUTCOMES.has(log.outcome)) b.success += 1;
};

const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);

const matchesScope = (
  log: IADecisionLog,
  scopeType: PlaybookOverride['scopeType'],
  scopeId: string,
): boolean => {
  if (scopeType === 'org') return true;
  if (scopeType === 'funnel') return log.funnel_id === scopeId;
  const [funnelId, stageId] = scopeId.split('::');
  return log.funnel_id === funnelId && log.stage_id === stageId;
};

/** Detecta se o snapshot foi gerado por uma auto-sugestão (avulsa ou em lote). */
export function isSuggestionSnapshot(s: OverrideSnapshot): boolean {
  if (!s.note) return false;
  if (extractBatchId(s.note)) return true;
  return /auto-sugest[aã]o/i.test(s.note);
}

export function evaluateSnapshotEffectiveness(
  snapshot: OverrideSnapshot,
  logs: IADecisionLog[],
  options: EffectivenessOptions = {},
): EffectivenessResult {
  const opts = { ...DEFAULTS, ...options };
  const appliedTs = new Date(snapshot.createdAt).getTime();
  const windowMs = opts.windowDays * 24 * 60 * 60 * 1000;

  const before = newBucket();
  const after = newBucket();
  for (const l of logs) {
    if (!matchesScope(l, snapshot.scopeType, snapshot.scopeId)) continue;
    const ts = new Date(l.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts < appliedTs && ts >= appliedTs - windowMs) tally(before, l);
    else if (ts >= appliedTs && ts <= appliedTs + windowMs) tally(after, l);
  }

  const failBefore = ratio(before.fail, before.sample);
  const failAfter = ratio(after.fail, after.sample);
  const delta = failAfter - failBefore;

  let status: EffectivenessResult['status'];
  let label: string;
  if (before.sample < opts.minSamplePerSide || after.sample < opts.minSamplePerSide) {
    status = 'inconclusive';
    label = 'sem dados';
  } else if (Math.abs(delta) < opts.neutralThreshold) {
    status = 'neutral';
    label = `~ ${Math.round(failAfter * 100)}% falha`;
  } else if (delta < 0) {
    status = 'improved';
    label = `▼ ${Math.abs(Math.round(delta * 100))}pp falha`;
  } else {
    status = 'worsened';
    label = `▲ ${Math.round(delta * 100)}pp falha`;
  }

  return {
    snapshotId: snapshot.id,
    appliedAt: snapshot.createdAt,
    scopeType: snapshot.scopeType,
    scopeId: snapshot.scopeId,
    batchId: extractBatchId(snapshot.note),
    before: {
      sample: before.sample,
      failureRate: failBefore,
      successRate: ratio(before.success, before.sample),
    },
    after: {
      sample: after.sample,
      failureRate: failAfter,
      successRate: ratio(after.success, after.sample),
    },
    failureRateDelta: delta,
    status,
    label,
  };
}

export function evaluateRecentSuggestionEffectiveness(
  snapshots: OverrideSnapshot[],
  logs: IADecisionLog[],
  options: EffectivenessOptions & { lookbackDays?: number } = {},
): EffectivenessResult[] {
  const lookback = options.lookbackDays ?? 30;
  const cutoff = Date.now() - lookback * 24 * 60 * 60 * 1000;
  const eligible = snapshots
    .filter(isSuggestionSnapshot)
    .filter(s => new Date(s.createdAt).getTime() >= cutoff);

  const results = eligible.map(s => evaluateSnapshotEffectiveness(s, logs, options));
  return results.sort((a, b) => Math.abs(b.failureRateDelta) - Math.abs(a.failureRateDelta));
}
