/**
 * Sprint 15 — Testes do diff de payloads de override.
 *
 * Cobre: campo escalar (goal), subcampos de identity, arrays
 * (successCriteria/failureCriteria/expectedBehaviorIds) e o resumo legível.
 */

import { describe, it, expect } from 'vitest';
import { buildPayloadDiff, summarizeDiff } from '@/lib/playbookOverrideDiff';
import type { PlaybookOverride } from '@/lib/playbookComposer';

type Payload = PlaybookOverride['payload'];

describe('buildPayloadDiff', () => {
  it('retorna [] quando payloads são idênticos', () => {
    const p: Payload = { goal: 'x', identity: { persona: 'a' }, successCriteria: ['s1'] };
    expect(buildPayloadDiff(p, p)).toEqual([]);
  });

  it('retorna [] quando ambos vazios/undefined', () => {
    expect(buildPayloadDiff(undefined, undefined)).toEqual([]);
    expect(buildPayloadDiff({}, {})).toEqual([]);
  });

  it('detecta goal adicionado', () => {
    const d = buildPayloadDiff({}, { goal: 'novo objetivo' });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: 'goal', kind: 'added', after: 'novo objetivo' });
  });

  it('detecta goal removido', () => {
    const d = buildPayloadDiff({ goal: 'antigo' }, {});
    expect(d[0]).toMatchObject({ path: 'goal', kind: 'removed', before: 'antigo' });
  });

  it('detecta goal alterado', () => {
    const d = buildPayloadDiff({ goal: 'a' }, { goal: 'b' });
    expect(d[0]).toMatchObject({ path: 'goal', kind: 'changed', before: 'a', after: 'b' });
  });

  it('detecta mudança em subcampo de identity', () => {
    const d = buildPayloadDiff(
      { identity: { persona: 'corretor', tone: 'formal' } },
      { identity: { persona: 'corretor', tone: 'casual' } },
    );
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: 'identity.tone', kind: 'changed', before: 'formal', after: 'casual' });
  });

  it('detecta vários subcampos de identity', () => {
    const d = buildPayloadDiff(
      { identity: { persona: 'a', mission: 'm1' } },
      { identity: { persona: 'b', mission: 'm1', identityNotes: 'limite 5%' } },
    );
    const paths = d.map(e => e.path).sort();
    expect(paths).toEqual(['identity.identityNotes', 'identity.persona']);
  });

  it('detecta itens adicionados/removidos em array', () => {
    const d = buildPayloadDiff(
      { successCriteria: ['s1', 's2'] },
      { successCriteria: ['s2', 's3'] },
    );
    expect(d).toHaveLength(1);
    expect(d[0].path).toBe('successCriteria');
    expect(d[0].kind).toBe('changed');
    expect(d[0].arrayDelta).toEqual({ added: ['s3'], removed: ['s1'] });
  });

  it('classifica array como added quando antes vazio', () => {
    const d = buildPayloadDiff({}, { expectedBehaviorIds: ['LB1', 'LB2'] });
    expect(d[0]).toMatchObject({ path: 'expectedBehaviorIds', kind: 'added' });
    expect(d[0].arrayDelta).toEqual({ added: ['LB1', 'LB2'], removed: [] });
  });

  it('classifica array como removed quando depois vazio', () => {
    const d = buildPayloadDiff({ failureCriteria: ['x'] }, {});
    expect(d[0]).toMatchObject({ path: 'failureCriteria', kind: 'removed' });
    expect(d[0].arrayDelta).toEqual({ added: [], removed: ['x'] });
  });

  it('combina mudanças em múltiplos campos', () => {
    const d = buildPayloadDiff(
      { goal: 'a', successCriteria: ['s1'] },
      { goal: 'b', identity: { persona: 'p' }, successCriteria: ['s1', 's2'] },
    );
    const paths = d.map(e => e.path).sort();
    expect(paths).toEqual(['goal', 'identity.persona', 'successCriteria']);
  });

  it('ignora arrays sem delta efetivo (mesma ordem ou não)', () => {
    const d = buildPayloadDiff(
      { successCriteria: ['a', 'b'] },
      { successCriteria: ['b', 'a'] },
    );
    expect(d).toEqual([]);
  });
});

describe('summarizeDiff', () => {
  it('retorna "sem alterações" para diff vazio', () => {
    expect(summarizeDiff([])).toBe('sem alterações');
  });

  it('descreve singular vs plural corretamente', () => {
    const single = buildPayloadDiff({}, { goal: 'x' });
    expect(summarizeDiff(single)).toMatch(/1 alteração/);
    expect(summarizeDiff(single)).toMatch(/adicionada/);

    const multi = buildPayloadDiff(
      { goal: 'a' },
      { goal: 'b', successCriteria: ['s1'] },
    );
    expect(summarizeDiff(multi)).toMatch(/2 alterações/);
  });

  it('contabiliza added/removed/changed separadamente', () => {
    const d = buildPayloadDiff(
      { goal: 'a', failureCriteria: ['x'] },
      { goal: 'b', successCriteria: ['s1'] },
    );
    const summary = summarizeDiff(d);
    expect(summary).toMatch(/3 alterações/);
    expect(summary).toMatch(/adicionada/);
    expect(summary).toMatch(/removida/);
    expect(summary).toMatch(/alterada/);
  });
});
