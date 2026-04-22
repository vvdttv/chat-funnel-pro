import { describe, it, expect } from 'vitest';
import {
  buildSnapshotsCSV, buildSnapshotsJSON, summarizeAuditPeriod,
} from '@/lib/playbookOverrideAuditExport';
import type { OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';

const snap = (p: Partial<OverrideSnapshot> & { id: string }): OverrideSnapshot => ({
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
  createdAt: '2025-01-01T10:00:00Z',
  ...p,
});

describe('buildSnapshotsCSV', () => {
  it('inclui header com todas as colunas esperadas', () => {
    const csv = buildSnapshotsCSV([]);
    const header = csv.split('\n')[0];
    expect(header).toContain('created_at');
    expect(header).toContain('batch_id');
    expect(header).toContain('payload_json');
  });

  it('escapa vírgulas e aspas em campos de texto', () => {
    const csv = buildSnapshotsCSV([
      snap({ id: '1', payload: { goal: 'foo, "bar"' } }),
    ]);
    expect(csv).toContain('"foo, ""bar"""');
  });

  it('extrai batch_id do note', () => {
    const csv = buildSnapshotsCSV([
      snap({ id: '1', note: '[batch_abc123] mensagem' }),
    ]);
    expect(csv).toContain('batch_abc123');
  });

  it('resolve autor pelo memberMap', () => {
    const map = new Map([['user-1', 'João']]);
    const csv = buildSnapshotsCSV([
      snap({ id: '1', createdBy: 'user-1' }),
    ], map);
    expect(csv).toContain('João');
  });
});

describe('buildSnapshotsJSON', () => {
  it('devolve string JSON parseável', () => {
    const json = buildSnapshotsJSON([snap({ id: '1' })]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('1');
  });
});

describe('summarizeAuditPeriod', () => {
  it('devolve totais zerados em lista vazia', () => {
    const sum = summarizeAuditPeriod([]);
    expect(sum.total).toBe(0);
    expect(sum.batchCount).toBe(0);
    expect(sum.periodFrom).toBeUndefined();
  });

  it('agrega por escopo, layer e ação', () => {
    const sum = summarizeAuditPeriod([
      snap({ id: '1', scopeType: 'stage', layer: 'stage', action: 'upsert' }),
      snap({ id: '2', scopeType: 'stage', layer: 'overlay', action: 'upsert' }),
      snap({ id: '3', scopeType: 'funnel', scopeId: 'f1', layer: 'stage', action: 'rollback' }),
    ]);
    expect(sum.total).toBe(3);
    expect(sum.byScope.find(([k]) => k === 'stage')?.[1]).toBe(2);
    expect(sum.byLayer.find(([k]) => k === 'overlay')?.[1]).toBe(1);
    expect(sum.byAction.find(([k]) => k === 'rollback')?.[1]).toBe(1);
  });

  it('agrega funnelId tanto de scope=funnel quanto de scope=stage', () => {
    const sum = summarizeAuditPeriod([
      snap({ id: '1', scopeType: 'funnel', scopeId: 'f1' }),
      snap({ id: '2', scopeType: 'stage', scopeId: 'f1::s1' }),
      snap({ id: '3', scopeType: 'stage', scopeId: 'f2::s1' }),
    ]);
    expect(sum.byFunnelId.find(([k]) => k === 'f1')?.[1]).toBe(2);
    expect(sum.byFunnelId.find(([k]) => k === 'f2')?.[1]).toBe(1);
  });

  it('conta batches únicos via note', () => {
    const sum = summarizeAuditPeriod([
      snap({ id: '1', note: '[batch_aaa] x' }),
      snap({ id: '2', note: '[batch_aaa] y' }),
      snap({ id: '3', note: '[batch_bbb] z' }),
      snap({ id: '4', note: 'avulso' }),
    ]);
    expect(sum.batchCount).toBe(2);
  });

  it('calcula janela de período via min/max createdAt', () => {
    const sum = summarizeAuditPeriod([
      snap({ id: '1', createdAt: '2025-01-01T10:00:00Z' }),
      snap({ id: '2', createdAt: '2025-01-05T10:00:00Z' }),
      snap({ id: '3', createdAt: '2025-01-03T10:00:00Z' }),
    ]);
    expect(sum.periodFrom).toBe('2025-01-01T10:00:00.000Z');
    expect(sum.periodTo).toBe('2025-01-05T10:00:00.000Z');
  });

  it('limita autores ao top 10', () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      snap({ id: `s${i}`, createdBy: `user-${i}` }),
    );
    const sum = summarizeAuditPeriod(items);
    expect(sum.byAuthor.length).toBeLessThanOrEqual(10);
  });
});
