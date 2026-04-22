import { describe, it, expect } from 'vitest';
import { computeOverrideCascade } from '@/lib/playbookOverrideCascade';
import type { PhysicalStage } from '@/lib/playbookComposer';

const mkStage = (funnelId: string, stageId: string): PhysicalStage => ({
  funnelId, stageId, position: 0, stageArchetypeId: null, identity: {}, contextTags: [],
});

describe('computeOverrideCascade', () => {
  const stages: PhysicalStage[] = [
    mkStage('f1', 's1'), mkStage('f1', 's2'), mkStage('f1', 's3'),
    mkStage('f2', 's1'), mkStage('f2', 's2'),
    mkStage('f3', 'only'),
  ];

  it('org scope hits all physical stages', () => {
    const r = computeOverrideCascade({ scopeType: 'org', scopeId: 'org-uuid', physicalStages: stages });
    expect(r.affected).toBe(6);
    expect(r.truncated).toBe(false);
  });

  it('funnel scope hits only that funnel stages', () => {
    const r = computeOverrideCascade({ scopeType: 'funnel', scopeId: 'f1', physicalStages: stages });
    expect(r.affected).toBe(3);
    expect(r.stages.every(s => s.funnelId === 'f1')).toBe(true);
  });

  it('funnel scope returns 0 for unknown funnel', () => {
    const r = computeOverrideCascade({ scopeType: 'funnel', scopeId: 'ghost', physicalStages: stages });
    expect(r.affected).toBe(0);
    expect(r.stages).toHaveLength(0);
  });

  it('stage scope hits exactly one stage', () => {
    const r = computeOverrideCascade({ scopeType: 'stage', scopeId: 'f1::s2', physicalStages: stages });
    expect(r.affected).toBe(1);
    expect(r.stages[0]).toEqual({ funnelId: 'f1', stageId: 's2' });
  });

  it('stage scope returns 0 if stage not found', () => {
    const r = computeOverrideCascade({ scopeType: 'stage', scopeId: 'f1::ghost', physicalStages: stages });
    expect(r.affected).toBe(0);
  });

  it('truncates preview list at previewLimit', () => {
    const many = Array.from({ length: 20 }, (_, i) => mkStage('f1', `s${i}`));
    const r = computeOverrideCascade({ scopeType: 'org', scopeId: 'o', physicalStages: many, previewLimit: 5 });
    expect(r.affected).toBe(20);
    expect(r.stages).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });

  it('does not truncate when sample equals total', () => {
    const r = computeOverrideCascade({ scopeType: 'funnel', scopeId: 'f1', physicalStages: stages, previewLimit: 8 });
    expect(r.truncated).toBe(false);
  });

  it('handles empty physicalStages list', () => {
    const r = computeOverrideCascade({ scopeType: 'org', scopeId: 'o', physicalStages: [] });
    expect(r.affected).toBe(0);
    expect(r.stages).toHaveLength(0);
    expect(r.truncated).toBe(false);
  });
});
