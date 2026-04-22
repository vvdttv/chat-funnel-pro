import { describe, it, expect } from 'vitest';
import {
  buildRollbackPlan, groupSnapshotsByBatch, buildRollbackNote,
} from '@/lib/playbookSnapshotRollback';
import type { OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';

const snap = (
  partial: Partial<OverrideSnapshot> & { id: string; createdAt: string },
): OverrideSnapshot => ({
  id: partial.id,
  overrideId: null,
  scopeType: 'stage',
  scopeId: 'f1::s1',
  layer: 'stage',
  payload: {},
  isActive: true,
  action: 'upsert',
  note: null,
  createdBy: null,
  createdAt: partial.createdAt,
  ...partial,
});

describe('groupSnapshotsByBatch', () => {
  it('agrupa apenas snapshots com batchId no note', () => {
    const items: OverrideSnapshot[] = [
      snap({ id: '1', createdAt: '2025-01-01T10:00:00Z', note: '[batch_aaa] x' }),
      snap({ id: '2', createdAt: '2025-01-01T10:00:01Z', note: 'avulso' }),
      snap({ id: '3', createdAt: '2025-01-01T10:00:02Z', note: '[batch_aaa] y', scopeId: 'f2::s1' }),
      snap({ id: '4', createdAt: '2025-01-01T10:00:03Z', note: '[batch_bbb] z' }),
    ];
    const groups = groupSnapshotsByBatch(items);
    expect(groups.size).toBe(2);
    expect(groups.get('batch_aaa')?.length).toBe(2);
    expect(groups.get('batch_bbb')?.length).toBe(1);
  });
});

describe('buildRollbackPlan', () => {
  it('devolve plano vazio quando batchId não existe', () => {
    const plan = buildRollbackPlan([], 'batch_xxx');
    expect(plan.items).toEqual([]);
    expect(plan.dirtyCount).toBe(0);
  });

  it('para cada chave do lote acha o snapshot anterior', () => {
    const items: OverrideSnapshot[] = [
      snap({ id: 'prev', createdAt: '2025-01-01T08:00:00Z', payload: { goal: 'antigo' } }),
      snap({ id: 'b1', createdAt: '2025-01-01T09:00:00Z', note: '[batch_x] up', payload: { goal: 'novo' } }),
    ];
    const plan = buildRollbackPlan(items, 'batch_x');
    expect(plan.items.length).toBe(1);
    expect(plan.items[0].previousSnapshot?.id).toBe('prev');
    expect(plan.items[0].targetPayload).toEqual({ goal: 'antigo' });
    expect(plan.items[0].action).toBe('rollback');
    expect(plan.items[0].dirty).toBe(false);
  });

  it('marca action=deactivate quando não há snapshot anterior', () => {
    const items: OverrideSnapshot[] = [
      snap({ id: 'b1', createdAt: '2025-01-01T09:00:00Z', note: '[batch_x] up', payload: { goal: 'novo' } }),
    ];
    const plan = buildRollbackPlan(items, 'batch_x');
    expect(plan.items[0].action).toBe('deactivate');
    expect(plan.items[0].previousSnapshot).toBeNull();
    expect(plan.items[0].targetIsActive).toBe(false);
  });

  it('marca dirty=true quando há snapshot posterior ao lote para a mesma chave', () => {
    const items: OverrideSnapshot[] = [
      snap({ id: 'prev', createdAt: '2025-01-01T08:00:00Z' }),
      snap({ id: 'b1', createdAt: '2025-01-01T09:00:00Z', note: '[batch_x] up' }),
      snap({ id: 'after', createdAt: '2025-01-01T10:00:00Z', note: 'edição manual' }),
    ];
    const plan = buildRollbackPlan(items, 'batch_x');
    expect(plan.items[0].dirty).toBe(true);
    expect(plan.dirtyCount).toBe(1);
  });

  it('agrupa múltiplos itens do mesmo lote por chave única', () => {
    const items: OverrideSnapshot[] = [
      snap({ id: 'prevA', createdAt: '2025-01-01T07:00:00Z', scopeId: 'f1::s1' }),
      snap({ id: 'prevB', createdAt: '2025-01-01T07:00:00Z', scopeId: 'f2::s1' }),
      snap({ id: 'b1', createdAt: '2025-01-01T09:00:00Z', note: '[batch_x] a', scopeId: 'f1::s1' }),
      snap({ id: 'b2', createdAt: '2025-01-01T09:00:01Z', note: '[batch_x] b', scopeId: 'f2::s1' }),
    ];
    const plan = buildRollbackPlan(items, 'batch_x');
    expect(plan.items.length).toBe(2);
  });

  it('ordena items por escopo (org → funnel → stage)', () => {
    const items: OverrideSnapshot[] = [
      snap({ id: 'b1', scopeType: 'stage', scopeId: 'f1::s1', createdAt: '2025-01-01T09:00:00Z', note: '[batch_x]' }),
      snap({ id: 'b2', scopeType: 'org', scopeId: 'org-1', createdAt: '2025-01-01T09:00:01Z', note: '[batch_x]' }),
      snap({ id: 'b3', scopeType: 'funnel', scopeId: 'f1', createdAt: '2025-01-01T09:00:02Z', note: '[batch_x]' }),
    ];
    const plan = buildRollbackPlan(items, 'batch_x');
    expect(plan.items.map(i => i.scopeType)).toEqual(['org', 'funnel', 'stage']);
  });
});

describe('buildRollbackNote', () => {
  it('inclui batchId, escopo e marcador de sobreposição', () => {
    const item = {
      key: 'k',
      scopeType: 'stage' as const,
      scopeId: 'f1::s1',
      layer: 'stage' as const,
      batchSnapshot: snap({ id: 'b', createdAt: 'x' }),
      previousSnapshot: snap({ id: 'p', createdAt: 'y' }),
      targetPayload: {},
      targetIsActive: true,
      action: 'rollback' as const,
      dirty: true,
    };
    const note = buildRollbackNote('batch_zzz', item);
    expect(note).toContain('batch_zzz');
    expect(note).toContain('stage/f1::s1/stage');
    expect(note).toContain('restaurado');
    expect(note).toContain('sobrescreveu');
  });
});
