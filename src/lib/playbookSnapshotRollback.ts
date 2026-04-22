/**
 * Sprint 21 — Rollback de lote inteiro pelo `batchId`.
 *
 * Núcleo PURO. Recebe a lista completa de snapshots da org (já carregada
 * pelo `usePlaybookOverrideSnapshots`) e um `batchId` e devolve um plano
 * de rollback: para cada (scopeType, scopeId, layer) do lote, encontra o
 * snapshot imediatamente ANTERIOR ao primeiro snapshot do lote para
 * aquele escopo, e propõe restaurar o payload + isActive desse snapshot.
 *
 * Casos de borda tratados:
 *  - Se não existir snapshot anterior, o plano marca o item como
 *    "deactivate" (não havia nada antes — desativar é a melhor reversão).
 *  - Se o último snapshot da chave NÃO for do lote (ou seja, alguém
 *    aplicou algo depois), marcamos `dirty=true` para a UI alertar que o
 *    rollback vai sobrescrever uma mudança posterior.
 *
 * Nada de chamadas de rede aqui — facilita testar e reusar.
 */

import type { OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';
import type { PlaybookOverride } from '@/lib/playbookComposer';
import { extractBatchId } from '@/lib/playbookSuggestionBatch';

export interface RollbackPlanItem {
  /** Chave canônica scopeType::scopeId::layer */
  key: string;
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  layer: PlaybookOverride['layer'];
  /** Último snapshot do lote para essa chave (o estado "atual" a desfazer). */
  batchSnapshot: OverrideSnapshot;
  /** Snapshot ANTERIOR ao lote para essa chave (alvo do rollback). null = nada antes. */
  previousSnapshot: OverrideSnapshot | null;
  /** Payload alvo: payload do previousSnapshot, ou {} quando ausente. */
  targetPayload: PlaybookOverride['payload'];
  /** isActive alvo: previousSnapshot.isActive, ou false quando ausente. */
  targetIsActive: boolean;
  /** Action recomendada: 'rollback' (restaura) ou 'deactivate' (sem prévio). */
  action: 'rollback' | 'deactivate';
  /** Houve mudança posterior ao lote nessa chave? (alerta visual) */
  dirty: boolean;
}

export interface RollbackPlan {
  batchId: string;
  items: RollbackPlanItem[];
  /** Quantas chaves do lote tiveram alguma alteração depois (dirty count). */
  dirtyCount: number;
}

const keyOf = (
  scopeType: PlaybookOverride['scopeType'],
  scopeId: string,
  layer: PlaybookOverride['layer'],
) => `${scopeType}::${scopeId}::${layer}`;

/**
 * Agrupa snapshots por batchId. Útil pro snapshots browser exibir
 * "headers" colapsáveis de lote.
 */
export function groupSnapshotsByBatch(
  snapshots: OverrideSnapshot[],
): Map<string, OverrideSnapshot[]> {
  const groups = new Map<string, OverrideSnapshot[]>();
  for (const s of snapshots) {
    const id = extractBatchId(s.note);
    if (!id) continue;
    const list = groups.get(id) ?? [];
    list.push(s);
    groups.set(id, list);
  }
  return groups;
}

export function buildRollbackPlan(
  allSnapshots: OverrideSnapshot[],
  batchId: string,
): RollbackPlan {
  // Snapshots ordenados do mais antigo ao mais recente — facilita "anterior a"
  const sorted = [...allSnapshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const batchItems = sorted.filter(s => extractBatchId(s.note) === batchId);
  if (batchItems.length === 0) {
    return { batchId, items: [], dirtyCount: 0 };
  }

  const seenKeys = new Set<string>();
  const items: RollbackPlanItem[] = [];

  for (const bs of batchItems) {
    const k = keyOf(bs.scopeType, bs.scopeId, bs.layer);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);

    const sameKey = sorted.filter(
      s => keyOf(s.scopeType, s.scopeId, s.layer) === k,
    );
    const firstOfBatch = sameKey.find(s => extractBatchId(s.note) === batchId)!;
    const lastOfBatch = [...sameKey]
      .reverse()
      .find(s => extractBatchId(s.note) === batchId)!;

    const firstTs = new Date(firstOfBatch.createdAt).getTime();
    const lastTs = new Date(lastOfBatch.createdAt).getTime();

    const previous = [...sameKey]
      .reverse()
      .find(s => new Date(s.createdAt).getTime() < firstTs) ?? null;

    const dirty = sameKey.some(s => new Date(s.createdAt).getTime() > lastTs);

    items.push({
      key: k,
      scopeType: bs.scopeType,
      scopeId: bs.scopeId,
      layer: bs.layer,
      batchSnapshot: lastOfBatch,
      previousSnapshot: previous,
      targetPayload: previous?.payload ?? {},
      targetIsActive: previous?.isActive ?? false,
      action: previous ? 'rollback' : 'deactivate',
      dirty,
    });
  }

  // Ordem estável: org → funnel → stage
  const SCOPE_ORDER: Record<PlaybookOverride['scopeType'], number> = {
    org: 0, funnel: 1, stage: 2,
  };
  items.sort((a, b) => SCOPE_ORDER[a.scopeType] - SCOPE_ORDER[b.scopeType]);

  return {
    batchId,
    items,
    dirtyCount: items.filter(i => i.dirty).length,
  };
}

/**
 * Monta a `note` de cada snapshot gerado pelo rollback.
 * Mantém a referência ao batchId original para auditoria.
 */
export function buildRollbackNote(batchId: string, item: RollbackPlanItem): string {
  const scope = `${item.scopeType}/${item.scopeId}/${item.layer}`;
  const tag = item.action === 'rollback' ? 'restaurado' : 'desativado';
  return `[rollback de ${batchId}] ${scope} · ${tag}${item.dirty ? ' (sobrescreveu mudança posterior)' : ''}`;
}
