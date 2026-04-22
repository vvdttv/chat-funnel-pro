import { describe, it, expect } from 'vitest';
import {
  evaluateSnapshotEffectiveness, evaluateRecentSuggestionEffectiveness,
  isSuggestionSnapshot,
} from '@/lib/playbookSuggestionEffectiveness';
import type { OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';
import type { IADecisionLog } from '@/hooks/useIADecisionLogs';

const snap = (p: Partial<OverrideSnapshot> & { id: string; createdAt: string }): OverrideSnapshot => ({
  id: p.id,
  overrideId: null,
  scopeType: 'stage',
  scopeId: 'f1::s1',
  layer: 'stage',
  payload: {},
  isActive: true,
  action: 'upsert',
  note: null,
  createdBy: null,
  ...p,
});

const log = (p: Partial<IADecisionLog> & { id: string; created_at: string }): IADecisionLog => ({
  id: p.id,
  created_at: p.created_at,
  deal_id: null,
  funnel_id: 'f1',
  stage_id: 's1',
  playbook_code: null,
  detected_behavior_codes: [],
  applied_rule_codes: [],
  intent: null,
  tone: null,
  action_taken: '',
  outcome: null,
  context: {},
  archetype_code: null,
  status_overlay_code: null,
  applied_override_ids: [],
  context_tags: [],
  deal_status: null,
  ...p,
});

describe('isSuggestionSnapshot', () => {
  it('aceita snapshots com batchId', () => {
    expect(isSuggestionSnapshot(snap({ id: '1', createdAt: 'x', note: '[batch_aaa] x' }))).toBe(true);
  });
  it('aceita snapshots avulsos com nota auto-sugestão', () => {
    expect(isSuggestionSnapshot(snap({ id: '1', createdAt: 'x', note: 'auto-sugestão (lb)' }))).toBe(true);
  });
  it('rejeita snapshots manuais', () => {
    expect(isSuggestionSnapshot(snap({ id: '1', createdAt: 'x', note: 'edição manual' }))).toBe(false);
    expect(isSuggestionSnapshot(snap({ id: '1', createdAt: 'x', note: null }))).toBe(false);
  });
});

describe('evaluateSnapshotEffectiveness', () => {
  const APPLIED = '2025-02-01T12:00:00Z';
  const tsBefore = (daysAgo: number) =>
    new Date(new Date(APPLIED).getTime() - daysAgo * 86400000).toISOString();
  const tsAfter = (daysAhead: number) =>
    new Date(new Date(APPLIED).getTime() + daysAhead * 86400000).toISOString();

  it('classifica como improved quando falha cai consideravelmente', () => {
    const s = snap({ id: 's1', createdAt: APPLIED, note: 'auto-sugestão' });
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `b${i}`, created_at: tsBefore(3), outcome: i < 8 ? 'failure' : 'success' }));
    }
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `a${i}`, created_at: tsAfter(3), outcome: i < 2 ? 'failure' : 'success' }));
    }
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.before.failureRate).toBeCloseTo(0.8);
    expect(r.after.failureRate).toBeCloseTo(0.2);
    expect(r.status).toBe('improved');
    expect(r.label).toContain('▼');
  });

  it('classifica como worsened quando falha sobe', () => {
    const s = snap({ id: 's1', createdAt: APPLIED, note: 'auto-sugestão' });
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `b${i}`, created_at: tsBefore(3), outcome: i < 2 ? 'failure' : 'success' }));
    }
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `a${i}`, created_at: tsAfter(3), outcome: i < 8 ? 'failure' : 'success' }));
    }
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.status).toBe('worsened');
    expect(r.label).toContain('▲');
  });

  it('devolve inconclusive quando amostra é insuficiente', () => {
    const s = snap({ id: 's1', createdAt: APPLIED });
    const logs = [log({ id: '1', created_at: tsAfter(1), outcome: 'failure' })];
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.status).toBe('inconclusive');
    expect(r.label).toBe('sem dados');
  });

  it('classifica como neutral quando delta é menor que threshold', () => {
    const s = snap({ id: 's1', createdAt: APPLIED });
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `b${i}`, created_at: tsBefore(3), outcome: i < 5 ? 'failure' : 'success' }));
      logs.push(log({ id: `a${i}`, created_at: tsAfter(3), outcome: i < 5 ? 'failure' : 'success' }));
    }
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.status).toBe('neutral');
  });

  it('respeita escopo stage filtrando por funnel+stage', () => {
    const s = snap({ id: 's1', createdAt: APPLIED, scopeType: 'stage', scopeId: 'f1::s1' });
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `o${i}`, created_at: tsBefore(3), funnel_id: 'f1', stage_id: 's2', outcome: 'failure' }));
    }
    for (let i = 0; i < 5; i++) {
      logs.push(log({ id: `b${i}`, created_at: tsBefore(3), outcome: 'success' }));
      logs.push(log({ id: `a${i}`, created_at: tsAfter(3), outcome: 'success' }));
    }
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.before.sample).toBe(5);
    expect(r.after.sample).toBe(5);
  });

  it('escopo funnel inclui qualquer stage do funil', () => {
    const s = snap({ id: 's1', createdAt: APPLIED, scopeType: 'funnel', scopeId: 'f1' });
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `b${i}`, created_at: tsBefore(2), stage_id: i % 2 === 0 ? 's1' : 's2', outcome: 'failure' }));
      logs.push(log({ id: `a${i}`, created_at: tsAfter(2), stage_id: i % 2 === 0 ? 's1' : 's2', outcome: 'success' }));
    }
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.before.sample).toBe(10);
    expect(r.after.sample).toBe(10);
    expect(r.status).toBe('improved');
  });

  it('escopo org não filtra por funnel', () => {
    const s = snap({ id: 's1', createdAt: APPLIED, scopeType: 'org', scopeId: 'org-x' });
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `b${i}`, created_at: tsBefore(2), funnel_id: i % 2 ? 'f1' : 'f2', outcome: 'failure' }));
      logs.push(log({ id: `a${i}`, created_at: tsAfter(2), funnel_id: i % 2 ? 'f1' : 'f2', outcome: 'failure' }));
    }
    const r = evaluateSnapshotEffectiveness(s, logs);
    expect(r.before.sample).toBe(10);
    expect(r.after.sample).toBe(10);
  });
});

describe('evaluateRecentSuggestionEffectiveness', () => {
  it('retorna apenas snapshots de sugestão dentro do lookback, ordenados por |delta|', () => {
    const now = Date.now();
    const ago = (d: number) => new Date(now - d * 86400000).toISOString();
    const snapshots: OverrideSnapshot[] = [
      snap({ id: 'old', createdAt: ago(60), note: 'auto-sugestão' }),
      snap({ id: 'manual', createdAt: ago(5), note: 'edição manual' }),
      snap({ id: 'auto', createdAt: ago(5), note: 'auto-sugestão' }),
    ];
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 10; i++) {
      logs.push(log({ id: `b${i}`, created_at: ago(7), outcome: i < 8 ? 'failure' : 'success' }));
      logs.push(log({ id: `a${i}`, created_at: ago(3), outcome: i < 2 ? 'failure' : 'success' }));
    }
    const results = evaluateRecentSuggestionEffectiveness(snapshots, logs, { lookbackDays: 30 });
    expect(results.length).toBe(1);
    expect(results[0].snapshotId).toBe('auto');
  });
});
