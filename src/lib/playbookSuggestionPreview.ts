/**
 * Sprint 19 — Preview composicional do efeito de uma sugestão antes de aplicar.
 *
 * Núcleo PURO. Recebe:
 *   - snapshot do runtime (catálogos + overrides já carregados)
 *   - sugestão (`OverrideSuggestion`)
 * e devolve:
 *   - playbook efetivo ANTES (estado atual do banco)
 *   - playbook efetivo DEPOIS (com a sugestão mesclada via mergeSuggestionPayload)
 *   - diff do payload do override (existente vs. mesclado) para chips visuais
 *   - lista das (funnelId, stageId) que serão afetadas (pode ser >1 quando
 *     o escopo é funnel ou org — reusa a mesma lógica do Sprint 17 sem
 *     reimportar para manter o módulo standalone).
 *
 * O componente UI apenas chama `buildSuggestionPreview` e renderiza.
 *
 * Importante: NÃO grava nada no banco, NÃO altera o snapshot — clona os
 * overrides em memória e refaz o composeEffectivePlaybook para cada par
 * (funnel, stage) afetado, escolhendo um "representative" para exibir
 * lado-a-lado quando o escopo é macro.
 */

import {
  composeEffectivePlaybook,
  type EffectivePlaybook,
  type PlaybookOverride,
} from '@/lib/playbookComposer';
import { buildPayloadDiff, type DiffEntry } from '@/lib/playbookOverrideDiff';
import {
  mergeSuggestionPayload,
  type OverrideSuggestion,
} from '@/lib/playbookOverrideSuggestions';
import type { RuntimeSnapshot } from '@/hooks/usePlaybookRuntime';

export interface AffectedStageRef {
  funnelId: string;
  stageId: string;
}

export interface SuggestionPreview {
  /** Override que existe hoje (se houver) com o mesmo (scopeType, scopeId, layer). */
  existingPayload: PlaybookOverride['payload'] | undefined;
  /** Resultado de mergeSuggestionPayload(existingPayload, sug.payload). */
  mergedPayload: PlaybookOverride['payload'];
  /** Diff entre existing e merged — alimenta chips de "added/removed/changed". */
  payloadDiff: DiffEntry[];
  /** (funnel, stage) representativo usado para o composeEffectivePlaybook. */
  representative: AffectedStageRef | null;
  /** Playbook composto com o estado atual do banco. */
  before: EffectivePlaybook | null;
  /** Playbook composto após aplicar a sugestão (somente em memória). */
  after: EffectivePlaybook | null;
  /** Total de (funnel, stage) impactados pela aplicação. */
  affectedCount: number;
  /** Lista completa dos pares afetados (útil pra "ver todos"). */
  affected: AffectedStageRef[];
}

/**
 * Decide quais (funnel, stage) são afetados pela sugestão dado o snapshot
 * (mesma lógica usada em playbookOverrideCascade, replicada aqui para evitar
 * dependência circular e manter o módulo focado).
 */
export function listAffectedStages(
  scope: OverrideSuggestion['scope'],
  physicalStages: RuntimeSnapshot['physicalStages'],
): AffectedStageRef[] {
  if (scope.type === 'org') {
    return physicalStages.map(p => ({ funnelId: p.funnelId, stageId: p.stageId }));
  }
  if (scope.type === 'funnel') {
    return physicalStages
      .filter(p => p.funnelId === scope.id)
      .map(p => ({ funnelId: p.funnelId, stageId: p.stageId }));
  }
  // stage scope: scopeId é "funnelId::stageId"
  const [funnelId, stageId] = scope.id.split('::');
  if (!funnelId || !stageId) return [];
  return [{ funnelId, stageId }];
}

/**
 * Escolhe o (funnel, stage) representativo para preview lado-a-lado.
 * Para escopo `stage`, é o próprio. Para macro, escolhe o primeiro afetado
 * em ordem de posição (funnel.position + stage.position) — o snapshot já
 * vem ordenado pelo banco.
 */
const pickRepresentative = (
  affected: AffectedStageRef[],
): AffectedStageRef | null => affected[0] ?? null;

export interface BuildPreviewArgs {
  suggestion: OverrideSuggestion;
  snapshot: RuntimeSnapshot;
  /** Status do deal usado no compose (default 'open'). */
  dealStatus?: 'open' | 'won' | 'lost';
}

export function buildSuggestionPreview({
  suggestion,
  snapshot,
  dealStatus = 'open',
}: BuildPreviewArgs): SuggestionPreview {
  const affected = listAffectedStages(suggestion.scope, snapshot.physicalStages);
  const representative = pickRepresentative(affected);

  // Localiza override pré-existente com a MESMA chave (scope + layer).
  const existing = snapshot.overrides.find(
    o => o.scopeType === suggestion.scope.type
      && o.scopeId === suggestion.scope.id
      && o.layer === suggestion.layer,
  );
  const existingPayload = existing?.payload;
  const mergedPayload = mergeSuggestionPayload(existingPayload, suggestion.payload);
  const payloadDiff = buildPayloadDiff(existingPayload, mergedPayload);

  if (!representative) {
    return {
      existingPayload, mergedPayload, payloadDiff,
      representative: null, before: null, after: null,
      affectedCount: 0, affected,
    };
  }

  const funnelContextTags = snapshot.funnelContextTagsById[representative.funnelId] ?? [];

  // Compose com overrides ATUAIS (sem alteração).
  const before = composeEffectivePlaybook({
    funnelId: representative.funnelId,
    stageId: representative.stageId,
    dealStatus,
    funnelContextTags,
    archetypes: snapshot.archetypes,
    statusArchetypes: snapshot.statusArchetypes,
    physicalStages: snapshot.physicalStages,
    catalogPlaybooks: snapshot.catalogPlaybooks,
    overrides: snapshot.overrides,
    rules: snapshot.rules,
    behaviors: snapshot.behaviors,
    ladders: snapshot.ladders,
    triggers: snapshot.triggers,
  });

  // Clona overrides substituindo o existente (ou inserindo o novo) com o
  // payload mesclado. Não muta o snapshot.
  const nextOverride: PlaybookOverride = {
    scopeType: suggestion.scope.type,
    scopeId: suggestion.scope.id,
    layer: suggestion.layer,
    payload: mergedPayload,
  };
  const overridesAfter: PlaybookOverride[] = existing
    ? snapshot.overrides.map(o =>
        o.scopeType === existing.scopeType
        && o.scopeId === existing.scopeId
        && o.layer === existing.layer
          ? nextOverride
          : o,
      )
    : [...snapshot.overrides, nextOverride];

  const after = composeEffectivePlaybook({
    funnelId: representative.funnelId,
    stageId: representative.stageId,
    dealStatus,
    funnelContextTags,
    archetypes: snapshot.archetypes,
    statusArchetypes: snapshot.statusArchetypes,
    physicalStages: snapshot.physicalStages,
    catalogPlaybooks: snapshot.catalogPlaybooks,
    overrides: overridesAfter,
    rules: snapshot.rules,
    behaviors: snapshot.behaviors,
    ladders: snapshot.ladders,
    triggers: snapshot.triggers,
  });

  return {
    existingPayload,
    mergedPayload,
    payloadDiff,
    representative,
    before,
    after,
    affectedCount: affected.length,
    affected,
  };
}

// ----------------------------------------------------------------------------
// Diff de campos do EffectivePlaybook (para o painel lado-a-lado).
// ----------------------------------------------------------------------------

export type EffectiveFieldKind = 'identity.persona' | 'identity.tone' | 'identity.mission'
  | 'identity.identityNotes' | 'goal' | 'successCriteria' | 'failureCriteria'
  | 'expectedBehaviors';

export interface EffectiveFieldDiff {
  field: EffectiveFieldKind;
  changed: boolean;
  before: string | string[];
  after: string | string[];
}

const sameArr = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function buildEffectiveDiff(
  before: EffectivePlaybook | null,
  after: EffectivePlaybook | null,
): EffectiveFieldDiff[] {
  if (!before || !after) return [];
  const out: EffectiveFieldDiff[] = [];

  const scalar = (field: EffectiveFieldKind, b: string, a: string) => {
    out.push({ field, changed: b !== a, before: b, after: a });
  };
  scalar('identity.persona', before.identity.persona, after.identity.persona);
  scalar('identity.tone', before.identity.tone, after.identity.tone);
  scalar('identity.mission', before.identity.mission, after.identity.mission);
  scalar('identity.identityNotes', before.identity.identityNotes, after.identity.identityNotes);
  scalar('goal', before.goal, after.goal);

  const arr = (field: EffectiveFieldKind, b: string[], a: string[]) => {
    out.push({ field, changed: !sameArr(b, a), before: b, after: a });
  };
  arr('successCriteria', before.successCriteria, after.successCriteria);
  arr('failureCriteria', before.failureCriteria, after.failureCriteria);
  arr(
    'expectedBehaviors',
    before.expectedBehaviors.map(b => b.id),
    after.expectedBehaviors.map(b => b.id),
  );

  return out;
}
