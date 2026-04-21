import { describe, expect, it } from 'vitest';
import {
  composeEffectivePlaybook, renderSystemPrompt,
  type ComposeInput,
} from '@/lib/playbookComposer';
import type { LeadBehavior, IABehaviorRule } from '@/data/iaBehavior';

const baseRules: IABehaviorRule[] = [
  { id: 'IA-DO-001', kind: 'do', scope: 'universal', text: 'Sempre cumprimentar pelo nome' },
  { id: 'IA-DONT-001', kind: 'dont', scope: 'universal', text: 'Nunca prometer prazo sem confirmar' },
  { id: 'E1-ASK-001', kind: 'ask', scope: 'E1', text: 'Confirmar bairros desejados', meta: 'bairros' },
  { id: 'E2-DO-001', kind: 'do', scope: 'E2', text: 'Enviar 3 opções de imóveis' },
];

const baseBehaviors: LeadBehavior[] = [
  { id: 'LB-001', label: 'Lead pergunta valor', category: 'positive',
    typicalStages: ['*'], applicableContextTags: ['*'], applicableStatuses: ['open'],
    detectionHints: ['quanto'], defaultReaction: 'Informar faixa', nextStep: 'Pedir orçamento' },
  { id: 'LB-090', label: 'Cliente quer indicar amigos', category: 'positive',
    typicalStages: ['*'], applicableContextTags: ['pos-venda','indicacao'], applicableStatuses: ['won'],
    detectionHints: ['indicar'], defaultReaction: 'Agradecer', nextStep: 'Abrir referral' },
  { id: 'LB-099', label: 'B2B-only behavior', category: 'neutral',
    typicalStages: ['*'], applicableContextTags: ['b2b'], applicableStatuses: ['open'],
    detectionHints: [], defaultReaction: '', nextStep: '' },
];

const buildInput = (overrides: Partial<ComposeInput> = {}): ComposeInput => ({
  funnelId: 'F1', stageId: 'E1', dealStatus: 'open',
  funnelContextTags: ['real-estate'],
  archetypes: [
    { id: 'A1', code: 'first_contact', name: 'Primeiro contato', purpose: '',
      defaultPlaybookCode: 'PB-A1', contextTags: ['real-estate'] },
  ],
  statusArchetypes: [
    { id: 'S-OPEN', code: 'open', name: 'Aberto', defaultOverlayRules: {} },
    { id: 'S-WON',  code: 'won',  name: 'Ganho',  defaultOverlayRules: {} },
  ],
  physicalStages: [
    { funnelId: 'F1', stageId: 'E1', position: 0, stageArchetypeId: 'A1',
      identity: { tone: 'Empolgado' }, contextTags: [] },
  ],
  catalogPlaybooks: [
    { code: 'PB-A1', archetypeId: 'A1', statusArchetypeId: null, kind: 'stage',
      goal: 'Capturar perfil inicial',
      successCriteria: ['Lead engajou'], failureCriteria: ['Lead sumiu'],
      defaultLadderCode: null, typicalBehaviorCodes: ['LB-001'],
      identity: { persona: 'Consultor', tone: 'Cordial', mission: 'Qualificar' } },
    { code: 'PB-WON-OVERLAY', archetypeId: null, statusArchetypeId: 'S-WON', kind: 'overlay',
      goal: 'Pós-venda', successCriteria: ['NPS coletado'], failureCriteria: [],
      defaultLadderCode: null, typicalBehaviorCodes: [],
      identity: { mission: 'Encantar cliente vendido' } },
  ],
  overrides: [],
  rules: baseRules,
  behaviors: baseBehaviors,
  ladders: [], triggers: [],
  ...overrides,
});

describe('playbookComposer', () => {
  it('mescla identity de arquétipo + stage (stage prevalece em campos preenchidos)', () => {
    const pb = composeEffectivePlaybook(buildInput());
    expect(pb.identity.persona).toBe('Consultor');             // do arquétipo
    expect(pb.identity.tone).toBe('Empolgado');                // da etapa física
    expect(pb.identity.mission).toBe('Qualificar');            // do arquétipo
    expect(pb.goal).toBe('Capturar perfil inicial');
  });

  it('inclui apenas LBs cujo contexto e status batem', () => {
    const pb = composeEffectivePlaybook(buildInput());
    const ids = pb.expectedBehaviors.map(b => b.id);
    expect(ids).toContain('LB-001');     // explícito + contexto * + status open
    expect(ids).not.toContain('LB-090'); // só 'won'
    expect(ids).not.toContain('LB-099'); // contexto b2b, deal é real-estate
  });

  it('aplica status overlay quando deal está won', () => {
    const pb = composeEffectivePlaybook(buildInput({ dealStatus: 'won' }));
    expect(pb.provenance.statusOverlayCode).toBe('PB-WON-OVERLAY');
    expect(pb.identity.mission).toBe('Encantar cliente vendido');
    expect(pb.successCriteria).toContain('NPS coletado');
    // adiciona contexto pos-venda? não — só os tags do funil/etapa/arquétipo
    // mas LB-090 deveria entrar somente se tags casassem; aqui não casam
    const ids = pb.expectedBehaviors.map(b => b.id);
    expect(ids).not.toContain('LB-090');
  });

  it('adiciona LB de pós-venda quando funil tem tag pos-venda + status won', () => {
    const pb = composeEffectivePlaybook(buildInput({
      dealStatus: 'won',
      funnelContextTags: ['real-estate', 'pos-venda', 'indicacao'],
    }));
    const ids = pb.expectedBehaviors.map(b => b.id);
    expect(ids).toContain('LB-090');
  });

  it('overrides de stage substituem critérios e fazem merge de identity', () => {
    const pb = composeEffectivePlaybook(buildInput({
      overrides: [{
        scopeType: 'stage', scopeId: 'F1::E1', layer: 'stage',
        payload: {
          successCriteria: ['Reuniu 3 critérios'],
          identity: { mission: 'Capturar 3 critérios em 5 mensagens' },
        },
      }],
    }));
    expect(pb.successCriteria).toEqual(['Reuniu 3 critérios']);
    expect(pb.identity.mission).toBe('Capturar 3 critérios em 5 mensagens');
    expect(pb.provenance.overrideIds).toContain('stage:F1::E1:stage');
  });

  it('filtra regras por escopo (universal + stageId)', () => {
    const pb = composeEffectivePlaybook(buildInput());
    const ids = pb.applicableRules.map(r => r.id);
    expect(ids).toContain('IA-DO-001');     // universal
    expect(ids).toContain('IA-DONT-001');   // universal
    expect(ids).toContain('E1-ASK-001');    // escopo E1
    expect(ids).not.toContain('E2-DO-001'); // escopo E2 → fora
  });

  it('renderSystemPrompt emite seções e contexto composicional', () => {
    const pb = composeEffectivePlaybook(buildInput());
    const txt = renderSystemPrompt(pb);
    expect(txt).toContain('# IDENTIDADE');
    expect(txt).toContain('# OBJETIVO DA ETAPA');
    expect(txt).toContain('# REGRAS (DO)');
    expect(txt).toContain("# REGRAS (DON'T)");
    expect(txt).toContain('# CONTEXTO COMPOSICIONAL');
    expect(txt).toContain('arquétipo: first_contact');
    expect(txt).toContain('status do deal: open');
  });
});
