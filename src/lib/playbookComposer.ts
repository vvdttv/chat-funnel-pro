/**
 * Motor composicional do playbook efetivo (Sprint 5).
 *
 * Dados de entrada já normalizados (linhas crus do Supabase + tipos do
 * iaBehavior.ts). Saída: um `EffectivePlaybook` pronto pra ser renderizado
 * pelo editor 4 colunas, pelo `IADecisionLogsPanel` e — sobretudo — pela
 * edge function que monta o systemPrompt da IA.
 *
 * Filosofia: PURO (nenhuma chamada de rede, nenhum hook). Recebe tudo,
 * devolve tudo. Isso permite reusar o mesmo composer no client (preview do
 * sandbox no `PlaybookFourColumnEditor`) e no servidor (edge function
 * `compose-playbook`).
 *
 * Camadas combinadas, na ordem (do mais genérico ao mais específico):
 *  1. Archetype default playbook (catálogo global)
 *  2. Identity da etapa física (`funnel_stages.purpose` JSON: persona/tone/mission)
 *  3. Stage playbook override (`stage_playbooks` da org, layer = 'stage')
 *  4. Status overlay (`stage_playbooks` kind='overlay' p/ won/lost)
 *  5. LBs aplicáveis = filtro por context_tags ∩ stage.context_tags
 *     E status do deal ∈ applicable_statuses
 */

import type {
  IABehaviorRule, LeadBehavior, FollowUpLadder, HandoffTrigger,
} from '@/data/iaBehavior';

// ----------------------------------------------------------------------------
// Tipos das fontes de dados (já mapeadas para o domínio TS)
// ----------------------------------------------------------------------------

export interface StageArchetype {
  id: string;
  code: string;
  name: string;
  purpose: string;
  defaultPlaybookCode: string | null;
  contextTags: string[];
}

export interface StatusArchetype {
  id: string;
  code: 'open' | 'won' | 'lost';
  name: string;
  defaultOverlayRules: Record<string, unknown>;
}

export interface PhysicalStage {
  funnelId: string;
  stageId: string;
  position: number;
  /** Pode estar vazio se o admin ainda não escolheu arquétipo */
  stageArchetypeId: string | null;
  /** JSON: { persona?: string; tone?: string; mission?: string; identityNotes?: string } */
  identity: StageIdentity;
  /** Tags que descrevem o caráter desta etapa específica (ex.: ['real-estate','negociacao']) */
  contextTags: string[];
}

export interface StageIdentity {
  persona?: string;
  tone?: string;
  mission?: string;
  identityNotes?: string;
}

export interface PlaybookOverride {
  scopeType: 'funnel' | 'stage' | 'org';
  scopeId: string;        // funnelId, `${funnelId}::${stageId}` ou orgId
  layer: 'stage' | 'overlay';
  payload: {
    successCriteria?: string[];
    failureCriteria?: string[];
    expectedBehaviorIds?: string[];
    goal?: string;
    identity?: StageIdentity;
    rulesAdd?: string[];
    rulesRemove?: string[];
  };
}

export interface CatalogPlaybook {
  code: string;
  archetypeId: string | null;
  statusArchetypeId: string | null;
  kind: 'stage' | 'overlay';
  goal: string;
  successCriteria: string[];
  failureCriteria: string[];
  defaultLadderCode: string | null;
  typicalBehaviorCodes: string[];
  identity: StageIdentity;
}

// ----------------------------------------------------------------------------
// Saída do compositor
// ----------------------------------------------------------------------------

export interface EffectivePlaybook {
  /** Persona/tom/missão final (já mesclados arquétipo → identity → overrides) */
  identity: Required<StageIdentity>;
  /** Objetivo declarado da etapa */
  goal: string;
  successCriteria: string[];
  failureCriteria: string[];
  /** LBs efetivamente ativos para este deal (filtrados por contexto + status) */
  expectedBehaviors: LeadBehavior[];
  /** Regras IA universais + de etapa, já filtradas por escopo */
  applicableRules: IABehaviorRule[];
  followUpLadder: FollowUpLadder | null;
  handoffTriggers: HandoffTrigger[];
  /** Origem de cada peça — útil pra debug + log decisional */
  provenance: {
    archetypeCode?: string;
    statusOverlayCode?: string;
    overrideIds: string[];
    contextTags: string[];
    dealStatus: 'open' | 'won' | 'lost';
  };
}

// ----------------------------------------------------------------------------
// Argumentos
// ----------------------------------------------------------------------------

export interface ComposeInput {
  funnelId: string;
  stageId: string;
  dealStatus: 'open' | 'won' | 'lost';
  /** Tags do funil (`funnels.context_tags`) — sempre fazem parte do conjunto */
  funnelContextTags: string[];
  // catálogos / dados crus
  archetypes: StageArchetype[];
  statusArchetypes: StatusArchetype[];
  physicalStages: PhysicalStage[];
  catalogPlaybooks: CatalogPlaybook[];
  overrides: PlaybookOverride[];
  rules: IABehaviorRule[];
  behaviors: LeadBehavior[];
  ladders: FollowUpLadder[];
  triggers: HandoffTrigger[];
}

// ----------------------------------------------------------------------------
// Helpers internos
// ----------------------------------------------------------------------------

const DEFAULT_IDENTITY: Required<StageIdentity> = {
  persona: 'Assistente comercial profissional',
  tone: 'Cordial, direto, sem pressão',
  mission: 'Avançar o lead na jornada respeitando seu ritmo',
  identityNotes: '',
};

const mergeIdentity = (
  base: Required<StageIdentity>,
  patch?: StageIdentity | null,
): Required<StageIdentity> => ({
  persona: patch?.persona?.trim() || base.persona,
  tone: patch?.tone?.trim() || base.tone,
  mission: patch?.mission?.trim() || base.mission,
  identityNotes: patch?.identityNotes?.trim() || base.identityNotes,
});

const intersects = (a: string[], b: string[]): boolean => {
  if (a.includes('*') || b.includes('*')) return true;
  return a.some(x => b.includes(x));
};

const uniq = <T,>(xs: T[]): T[] => Array.from(new Set(xs));

// ----------------------------------------------------------------------------
// Compositor
// ----------------------------------------------------------------------------

export function composeEffectivePlaybook(input: ComposeInput): EffectivePlaybook {
  const physical = input.physicalStages.find(
    s => s.funnelId === input.funnelId && s.stageId === input.stageId,
  );
  const archetype = physical?.stageArchetypeId
    ? input.archetypes.find(a => a.id === physical.stageArchetypeId) ?? null
    : null;
  const statusArch = input.statusArchetypes.find(s => s.code === input.dealStatus) ?? null;

  // Tags efetivas = união { funnel ∪ stage ∪ archetype }
  const contextTags = uniq([
    ...input.funnelContextTags,
    ...(physical?.contextTags ?? []),
    ...(archetype?.contextTags ?? []),
  ]);

  // 1. base do arquétipo (catálogo)
  const archetypePb = archetype?.defaultPlaybookCode
    ? input.catalogPlaybooks.find(p => p.code === archetype.defaultPlaybookCode) ?? null
    : null;

  let identity = mergeIdentity(DEFAULT_IDENTITY, archetypePb?.identity);
  let goal = archetypePb?.goal ?? '';
  let successCriteria = archetypePb?.successCriteria ?? [];
  let failureCriteria = archetypePb?.failureCriteria ?? [];
  let expectedBehaviorCodes = archetypePb?.typicalBehaviorCodes ?? [];
  let ladderCode = archetypePb?.defaultLadderCode ?? null;

  // 2. identity da etapa física (sobrepõe campos preenchidos)
  identity = mergeIdentity(identity, physical?.identity);

  // 3. overrides de stage da org
  const stageScopeId = `${input.funnelId}::${input.stageId}`;
  const stageOverrides = input.overrides.filter(
    o => o.layer === 'stage' &&
         (o.scopeType === 'stage'  ? o.scopeId === stageScopeId :
          o.scopeType === 'funnel' ? o.scopeId === input.funnelId : true),
  );
  const overrideIds: string[] = [];
  for (const ov of stageOverrides) {
    overrideIds.push(`${ov.scopeType}:${ov.scopeId}:stage`);
    if (ov.payload.identity)            identity = mergeIdentity(identity, ov.payload.identity);
    if (ov.payload.goal !== undefined)  goal = ov.payload.goal;
    if (ov.payload.successCriteria)     successCriteria = ov.payload.successCriteria;
    if (ov.payload.failureCriteria)     failureCriteria = ov.payload.failureCriteria;
    if (ov.payload.expectedBehaviorIds) expectedBehaviorCodes = ov.payload.expectedBehaviorIds;
  }

  // 4. status overlay (won/lost)
  let statusOverlayCode: string | undefined;
  if (input.dealStatus !== 'open' && statusArch) {
    const overlayPb = input.catalogPlaybooks.find(
      p => p.kind === 'overlay' && p.statusArchetypeId === statusArch.id,
    );
    if (overlayPb) {
      statusOverlayCode = overlayPb.code;
      identity = mergeIdentity(identity, overlayPb.identity);
      if (overlayPb.goal) goal = overlayPb.goal;
      if (overlayPb.successCriteria.length) successCriteria = uniq([...successCriteria, ...overlayPb.successCriteria]);
      if (overlayPb.failureCriteria.length) failureCriteria = uniq([...failureCriteria, ...overlayPb.failureCriteria]);
      expectedBehaviorCodes = uniq([...expectedBehaviorCodes, ...overlayPb.typicalBehaviorCodes]);
    }
    // overrides de overlay específicos (stage scope, layer overlay)
    const overlayOverrides = input.overrides.filter(
      o => o.layer === 'overlay' &&
           (o.scopeType === 'stage' ? o.scopeId === stageScopeId : o.scopeType === 'funnel' ? o.scopeId === input.funnelId : true),
    );
    for (const ov of overlayOverrides) {
      overrideIds.push(`${ov.scopeType}:${ov.scopeId}:overlay`);
      if (ov.payload.identity) identity = mergeIdentity(identity, ov.payload.identity);
      if (ov.payload.successCriteria) successCriteria = uniq([...successCriteria, ...ov.payload.successCriteria]);
      if (ov.payload.failureCriteria) failureCriteria = uniq([...failureCriteria, ...ov.payload.failureCriteria]);
      if (ov.payload.expectedBehaviorIds) expectedBehaviorCodes = uniq([...expectedBehaviorCodes, ...ov.payload.expectedBehaviorIds]);
    }
  }

  // 5. LBs aplicáveis: explícitos da etapa (expectedBehaviorCodes) UNIÃO LBs do
  // catálogo cujos applicable_context_tags casam com contextTags
  // E cujos applicable_statuses contêm dealStatus.
  const explicit = expectedBehaviorCodes
    .map(code => input.behaviors.find(b => b.id === code))
    .filter((b): b is LeadBehavior => Boolean(b));

  const matchedByContext = input.behaviors.filter(b => {
    const lbTags = b.applicableContextTags && b.applicableContextTags.length
      ? (b.applicableContextTags as string[])
      : ['*'];
    const lbStatuses = b.applicableStatuses && b.applicableStatuses.length
      ? b.applicableStatuses
      : (['open'] as Array<'open' | 'won' | 'lost'>);
    return intersects(lbTags, contextTags) && lbStatuses.includes(input.dealStatus);
  });

  const expectedBehaviors = uniq([
    ...explicit,
    ...matchedByContext.filter(m => !explicit.some(e => e.id === m.id)),
  ]);

  // Regras: universais + as do escopo da stage_id (ex.: 'E1', 'E2'…)
  const applicableRules = input.rules.filter(
    r => r.scope === 'universal' || r.scope === input.stageId,
  );

  const followUpLadder = ladderCode
    ? input.ladders.find(l => l.id === ladderCode) ?? null
    : null;

  // Triggers de handoff aplicáveis a esta etapa (ou universais)
  const handoffTriggers = input.triggers.filter(
    t => t.stage === '*' || t.stage === input.stageId,
  );

  return {
    identity,
    goal,
    successCriteria,
    failureCriteria,
    expectedBehaviors,
    applicableRules,
    followUpLadder,
    handoffTriggers,
    provenance: {
      archetypeCode: archetype?.code,
      statusOverlayCode,
      overrideIds,
      contextTags,
      dealStatus: input.dealStatus,
    },
  };
}

// ----------------------------------------------------------------------------
// Renderizador → systemPrompt para a IA
// ----------------------------------------------------------------------------

export function renderSystemPrompt(pb: EffectivePlaybook): string {
  const { identity, goal, successCriteria, failureCriteria, expectedBehaviors, applicableRules } = pb;

  const dos    = applicableRules.filter(r => r.kind === 'do');
  const donts  = applicableRules.filter(r => r.kind === 'dont');
  const asks   = applicableRules.filter(r => r.kind === 'ask');
  const noasks = applicableRules.filter(r => r.kind === 'noask');

  const list = (xs: { text?: string; label?: string; defaultReaction?: string; nextStep?: string; id?: string }[]) =>
    xs.length ? xs.map(x => `  - ${x.text ?? x.label ?? ''}`).join('\n') : '  (nenhuma)';

  const lbs = expectedBehaviors.length
    ? expectedBehaviors.map(b =>
        `  · [${b.id}] ${b.label}\n      reação padrão: ${b.defaultReaction}\n      próximo passo: ${b.nextStep}`
      ).join('\n')
    : '  (nenhum LB aplicável)';

  return `# IDENTIDADE
Persona: ${identity.persona}
Tom: ${identity.tone}
Missão nesta etapa: ${identity.mission}
${identity.identityNotes ? `Notas: ${identity.identityNotes}\n` : ''}
# OBJETIVO DA ETAPA
${goal || '(não definido)'}

# CRITÉRIOS DE SUCESSO
${successCriteria.length ? successCriteria.map(s => `  ✓ ${s}`).join('\n') : '  (nenhum)'}

# CRITÉRIOS DE FALHA
${failureCriteria.length ? failureCriteria.map(s => `  ✗ ${s}`).join('\n') : '  (nenhum)'}

# REGRAS (DO)
${list(dos)}

# REGRAS (DON'T)
${list(donts)}

# PERGUNTAS OBRIGATÓRIAS (ASK)
${list(asks)}

# PERGUNTAS PROIBIDAS (NOASK)
${list(noasks)}

# COMPORTAMENTOS ESPERADOS DO LEAD (LBs ativos)
${lbs}

# CONTEXTO COMPOSICIONAL
arquétipo: ${pb.provenance.archetypeCode ?? '(nenhum)'}
status overlay: ${pb.provenance.statusOverlayCode ?? '(nenhum)'}
context tags: ${pb.provenance.contextTags.join(', ') || '(nenhum)'}
status do deal: ${pb.provenance.dealStatus}
overrides aplicados: ${pb.provenance.overrideIds.join(' | ') || '(nenhum)'}`;
}
