/**
 * Sprint 17 — cálculo de cascata de overrides multi-escopo.
 *
 * Quando o admin edita um override em escopo `funnel` ou `org`, precisa
 * saber **quantas etapas físicas** serão afetadas pela camada (stage /
 * overlay) antes de salvar. A função abaixo é PURA — recebe a lista de
 * `physicalStages` do snapshot do runtime + o escopo escolhido e devolve
 * um resumo com contagem e lista (limitada) de etapas impactadas.
 *
 * Regra de cascata (alinhada ao composer):
 *  - scope `org`    → afeta TODAS as etapas físicas da organização
 *  - scope `funnel` → afeta apenas etapas onde `physicalStage.funnelId === scopeId`
 *  - scope `stage`  → afeta apenas a etapa cujo scopeId é `${funnelId}::${stageId}`
 *
 * O caller decide se exibe o aviso (geralmente quando affected > 1).
 */

import type { PhysicalStage, PlaybookOverride } from './playbookComposer';

export interface CascadePreview {
  affected: number;
  /** Sample (até `previewLimit`) de etapas atingidas, com nomes resolvidos pelo caller. */
  stages: Array<{ funnelId: string; stageId: string }>;
  truncated: boolean;
}

interface ComputeArgs {
  scopeType: PlaybookOverride['scopeType'];
  /** funnelId quando scopeType='funnel'; `${funnelId}::${stageId}` quando 'stage'; orgId quando 'org' */
  scopeId: string;
  physicalStages: PhysicalStage[];
  previewLimit?: number;
}

export function computeOverrideCascade({
  scopeType, scopeId, physicalStages, previewLimit = 8,
}: ComputeArgs): CascadePreview {
  let matches: PhysicalStage[];
  if (scopeType === 'org') {
    matches = physicalStages;
  } else if (scopeType === 'funnel') {
    matches = physicalStages.filter(s => s.funnelId === scopeId);
  } else {
    const [funnelId, stageId] = scopeId.split('::');
    matches = physicalStages.filter(s => s.funnelId === funnelId && s.stageId === stageId);
  }
  const sample = matches.slice(0, previewLimit).map(s => ({
    funnelId: s.funnelId, stageId: s.stageId,
  }));
  return {
    affected: matches.length,
    stages: sample,
    truncated: matches.length > sample.length,
  };
}
