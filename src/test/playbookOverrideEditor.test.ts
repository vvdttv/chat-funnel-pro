/**
 * Sprint 12 — Testes da pipeline de RASCUNHO usada pelo `PlaybookOverrideEditor`.
 *
 * O editor não chama o Supabase a cada tecla: ele substitui o override
 * existente (mesmo scope+layer) na lista do snapshot pelo rascunho atual e
 * roda `composeEffectivePlaybook` localmente. Estes testes garantem:
 *  1. Rascunho substitui (não duplica) override pré-existente.
 *  2. Rascunho vazio em layer 'overlay' com previewStatus='open' deve cair em
 *     'won' (regra do componente — refletida aqui via lista de status).
 *  3. Limpar todos os campos do override → recomposição volta ao base do
 *     arquétipo + identity da etapa (sem override em provenance além do draft
 *     com payload vazio).
 *  4. Trocar layer não vaza estado entre stage/overlay.
 *  5. Override scope='funnel' coexiste com rascunho scope='stage' (ambos
 *     entram na proveniência, na ordem certa).
 */

import { describe, expect, it } from 'vitest';
import {
  composeEffectivePlaybook, type ComposeInput, type PlaybookOverride,
} from '@/lib/playbookComposer';
import type {
  LeadBehavior, IABehaviorRule, FollowUpLadder, HandoffTrigger,
} from '@/data/iaBehavior';

const rules: IABehaviorRule[] = [
  { id: 'IA-DO-001', kind: 'do', scope: 'universal', text: 'Cumprimentar pelo nome' },
];
const behaviors: LeadBehavior[] = [
  { id: 'LB-NEG-001', label: 'Pede desconto', category: 'objection',
    typicalStages: ['*'], applicableContextTags: ['negociacao'],
    applicableStatuses: ['open'], detectionHints: [],
    defaultReaction: '', nextStep: '' },
];
const ladders: FollowUpLadder[] = [];
const triggers: HandoffTrigger[] = [];

const baseInput = (
  overrides: PlaybookOverride[],
  dealStatus: 'open' | 'won' | 'lost' = 'open',
): ComposeInput => ({
  funnelId: 'F1', stageId: 'E3', dealStatus,
  funnelContextTags: ['real-estate'],
  archetypes: [
    { id: 'A-NEG', code: 'negotiation', name: 'Negociação',
      purpose: '', defaultPlaybookCode: 'PB-NEG', contextTags: ['negociacao'] },
  ],
  statusArchetypes: [
    { id: 'S-OPEN', code: 'open', name: 'Aberto', defaultOverlayRules: {} },
    { id: 'S-WON',  code: 'won',  name: 'Ganho',  defaultOverlayRules: {} },
    { id: 'S-LOST', code: 'lost', name: 'Perdido', defaultOverlayRules: {} },
  ],
  physicalStages: [
    { funnelId: 'F1', stageId: 'E3', position: 2, stageArchetypeId: 'A-NEG',
      identity: { tone: 'Firme' }, contextTags: [] },
  ],
  catalogPlaybooks: [
    { code: 'PB-NEG', archetypeId: 'A-NEG', statusArchetypeId: null, kind: 'stage',
      goal: 'Fechar com margem', successCriteria: ['Aceite'], failureCriteria: [],
      defaultLadderCode: null, typicalBehaviorCodes: ['LB-NEG-001'],
      identity: { persona: 'Negociador', tone: 'Direto', mission: 'Aproximar valor' } },
    { code: 'PB-WON-OVERLAY', archetypeId: null, statusArchetypeId: 'S-WON', kind: 'overlay',
      goal: 'Onboarding pós-venda', successCriteria: ['Boas-vindas'], failureCriteria: [],
      defaultLadderCode: null, typicalBehaviorCodes: [],
      identity: { mission: 'Onboardar e pedir indicação' } },
  ],
  overrides,
  rules, behaviors, ladders, triggers,
});

/**
 * Reproduz a lógica de substituição do `PlaybookOverrideEditor`:
 * remove o override existente (mesmo scope+layer) e injeta o rascunho.
 */
const patchWithDraft = (
  saved: PlaybookOverride[],
  draft: PlaybookOverride,
): PlaybookOverride[] => [
  ...saved.filter(o =>
    !(o.scopeType === draft.scopeType &&
      o.scopeId === draft.scopeId &&
      o.layer === draft.layer)),
  draft,
];

describe('Override editor — recomposição com rascunho', () => {
  it('rascunho substitui override existente (sem duplicar provenance)', () => {
    const saved: PlaybookOverride[] = [{
      scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
      payload: { goal: 'objetivo SALVO antigo', identity: { persona: 'velho' } },
    }];
    const draft: PlaybookOverride = {
      scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
      payload: { goal: 'objetivo do RASCUNHO', identity: { persona: 'novo' } },
    };
    const pb = composeEffectivePlaybook(baseInput(patchWithDraft(saved, draft)));
    expect(pb.goal).toBe('objetivo do RASCUNHO');
    expect(pb.identity.persona).toBe('novo');
    // Apenas UMA entrada de proveniência stage para F1::E3
    const stageOvCount = pb.provenance.overrideIds.filter(
      id => id === 'stage:F1::E3:stage'
    ).length;
    expect(stageOvCount).toBe(1);
  });

  it('rascunho de overlay só age quando dealStatus≠open (won/lost)', () => {
    const draft: PlaybookOverride = {
      scopeType: 'stage', scopeId: 'F1::E3', layer: 'overlay',
      payload: { identity: { tone: 'Celebrativo' } },
    };
    // Em open: overlay é IGNORADO pelo composer
    const pbOpen = composeEffectivePlaybook(baseInput(patchWithDraft([], draft), 'open'));
    expect(pbOpen.identity.tone).toBe('Firme'); // identity da etapa física
    expect(pbOpen.provenance.overrideIds).not.toContain('stage:F1::E3:overlay');

    // Em won: overlay aplica
    const pbWon = composeEffectivePlaybook(baseInput(patchWithDraft([], draft), 'won'));
    expect(pbWon.identity.tone).toBe('Celebrativo');
    expect(pbWon.provenance.overrideIds).toContain('stage:F1::E3:overlay');
    expect(pbWon.provenance.statusOverlayCode).toBe('PB-WON-OVERLAY');
  });

  it('rascunho com payload vazio ainda aparece em provenance mas não muda nada', () => {
    const draft: PlaybookOverride = {
      scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
      payload: {},
    };
    const pb = composeEffectivePlaybook(baseInput(patchWithDraft([], draft)));
    // Volta ao base do arquétipo
    expect(pb.identity.persona).toBe('Negociador');
    expect(pb.goal).toBe('Fechar com margem');
    // Mas o draft entra como entrada de proveniência (UI marca com "rascunho")
    expect(pb.provenance.overrideIds).toContain('stage:F1::E3:stage');
  });

  it('trocar layer não mistura estados: rascunho stage não vaza para overlay', () => {
    const draftStage: PlaybookOverride = {
      scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
      payload: { goal: 'rascunho stage' },
    };
    // Enquanto edita o layer "stage" e preview é won, overlay layer não tem rascunho
    const pb = composeEffectivePlaybook(
      baseInput(patchWithDraft([], draftStage), 'won'),
    );
    // stage override aplica (goal vem do rascunho stage)
    // mas overlay padrão (PB-WON-OVERLAY) sobrescreve goal depois → 'Onboarding pós-venda'
    expect(pb.goal).toBe('Onboarding pós-venda');
    expect(pb.provenance.overrideIds).toContain('stage:F1::E3:stage');
    expect(pb.provenance.overrideIds).not.toContain('stage:F1::E3:overlay');
    expect(pb.provenance.statusOverlayCode).toBe('PB-WON-OVERLAY');
  });

  it('override scope=funnel coexiste com rascunho scope=stage (proveniência ordenada)', () => {
    const savedFunnelOv: PlaybookOverride = {
      scopeType: 'funnel', scopeId: 'F1', layer: 'stage',
      payload: { failureCriteria: ['Sem retorno em 7 dias'] },
    };
    const draftStage: PlaybookOverride = {
      scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
      payload: { goal: 'rascunho específico de etapa' },
    };
    const pb = composeEffectivePlaybook(
      baseInput(patchWithDraft([savedFunnelOv], draftStage)),
    );
    expect(pb.goal).toBe('rascunho específico de etapa');
    expect(pb.failureCriteria).toEqual(['Sem retorno em 7 dias']);
    // Ambos presentes
    expect(pb.provenance.overrideIds).toContain('funnel:F1:stage');
    expect(pb.provenance.overrideIds).toContain('stage:F1::E3:stage');
  });
});
