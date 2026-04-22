/**
 * Sprint 20 — Aplicação em lote de várias sugestões selecionadas.
 *
 * Núcleo PURO. Recebe uma lista de `OverrideSuggestion` selecionadas pelo
 * admin e a lista de overrides já existentes, e devolve um *plano de execução*
 * agrupando sugestões pela MESMA chave (scopeType, scopeId, layer) — assim
 * múltiplas sugestões que pisam no mesmo override são fundidas em uma única
 * gravação, evitando snapshots redundantes e race conditions de upsert.
 *
 * Para cada grupo:
 *   - parte do payload existente no banco (se houver)
 *   - aplica `mergeSuggestionPayload` em sequência, na ordem fornecida
 *     (a ordem da UI é severidade desc → failureRate desc, então sugestões
 *     mais críticas entram primeiro e ganham os campos vazios)
 *   - devolve o payload final + ids das sugestões agrupadas + título humano
 *
 * O caller (UI) percorre os planItems, faz upsert + recordSnapshot para cada
 * um, todos com o MESMO `batchId` no campo `note` para que o histórico saiba
 * agrupá-los como uma operação só.
 */

import type { PlaybookOverride } from '@/lib/playbookComposer';
import {
  mergeSuggestionPayload,
  type OverrideSuggestion,
} from '@/lib/playbookOverrideSuggestions';

export interface BatchPlanItem {
  /** Chave canônica do override (scopeType::scopeId::layer). */
  key: string;
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  layer: PlaybookOverride['layer'];
  /** Payload existente no banco (se houver). */
  existingPayload: PlaybookOverride['payload'] | undefined;
  /** Payload final após mesclar todas as sugestões do grupo. */
  mergedPayload: PlaybookOverride['payload'];
  /** Sugestões que contribuíram para este grupo (na ordem aplicada). */
  suggestions: OverrideSuggestion[];
  /** Título humano resumido (1 linha). */
  summaryTitle: string;
}

export interface BatchPlan {
  /** Identificador único do lote — vai no `note` de cada snapshot. */
  batchId: string;
  /** Itens (uma por chave de override). */
  items: BatchPlanItem[];
  /** Total de sugestões originalmente selecionadas. */
  totalSuggestions: number;
  /** Quantas viraram gravações distintas (após agrupamento). */
  totalWrites: number;
}

interface ExistingOverrideLite {
  scopeType: PlaybookOverride['scopeType'];
  scopeId: string;
  layer: PlaybookOverride['layer'];
  payload: PlaybookOverride['payload'];
  isActive: boolean;
}

const keyOf = (
  scopeType: PlaybookOverride['scopeType'],
  scopeId: string,
  layer: PlaybookOverride['layer'],
) => `${scopeType}::${scopeId}::${layer}`;

/**
 * Gera um id legível e único para o lote — aparece no histórico como
 * "lote-XXXXXX (N sugestões)" para o admin reconhecer rapidamente.
 */
export function generateBatchId(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[-:.TZ]/g, '').slice(2, 14); // YYMMDDHHMMSS
  const rand = Math.random().toString(36).slice(2, 6);
  return `batch_${ts}_${rand}`;
}

export interface BuildBatchPlanArgs {
  suggestions: OverrideSuggestion[];
  existingOverrides: ExistingOverrideLite[];
  /** Override do batchId (testes determinísticos). */
  batchId?: string;
}

export function buildBatchPlan({
  suggestions,
  existingOverrides,
  batchId,
}: BuildBatchPlanArgs): BatchPlan {
  const groups = new Map<string, {
    scopeType: PlaybookOverride['scopeType'];
    scopeId: string;
    layer: PlaybookOverride['layer'];
    suggestions: OverrideSuggestion[];
  }>();

  for (const sug of suggestions) {
    const k = keyOf(sug.scope.type, sug.scope.id, sug.layer);
    const g = groups.get(k) ?? {
      scopeType: sug.scope.type,
      scopeId: sug.scope.id,
      layer: sug.layer,
      suggestions: [],
    };
    g.suggestions.push(sug);
    groups.set(k, g);
  }

  const items: BatchPlanItem[] = [];
  for (const [key, g] of groups.entries()) {
    const existing = existingOverrides.find(
      o => o.scopeType === g.scopeType
        && o.scopeId === g.scopeId
        && o.layer === g.layer
        && o.isActive,
    );
    const existingPayload = existing?.payload;
    let merged: PlaybookOverride['payload'] = existingPayload ?? {};
    for (const sug of g.suggestions) {
      merged = mergeSuggestionPayload(merged, sug.payload);
    }
    const summaryTitle = g.suggestions.length === 1
      ? g.suggestions[0].title
      : `${g.suggestions.length} sugestões fundidas neste escopo`;
    items.push({
      key,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
      layer: g.layer,
      existingPayload,
      mergedPayload: merged,
      suggestions: g.suggestions,
      summaryTitle,
    });
  }

  // Ordena os itens por escopo (org → funnel → stage) só para o histórico
  // ficar previsível e legível na UI.
  const SCOPE_ORDER: Record<PlaybookOverride['scopeType'], number> = {
    org: 0, funnel: 1, stage: 2,
  };
  items.sort((a, b) => SCOPE_ORDER[a.scopeType] - SCOPE_ORDER[b.scopeType]);

  return {
    batchId: batchId ?? generateBatchId(),
    items,
    totalSuggestions: suggestions.length,
    totalWrites: items.length,
  };
}

/**
 * Monta a string final do `note` de cada snapshot do lote — o batchId é o
 * elo entre as entradas. O parser inverso (`extractBatchId`) é usado pelo
 * histórico para agrupar visualmente.
 */
export function buildBatchNote(
  batchId: string,
  item: BatchPlanItem,
  totalWrites: number,
): string {
  const sugList = item.suggestions
    .map(s => `${s.kind}:${s.id.split(':').slice(-1)[0]}`)
    .join(', ');
  return `[${batchId}] lote ${totalWrites > 1 ? `(${totalWrites} escopos)` : ''} — ${item.summaryTitle} · ${sugList}`;
}

/**
 * Extrai o batchId de uma `note` existente. Devolve null se a note não
 * pertence a um lote (ex.: aplicação avulsa do Sprint 18).
 */
export function extractBatchId(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = note.match(/^\[(batch_[a-z0-9_]+)\]/i);
  return m ? m[1] : null;
}
