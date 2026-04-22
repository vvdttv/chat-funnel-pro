/**
 * Testes do motor de skills (puro, sem I/O).
 */

import { describe, it, expect } from 'vitest';
import {
  selectActiveSkills, rankSkillsByMatch, composeActiveSkill,
  expandSkillToActions, validateSkill,
  type SkillWithNodes,
} from '@/lib/skillComposer';
import type { IASkill, IASkillNode, TriggerConfig, CallSkillConfig } from '@/data/iaSkills';

// ----- Builders ------------------------------------------------------------

const skill = (overrides: Partial<IASkill> = {}): IASkill => ({
  id: overrides.id ?? `s-${Math.random().toString(36).slice(2, 8)}`,
  code: overrides.code ?? 'SK-X',
  name: overrides.name ?? 'X',
  description: overrides.description ?? '',
  scopeType: overrides.scopeType ?? 'universal',
  scopeId: overrides.scopeId ?? null,
  isActive: overrides.isActive ?? true,
  isAutoSuggested: overrides.isAutoSuggested ?? false,
  position: overrides.position ?? 0,
});

const trigger = (skillId: string, behaviorCodes: string[], extra: Partial<TriggerConfig> = {}): IASkillNode => ({
  id: `t-${skillId}`,
  skillId,
  kind: 'trigger',
  parentNodeId: null,
  branchLabel: null,
  positionX: 0, positionY: 0, position: 0,
  config: { behaviorCodes, ...extra } as never,
});

const node = (skillId: string, kind: IASkillNode['kind'], parentId: string | null, idSuffix: string, position = 0, cfg: Record<string, unknown> = {}): IASkillNode => ({
  id: `${kind}-${skillId}-${idSuffix}`,
  skillId,
  kind,
  parentNodeId: parentId,
  branchLabel: null,
  positionX: 0, positionY: 0, position,
  config: cfg,
});

// ----- Tests ---------------------------------------------------------------

describe('selectActiveSkills', () => {
  it('descarta skills inativas', () => {
    const s = skill({ isActive: false });
    const swn: SkillWithNodes = { skill: s, nodes: [trigger(s.id, ['LB-A'])], guardrailRuleCodes: [] };
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-A'] })).toHaveLength(0);
  });

  it('exige interseção de LB do gatilho com detectados', () => {
    const s = skill();
    const swn: SkillWithNodes = { skill: s, nodes: [trigger(s.id, ['LB-A'])], guardrailRuleCodes: [] };
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-B'] })).toHaveLength(0);
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-A'] })).toHaveLength(1);
  });

  it('respeita escopo de etapa', () => {
    const s = skill({ scopeType: 'stage', scopeId: 'E2' });
    const swn: SkillWithNodes = { skill: s, nodes: [trigger(s.id, ['LB-A'])], guardrailRuleCodes: [] };
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-A'], stageCode: 'E1' })).toHaveLength(0);
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-A'], stageCode: 'E2' })).toHaveLength(1);
  });

  it('respeita contextTags exigidas no gatilho', () => {
    const s = skill();
    const swn: SkillWithNodes = {
      skill: s,
      nodes: [trigger(s.id, ['LB-A'], { contextTags: ['real-estate'] })],
      guardrailRuleCodes: [],
    };
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-A'], contextTags: ['b2b'] })).toHaveLength(0);
    expect(selectActiveSkills([swn], { detectedBehaviorCodes: ['LB-A'], contextTags: ['real-estate'] })).toHaveLength(1);
  });

  it('descarta skill sem trigger ou sem behaviorCodes', () => {
    const s = skill();
    const noTrigger: SkillWithNodes = { skill: s, nodes: [], guardrailRuleCodes: [] };
    const emptyTrigger: SkillWithNodes = { skill: s, nodes: [trigger(s.id, [])], guardrailRuleCodes: [] };
    expect(selectActiveSkills([noTrigger, emptyTrigger], { detectedBehaviorCodes: ['LB-A'] })).toHaveLength(0);
  });
});

describe('rankSkillsByMatch', () => {
  it('skill com mais LBs casados vence', () => {
    const a = skill({ id: 'a', code: 'A' });
    const b = skill({ id: 'b', code: 'B' });
    const swns: SkillWithNodes[] = [
      { skill: a, nodes: [trigger(a.id, ['LB-1'])], guardrailRuleCodes: [] },
      { skill: b, nodes: [trigger(b.id, ['LB-1', 'LB-2'])], guardrailRuleCodes: [] },
    ];
    const ranked = rankSkillsByMatch(swns, { detectedBehaviorCodes: ['LB-1', 'LB-2'] });
    expect(ranked[0].skill.code).toBe('B');
  });

  it('escopo stage soma sobre universal', () => {
    const u = skill({ id: 'u', code: 'U', scopeType: 'universal' });
    const s = skill({ id: 's', code: 'S', scopeType: 'stage', scopeId: 'E2' });
    const swns: SkillWithNodes[] = [
      { skill: u, nodes: [trigger(u.id, ['LB-1'])], guardrailRuleCodes: [] },
      { skill: s, nodes: [trigger(s.id, ['LB-1'])], guardrailRuleCodes: [] },
    ];
    const ranked = rankSkillsByMatch(swns, { detectedBehaviorCodes: ['LB-1'], stageCode: 'E2' });
    expect(ranked[0].skill.code).toBe('S');
  });
});

describe('composeActiveSkill', () => {
  it('retorna a skill vencedora', () => {
    const a = skill({ id: 'a', code: 'A' });
    const b = skill({ id: 'b', code: 'B', scopeType: 'stage', scopeId: 'E2' });
    const swns: SkillWithNodes[] = [
      { skill: a, nodes: [trigger(a.id, ['LB-1'])], guardrailRuleCodes: [] },
      { skill: b, nodes: [trigger(b.id, ['LB-1'])], guardrailRuleCodes: [] },
    ];
    const winner = composeActiveSkill(swns, { detectedBehaviorCodes: ['LB-1'], stageCode: 'E2' });
    expect(winner?.skill.code).toBe('B');
  });

  it('retorna null sem candidatos', () => {
    expect(composeActiveSkill([], { detectedBehaviorCodes: ['X'] })).toBeNull();
  });
});

describe('expandSkillToActions', () => {
  it('linhariza árvore simples em ordem DFS', () => {
    const s = skill({ id: 'x', code: 'SK-X' });
    const t = trigger(s.id, ['LB-1']);
    const a = node(s.id, 'send_message', t.id, '1', 0);
    const b = node(s.id, 'wait', a.id, '2', 0);
    const swn: SkillWithNodes = { skill: s, nodes: [t, a, b], guardrailRuleCodes: [] };
    const actions = expandSkillToActions(swn);
    expect(actions.map(x => x.node.kind)).toEqual(['trigger', 'send_message', 'wait']);
  });

  it('resolve call_skill recursivamente', () => {
    const a = skill({ id: 'a', code: 'SK-A' });
    const b = skill({ id: 'b', code: 'SK-B' });
    const tA = trigger(a.id, ['LB-1']);
    const callB = node(a.id, 'call_skill', tA.id, '1', 0, { skillCode: 'SK-B' } satisfies CallSkillConfig);
    const tB = trigger(b.id, ['LB-2']);
    const msgB = node(b.id, 'send_message', tB.id, '1', 0);
    const swnA: SkillWithNodes = { skill: a, nodes: [tA, callB], guardrailRuleCodes: [] };
    const swnB: SkillWithNodes = { skill: b, nodes: [tB, msgB], guardrailRuleCodes: [] };
    const map = new Map([['SK-A', swnA], ['SK-B', swnB]]);
    const actions = expandSkillToActions(swnA, { skillByCode: map });
    const kinds = actions.map(x => `${x.sourceSkillCode}:${x.node.kind}`);
    expect(kinds).toContain('SK-A:call_skill');
    expect(kinds).toContain('SK-B:trigger');
    expect(kinds).toContain('SK-B:send_message');
  });

  it('detecta ciclo em call_skill', () => {
    const a = skill({ id: 'a', code: 'SK-A' });
    const b = skill({ id: 'b', code: 'SK-B' });
    const tA = trigger(a.id, ['LB-1']);
    const callB = node(a.id, 'call_skill', tA.id, '1', 0, { skillCode: 'SK-B' });
    const tB = trigger(b.id, ['LB-2']);
    const callA = node(b.id, 'call_skill', tB.id, '1', 0, { skillCode: 'SK-A' });
    const swnA: SkillWithNodes = { skill: a, nodes: [tA, callB], guardrailRuleCodes: [] };
    const swnB: SkillWithNodes = { skill: b, nodes: [tB, callA], guardrailRuleCodes: [] };
    const map = new Map([['SK-A', swnA], ['SK-B', swnB]]);
    const actions = expandSkillToActions(swnA, { skillByCode: map });
    const cycle = actions.find(x => x.id.includes('CYCLE'));
    expect(cycle).toBeDefined();
  });
});

describe('validateSkill', () => {
  it('detecta ausência de gatilho', () => {
    const s = skill();
    const swn: SkillWithNodes = { skill: s, nodes: [], guardrailRuleCodes: [] };
    const issues = validateSkill(swn);
    expect(issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('detecta gatilho sem behaviors', () => {
    const s = skill();
    const swn: SkillWithNodes = { skill: s, nodes: [trigger(s.id, [])], guardrailRuleCodes: [] };
    const issues = validateSkill(swn);
    expect(issues.some(i => i.message.includes('comportamento'))).toBe(true);
  });

  it('avisa sobre nó órfão', () => {
    const s = skill();
    const t = trigger(s.id, ['LB-1']);
    const orphan = node(s.id, 'send_message', null, 'orphan', 0);
    const swn: SkillWithNodes = { skill: s, nodes: [t, orphan], guardrailRuleCodes: [] };
    const issues = validateSkill(swn);
    expect(issues.some(i => i.message.includes('desconectado'))).toBe(true);
  });

  it('avisa sobre guardrails conflitantes', () => {
    const s = skill();
    const swn: SkillWithNodes = {
      skill: s,
      nodes: [trigger(s.id, ['LB-1'])],
      guardrailRuleCodes: ['IA-DO-006', 'IA-DONT-006'],
    };
    const issues = validateSkill(swn);
    expect(issues.some(i => i.message.includes('conflitantes'))).toBe(true);
  });
});
