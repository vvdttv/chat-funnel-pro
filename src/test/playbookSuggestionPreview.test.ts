import { describe, it, expect } from 'vitest';
import {
  buildSuggestionPreview,
  buildEffectiveDiff,
  listAffectedStages,
} from '@/lib/playbookSuggestionPreview';
import type { OverrideSuggestion } from '@/lib/playbookOverrideSuggestions';
import type { RuntimeSnapshot } from '@/hooks/usePlaybookRuntime';
import type { PlaybookOverride } from '@/lib/playbookComposer';

const mkSnapshot = (over: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot => ({
  archetypes: [],
  statusArchetypes: [{ id: 'sa-open', code: 'open', name: 'Aberto', defaultOverlayRules: {} }],
  physicalStages: [
    { funnelId: 'f1', stageId: 's1', position: 0, stageArchetypeId: null, identity: {}, contextTags: ['*'] },
    { funnelId: 'f1', stageId: 's2', position: 1, stageArchetypeId: null, identity: {}, contextTags: ['*'] },
    { funnelId: 'f2', stageId: 's1', position: 0, stageArchetypeId: null, identity: {}, contextTags: ['*'] },
  ],
  catalogPlaybooks: [],
  overrides: [],
  rules: [],
  behaviors: [],
  ladders: [],
  triggers: [],
  funnelContextTagsById: { f1: ['*'], f2: ['*'] },
  ...over,
});

const mkSug = (over: Partial<OverrideSuggestion> = {}): OverrideSuggestion => ({
  id: 'sug-1',
  kind: 'lb_problematic',
  scope: { type: 'stage', id: 'f1::s1' },
  layer: 'stage',
  payload: { goal: 'Novo objetivo' },
  title: 't',
  rationale: 'r',
  severity: 'warning',
  evidence: { sample: 10, failureRate: 0.7, successRate: 0.3 },
  ...over,
});

describe('listAffectedStages', () => {
  it('expands org scope to every physical stage', () => {
    const snap = mkSnapshot();
    const affected = listAffectedStages({ type: 'org', id: 'org-1' }, snap.physicalStages);
    expect(affected).toHaveLength(3);
  });
  it('expands funnel scope to that funnel only', () => {
    const snap = mkSnapshot();
    const affected = listAffectedStages({ type: 'funnel', id: 'f1' }, snap.physicalStages);
    expect(affected).toEqual([
      { funnelId: 'f1', stageId: 's1' },
      { funnelId: 'f1', stageId: 's2' },
    ]);
  });
  it('returns the exact pair for stage scope', () => {
    const snap = mkSnapshot();
    expect(listAffectedStages({ type: 'stage', id: 'f1::s2' }, snap.physicalStages))
      .toEqual([{ funnelId: 'f1', stageId: 's2' }]);
  });
  it('returns empty for malformed stage id', () => {
    const snap = mkSnapshot();
    expect(listAffectedStages({ type: 'stage', id: 'invalid' }, snap.physicalStages)).toEqual([]);
  });
});

describe('buildSuggestionPreview', () => {
  it('produces before/after composed playbooks for stage scope without existing override', () => {
    const snap = mkSnapshot();
    const preview = buildSuggestionPreview({ suggestion: mkSug(), snapshot: snap });
    expect(preview.affectedCount).toBe(1);
    expect(preview.representative).toEqual({ funnelId: 'f1', stageId: 's1' });
    expect(preview.before).not.toBeNull();
    expect(preview.after).not.toBeNull();
    expect(preview.before!.goal).toBe('');
    expect(preview.after!.goal).toBe('Novo objetivo');
    // payload diff should reflect "added" goal
    expect(preview.payloadDiff.some(d => d.path === 'goal' && d.kind === 'added')).toBe(true);
  });

  it('merges with existing override and never erases manual customisation', () => {
    const existing: PlaybookOverride = {
      scopeType: 'stage', scopeId: 'f1::s1', layer: 'stage',
      payload: { goal: 'Manual original', successCriteria: ['A'] },
    };
    const snap = mkSnapshot({ overrides: [existing] });
    const sug = mkSug({
      payload: { goal: 'Sugerido (deve perder)', successCriteria: ['B'] },
    });
    const preview = buildSuggestionPreview({ suggestion: sug, snapshot: snap });
    // mergeSuggestionPayload: goal já tinha valor → preserva
    expect(preview.mergedPayload.goal).toBe('Manual original');
    // arrays viram união
    expect(preview.mergedPayload.successCriteria?.sort()).toEqual(['A', 'B']);
    // before já tinha override → goal "Manual original"
    expect(preview.before!.goal).toBe('Manual original');
    expect(preview.after!.goal).toBe('Manual original');
  });

  it('expands affected list for org scope across all funnels', () => {
    const snap = mkSnapshot();
    const sug = mkSug({ scope: { type: 'org', id: 'org-1' } });
    const preview = buildSuggestionPreview({ suggestion: sug, snapshot: snap });
    expect(preview.affectedCount).toBe(3);
    expect(preview.representative).toEqual({ funnelId: 'f1', stageId: 's1' });
  });

  it('returns null before/after when no physical stage matches', () => {
    const snap = mkSnapshot({ physicalStages: [] });
    const preview = buildSuggestionPreview({
      suggestion: mkSug({ scope: { type: 'funnel', id: 'unknown' } }),
      snapshot: snap,
    });
    expect(preview.before).toBeNull();
    expect(preview.after).toBeNull();
    expect(preview.affectedCount).toBe(0);
  });

  it('treats overlay layer suggestions in won status', () => {
    const snap = mkSnapshot({
      statusArchetypes: [
        { id: 'sa-open', code: 'open', name: 'open', defaultOverlayRules: {} },
        { id: 'sa-won', code: 'won', name: 'won', defaultOverlayRules: {} },
      ],
    });
    const preview = buildSuggestionPreview({
      suggestion: mkSug({ layer: 'stage' }),
      snapshot: snap,
      dealStatus: 'won',
    });
    expect(preview.after!.provenance.dealStatus).toBe('won');
  });
});

describe('buildEffectiveDiff', () => {
  it('returns empty array when either side is null', () => {
    expect(buildEffectiveDiff(null, null)).toEqual([]);
  });

  it('flags only changed scalar fields', () => {
    const snap = mkSnapshot();
    const before = buildSuggestionPreview({ suggestion: mkSug({ payload: {} }), snapshot: snap }).before!;
    const after = buildSuggestionPreview({ suggestion: mkSug(), snapshot: snap }).after!;
    const diff = buildEffectiveDiff(before, after);
    const goalDiff = diff.find(d => d.field === 'goal');
    expect(goalDiff?.changed).toBe(true);
    const personaDiff = diff.find(d => d.field === 'identity.persona');
    expect(personaDiff?.changed).toBe(false);
  });

  it('detects array changes in successCriteria', () => {
    const snap = mkSnapshot();
    const before = buildSuggestionPreview({ suggestion: mkSug({ payload: {} }), snapshot: snap }).before!;
    const after = buildSuggestionPreview({
      suggestion: mkSug({ payload: { successCriteria: ['novo'] } }),
      snapshot: snap,
    }).after!;
    const sc = buildEffectiveDiff(before, after).find(d => d.field === 'successCriteria');
    expect(sc?.changed).toBe(true);
    expect(sc?.after).toEqual(['novo']);
  });
});
