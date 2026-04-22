import { describe, it, expect } from 'vitest';
import {
  analyzeDecisionLogs,
  mergeSuggestionPayload,
} from '@/lib/playbookOverrideSuggestions';
import type { IADecisionLog } from '@/hooks/useIADecisionLogs';

const mkLog = (over: Partial<IADecisionLog> = {}): IADecisionLog => ({
  id: crypto.randomUUID(),
  created_at: new Date().toISOString(),
  deal_id: null, funnel_id: null, stage_id: null, playbook_code: null,
  detected_behavior_codes: [], applied_rule_codes: [],
  intent: null, tone: null, action_taken: '', outcome: null,
  context: {}, archetype_code: null, status_overlay_code: null,
  applied_override_ids: [], context_tags: [], deal_status: null,
  ...over,
});

describe('analyzeDecisionLogs — heuristics', () => {
  it('returns empty array when no logs', () => {
    expect(analyzeDecisionLogs([])).toEqual([]);
  });

  it('flags LB as problematic when failure rate exceeds threshold', () => {
    const logs: IADecisionLog[] = [
      ...Array.from({ length: 5 }, () => mkLog({
        funnel_id: 'f1', stage_id: 's1',
        detected_behavior_codes: ['LB-OBJ'], outcome: 'failure',
      })),
      mkLog({
        funnel_id: 'f1', stage_id: 's1',
        detected_behavior_codes: ['LB-OBJ'], outcome: 'success',
      }),
    ];
    const out = analyzeDecisionLogs(logs);
    const lbSug = out.find(s => s.kind === 'lb_problematic');
    expect(lbSug).toBeDefined();
    expect(lbSug!.scope).toEqual({ type: 'stage', id: 'f1::s1' });
    expect(lbSug!.evidence.label).toBe('LB-OBJ');
    expect(lbSug!.evidence.sample).toBe(6);
    expect(lbSug!.payload.expectedBehaviorIds).toContain('LB-OBJ');
  });

  it('does not flag LB below sample threshold', () => {
    const logs = Array.from({ length: 3 }, () => mkLog({
      funnel_id: 'f1', stage_id: 's1',
      detected_behavior_codes: ['LB-X'], outcome: 'failure',
    }));
    expect(analyzeDecisionLogs(logs).filter(s => s.kind === 'lb_problematic')).toHaveLength(0);
  });

  it('flags chronic loss stage', () => {
    const logs: IADecisionLog[] = Array.from({ length: 10 }, (_, i) => mkLog({
      funnel_id: 'f1', stage_id: 's1',
      outcome: i < 7 ? 'lost' : 'won',
    }));
    const out = analyzeDecisionLogs(logs);
    const stage = out.find(s => s.kind === 'stage_chronic_loss');
    expect(stage).toBeDefined();
    expect(stage!.scope.id).toBe('f1::s1');
    expect(stage!.payload.goal).toMatch(/Reverter padrão/);
  });

  it('treats lost and failure equivalently as failure outcomes', () => {
    const logs: IADecisionLog[] = [
      ...Array.from({ length: 5 }, () => mkLog({
        funnel_id: 'f1', stage_id: 's1', outcome: 'lost',
      })),
      ...Array.from({ length: 4 }, () => mkLog({
        funnel_id: 'f1', stage_id: 's1', outcome: 'failure',
      })),
      mkLog({ funnel_id: 'f1', stage_id: 's1', outcome: 'won' }),
    ];
    const out = analyzeDecisionLogs(logs);
    const stage = out.find(s => s.kind === 'stage_chronic_loss');
    expect(stage).toBeDefined();
    expect(stage!.evidence.sample).toBe(10);
    expect(stage!.evidence.failureRate).toBeCloseTo(0.9, 1);
  });

  it('flags toxic context tag and chooses funnel scope when single funnel', () => {
    const logs = Array.from({ length: 12 }, (_, i) => mkLog({
      funnel_id: 'fA', stage_id: `s${i % 3}`,
      context_tags: ['urgente'],
      outcome: i < 8 ? 'failure' : 'success',
    }));
    const out = analyzeDecisionLogs(logs);
    const tagSug = out.find(s => s.kind === 'context_tag_toxic');
    expect(tagSug).toBeDefined();
    expect(tagSug!.scope).toEqual({ type: 'funnel', id: 'fA' });
    expect(tagSug!.evidence.label).toBe('urgente');
  });

  it('falls back to org scope when toxic tag spans multiple funnels', () => {
    const logs = [
      ...Array.from({ length: 6 }, () => mkLog({
        funnel_id: 'fA', stage_id: 's1', context_tags: ['urgente'], outcome: 'failure',
      })),
      ...Array.from({ length: 5 }, () => mkLog({
        funnel_id: 'fB', stage_id: 's1', context_tags: ['urgente'], outcome: 'failure',
      })),
    ];
    const out = analyzeDecisionLogs(logs);
    const tagSug = out.find(s => s.kind === 'context_tag_toxic');
    expect(tagSug?.scope.type).toBe('org');
  });

  it('orders critical suggestions before warnings/info', () => {
    const logs: IADecisionLog[] = [
      // critical: 100% fail x 10
      ...Array.from({ length: 10 }, () => mkLog({
        funnel_id: 'f1', stage_id: 's1',
        detected_behavior_codes: ['LB-CRIT'], outcome: 'failure',
      })),
      // warning: 70% fail x 7
      ...Array.from({ length: 7 }, (_, i) => mkLog({
        funnel_id: 'f1', stage_id: 's2',
        detected_behavior_codes: ['LB-WARN'],
        outcome: i < 5 ? 'failure' : 'success',
      })),
    ];
    const out = analyzeDecisionLogs(logs).filter(s => s.kind === 'lb_problematic');
    expect(out[0].evidence.label).toBe('LB-CRIT');
    expect(out[0].severity).toBe('critical');
  });

  it('respects custom thresholds', () => {
    const logs = Array.from({ length: 4 }, () => mkLog({
      funnel_id: 'f1', stage_id: 's1',
      detected_behavior_codes: ['LB-X'], outcome: 'failure',
    }));
    // Default minSampleLB=5 → no suggestion
    expect(analyzeDecisionLogs(logs)).toHaveLength(0);
    // Lowered threshold → suggestion appears
    const out = analyzeDecisionLogs(logs, { minSampleLB: 3 });
    expect(out.some(s => s.kind === 'lb_problematic')).toBe(true);
  });

  it('caps the number of suggestions via maxSuggestions', () => {
    const logs: IADecisionLog[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 6; j++) {
        logs.push(mkLog({
          funnel_id: `f${i}`, stage_id: 's1',
          detected_behavior_codes: [`LB-${i}`], outcome: 'failure',
        }));
      }
    }
    const out = analyzeDecisionLogs(logs, { maxSuggestions: 2 });
    expect(out).toHaveLength(2);
  });
});

describe('mergeSuggestionPayload', () => {
  it('preserves existing strings and only fills empty ones', () => {
    const merged = mergeSuggestionPayload(
      { goal: 'manter goal' },
      { goal: 'sugerido' },
    );
    expect(merged.goal).toBe('manter goal');
  });

  it('fills empty strings from suggestion', () => {
    const merged = mergeSuggestionPayload({}, { goal: 'novo' });
    expect(merged.goal).toBe('novo');
  });

  it('unions arrays without duplicates', () => {
    const merged = mergeSuggestionPayload(
      { expectedBehaviorIds: ['LB-A', 'LB-B'] },
      { expectedBehaviorIds: ['LB-B', 'LB-C'] },
    );
    expect(merged.expectedBehaviorIds?.sort()).toEqual(['LB-A', 'LB-B', 'LB-C']);
  });

  it('merges identity field by field, preserving existing values', () => {
    const merged = mergeSuggestionPayload(
      { identity: { persona: 'já existe' } },
      { identity: { persona: 'novo', tone: 'firme' } },
    );
    expect(merged.identity?.persona).toBe('já existe');
    expect(merged.identity?.tone).toBe('firme');
  });

  it('returns suggestion payload when existing is undefined', () => {
    const merged = mergeSuggestionPayload(undefined, {
      goal: 'g', expectedBehaviorIds: ['LB-X'],
    });
    expect(merged.goal).toBe('g');
    expect(merged.expectedBehaviorIds).toEqual(['LB-X']);
  });
});
