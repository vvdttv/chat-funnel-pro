/**
 * Sprint 10 — Testes E2E da pipeline composicional do playbook.
 *
 * Cobre cenários ponta-a-ponta que combinam múltiplas camadas e edge cases:
 *  - cascata completa (arquétipo → identity → override stage → overlay → override overlay)
 *  - status `lost` com overlay específico
 *  - overrides com escopo funil (afetam todas as etapas do funil)
 *  - escolha correta de ladder e handoff triggers
 *  - ausência total de arquétipo (fallback para DEFAULT_IDENTITY)
 *  - LB explícito que NÃO casa contexto/status ainda assim entra (vínculo direto)
 *  - renderSystemPrompt expõe overrides aplicados em CONTEXTO COMPOSICIONAL
 */

import { describe, expect, it } from 'vitest';
import {
  composeEffectivePlaybook, renderSystemPrompt,
  type ComposeInput,
} from '@/lib/playbookComposer';
import type {
  LeadBehavior, IABehaviorRule, FollowUpLadder, HandoffTrigger,
} from '@/data/iaBehavior';

const rules: IABehaviorRule[] = [
  { id: 'IA-DO-001', kind: 'do', scope: 'universal', text: 'Cumprimentar pelo nome' },
  { id: 'IA-DONT-001', kind: 'dont', scope: 'universal', text: 'Não prometer prazo' },
  { id: 'E3-ASK-001', kind: 'ask', scope: 'E3', text: 'Confirmar visita presencial' },
];

const behaviors: LeadBehavior[] = [
  { id: 'LB-NEG-001', label: 'Pede desconto', category: 'objection',
    typicalStages: ['*'], applicableContextTags: ['real-estate','negociacao'],
    applicableStatuses: ['open'], detectionHints: ['desconto'],
    defaultReaction: 'Validar valor com gerente', nextStep: 'Propor contraproposta' },
  { id: 'LB-LOST-001', label: 'Cliente justificou perda', category: 'negative',
    typicalStages: ['*'], applicableContextTags: ['*'],
    applicableStatuses: ['lost'], detectionHints: ['caro','outro'],
    defaultReaction: 'Agradecer feedback', nextStep: 'Adicionar a nutrição' },
  { id: 'LB-EXPLICIT', label: 'Comportamento de catálogo nichado', category: 'neutral',
    typicalStages: ['*'], applicableContextTags: ['nicho-x'],
    applicableStatuses: ['open'], detectionHints: [],
    defaultReaction: '', nextStep: '' },
];

const ladders: FollowUpLadder[] = [
  { id: 'LADDER-NEG', name: 'Escada de negociação', description: '',
    steps: [{ afterHours: 24, tone: 'firme', sampleMessage: 'Confirmar interesse' }] },
];

const triggers: HandoffTrigger[] = [
  { id: 'HT-UNIV', label: 'Lead pede humano', stage: '*',
    condition: 'lead diz "atendente"', action: 'avisar gerente', priority: 'P1' },
  { id: 'HT-E3', label: 'Negociação travada', stage: 'E3',
    condition: '3 idas e voltas sem avanço', action: 'escalar', priority: 'P2' },
  { id: 'HT-OUTRO', label: 'Outro funil', stage: 'E4b',
    condition: 'x', action: 'y', priority: 'P3' },
];

const buildInput = (overrides: Partial<ComposeInput> = {}): ComposeInput => ({
  funnelId: 'F1', stageId: 'E3', dealStatus: 'open',
  funnelContextTags: ['real-estate'],
  archetypes: [
    { id: 'A-NEG', code: 'negotiation', name: 'Negociação', purpose: '',
      defaultPlaybookCode: 'PB-NEG', contextTags: ['negociacao'] },
  ],
  statusArchetypes: [
    { id: 'S-OPEN', code: 'open', name: 'Aberto', defaultOverlayRules: {} },
    { id: 'S-WON',  code: 'won',  name: 'Ganho',  defaultOverlayRules: {} },
    { id: 'S-LOST', code: 'lost', name: 'Perdido', defaultOverlayRules: {} },
  ],
  physicalStages: [
    { funnelId: 'F1', stageId: 'E3', position: 2, stageArchetypeId: 'A-NEG',
      identity: { tone: 'Firme mas empático' }, contextTags: [] },
  ],
  catalogPlaybooks: [
    { code: 'PB-NEG', archetypeId: 'A-NEG', statusArchetypeId: null, kind: 'stage',
      goal: 'Fechar com margem saudável',
      successCriteria: ['Proposta aceita'], failureCriteria: ['Lead recusou 2x'],
      defaultLadderCode: 'LADDER-NEG', typicalBehaviorCodes: ['LB-NEG-001'],
      identity: { persona: 'Negociador sênior', tone: 'Direto', mission: 'Aproximar valor justo' } },
    { code: 'PB-LOST-OVERLAY', archetypeId: null, statusArchetypeId: 'S-LOST', kind: 'overlay',
      goal: 'Aprender com a perda', successCriteria: ['Motivo registrado'], failureCriteria: [],
      defaultLadderCode: null, typicalBehaviorCodes: ['LB-LOST-001'],
      identity: { mission: 'Coletar motivo e nutrir' } },
  ],
  overrides: [],
  rules, behaviors, ladders, triggers,
  ...overrides,
});

describe('Pipeline composicional E2E', () => {
  it('cascata completa: arquétipo → identity stage → override stage → overlay → override overlay', () => {
    const pb = composeEffectivePlaybook(buildInput({
      dealStatus: 'lost',
      overrides: [
        { scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
          payload: { goal: 'Negociar com teto X', identity: { identityNotes: 'limite 5%' } } },
        { scopeType: 'stage', scopeId: 'F1::E3', layer: 'overlay',
          payload: { successCriteria: ['Motivo categorizado'],
                     identity: { tone: 'Acolhedor' } } },
      ],
    }));

    expect(pb.identity.persona).toBe('Negociador sênior');     // arquétipo
    expect(pb.identity.tone).toBe('Acolhedor');                // override overlay (último)
    expect(pb.identity.mission).toBe('Coletar motivo e nutrir');// overlay
    expect(pb.identity.identityNotes).toBe('limite 5%');       // override stage
    expect(pb.successCriteria).toContain('Motivo registrado'); // overlay
    expect(pb.successCriteria).toContain('Motivo categorizado');// override overlay
    expect(pb.provenance.overrideIds).toEqual([
      'stage:F1::E3:stage',
      'stage:F1::E3:overlay',
    ]);
    expect(pb.provenance.statusOverlayCode).toBe('PB-LOST-OVERLAY');
    expect(pb.provenance.dealStatus).toBe('lost');
  });

  it('overlay lost ativa LB de status lost (LBs open são filtrados por status no matched)', () => {
    const pb = composeEffectivePlaybook(buildInput({ dealStatus: 'lost' }));
    const ids = pb.expectedBehaviors.map(b => b.id);
    expect(ids).toContain('LB-LOST-001');     // overlay + status lost
    // LB-NEG-001 é typicalBehaviorCode do PB-NEG (vínculo explícito); o motor
    // mantém vínculos diretos mesmo se o status do LB não casar — assim o
    // catálogo permanece autoridade sobre "comportamentos esperados aqui".
    expect(ids).toContain('LB-NEG-001');
  });

  it('overrides funnel-scoped afetam etapas do funil', () => {
    const pb = composeEffectivePlaybook(buildInput({
      overrides: [{
        scopeType: 'funnel', scopeId: 'F1', layer: 'stage',
        payload: { failureCriteria: ['Sem retorno em 7 dias'] },
      }],
    }));
    expect(pb.failureCriteria).toEqual(['Sem retorno em 7 dias']);
    expect(pb.provenance.overrideIds).toContain('funnel:F1:stage');
  });

  it('seleciona ladder do arquétipo e triggers (universais + da stage)', () => {
    const pb = composeEffectivePlaybook(buildInput());
    expect(pb.followUpLadder?.id).toBe('LADDER-NEG');
    const triggerIds = pb.handoffTriggers.map(t => t.id).sort();
    expect(triggerIds).toEqual(['HT-E3', 'HT-UNIV']);  // 'HT-OUTRO' não entra
  });

  it('etapa sem arquétipo: cai em DEFAULT_IDENTITY', () => {
    const pb = composeEffectivePlaybook(buildInput({
      physicalStages: [{
        funnelId: 'F1', stageId: 'E3', position: 0,
        stageArchetypeId: null, identity: {}, contextTags: [],
      }],
    }));
    expect(pb.identity.persona).toBe('Assistente comercial profissional');
    expect(pb.goal).toBe('');
    expect(pb.provenance.archetypeCode).toBeUndefined();
    expect(pb.provenance.overrideIds).toEqual([]);
  });

  it('LB de override + LB casado por contexto coexistem (união, sem duplicar)', () => {
    // PB-NEG.typicalBehaviorCodes = ['LB-NEG-001'] (casa contexto 'negociacao').
    // Override força ['LB-EXPLICIT'] como explícitos. Resultado esperado:
    // - LB-EXPLICIT entra (explícito, mesmo com tag 'nicho-x' que não casa)
    // - LB-NEG-001 entra via matchedByContext (tag 'negociacao' do arquétipo)
    const pb = composeEffectivePlaybook(buildInput({
      overrides: [{
        scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
        payload: { expectedBehaviorIds: ['LB-EXPLICIT'] },
      }],
    }));
    const ids = pb.expectedBehaviors.map(b => b.id);
    expect(ids).toContain('LB-EXPLICIT');     // explícito força entrada
    expect(ids).toContain('LB-NEG-001');      // matchedByContext via 'negociacao'
    expect(ids.filter(i => i === 'LB-EXPLICIT')).toHaveLength(1); // sem duplicata
  });

  it('renderSystemPrompt expõe override IDs no contexto composicional', () => {
    const pb = composeEffectivePlaybook(buildInput({
      overrides: [{
        scopeType: 'stage', scopeId: 'F1::E3', layer: 'stage',
        payload: { goal: 'X' },
      }],
    }));
    const txt = renderSystemPrompt(pb);
    expect(txt).toContain('overrides aplicados: stage:F1::E3:stage');
    expect(txt).toContain('arquétipo: negotiation');
    expect(txt).toContain('Persona: Negociador sênior');
  });

  it('contextTags consolidam funil + stage + arquétipo (sem duplicatas)', () => {
    const pb = composeEffectivePlaybook(buildInput({
      funnelContextTags: ['real-estate', 'negociacao'],
      physicalStages: [{
        funnelId: 'F1', stageId: 'E3', position: 2,
        stageArchetypeId: 'A-NEG',
        identity: {}, contextTags: ['premium'],
      }],
    }));
    expect(pb.provenance.contextTags.sort()).toEqual(
      ['negociacao', 'premium', 'real-estate'],
    );
  });
});
