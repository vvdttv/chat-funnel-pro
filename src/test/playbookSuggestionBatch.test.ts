import { describe, it, expect } from 'vitest';
import {
  buildBatchPlan,
  buildBatchNote,
  extractBatchId,
  generateBatchId,
} from '@/lib/playbookSuggestionBatch';
import type { OverrideSuggestion } from '@/lib/playbookOverrideSuggestions';
import type { PlaybookOverride } from '@/lib/playbookComposer';

const sug = (over: Partial<OverrideSuggestion> = {}): OverrideSuggestion => ({
  id: over.id ?? 'lb_problematic:stage:f1::s1:stage:LB_X',
  kind: over.kind ?? 'lb_problematic',
  scope: over.scope ?? { type: 'stage', id: 'f1::s1' },
  layer: over.layer ?? 'stage',
  payload: over.payload ?? { identity: { identityNotes: 'cuidado com LB_X' } },
  title: over.title ?? 'LB_X arriscado',
  rationale: over.rationale ?? 'rate alto',
  severity: over.severity ?? 'warning',
  evidence: over.evidence ?? { sample: 10, failureRate: 0.7, successRate: 0.1 },
});

const existing = (
  scopeType: PlaybookOverride['scopeType'],
  scopeId: string,
  layer: PlaybookOverride['layer'],
  payload: PlaybookOverride['payload'],
  isActive = true,
) => ({ scopeType, scopeId, layer, payload, isActive });

describe('playbookSuggestionBatch', () => {
  describe('generateBatchId', () => {
    it('gera ids únicos com prefixo batch_', () => {
      const a = generateBatchId();
      const b = generateBatchId();
      expect(a).toMatch(/^batch_/);
      expect(b).toMatch(/^batch_/);
      expect(a).not.toBe(b);
    });

    it('aceita data injetada para determinismo', () => {
      const id = generateBatchId(new Date('2026-04-22T10:30:00Z'));
      expect(id).toMatch(/^batch_260422103000_/);
    });
  });

  describe('buildBatchPlan', () => {
    it('agrupa sugestões pelo mesmo (scope, layer)', () => {
      const s1 = sug({
        id: 'a', payload: { goal: 'novo objetivo' },
      });
      const s2 = sug({
        id: 'b', payload: { identity: { tone: 'duro' } },
      });
      const plan = buildBatchPlan({
        suggestions: [s1, s2],
        existingOverrides: [],
        batchId: 'batch_test',
      });
      expect(plan.batchId).toBe('batch_test');
      expect(plan.totalSuggestions).toBe(2);
      expect(plan.totalWrites).toBe(1);
      expect(plan.items[0].mergedPayload.goal).toBe('novo objetivo');
      expect(plan.items[0].mergedPayload.identity?.tone).toBe('duro');
      expect(plan.items[0].suggestions).toHaveLength(2);
    });

    it('mantém escopos distintos como itens separados', () => {
      const a = sug({ id: 'a', scope: { type: 'stage', id: 'f1::s1' } });
      const b = sug({ id: 'b', scope: { type: 'stage', id: 'f1::s2' } });
      const c = sug({ id: 'c', scope: { type: 'funnel', id: 'f1' } });
      const plan = buildBatchPlan({ suggestions: [a, b, c], existingOverrides: [] });
      expect(plan.totalWrites).toBe(3);
      // Ordenação: funnel antes de stage
      expect(plan.items[0].scopeType).toBe('funnel');
      expect(plan.items.slice(1).every(i => i.scopeType === 'stage')).toBe(true);
    });

    it('respeita payload existente — só preenche campos vazios', () => {
      const s = sug({ payload: { goal: 'novo objetivo sugerido' } });
      const plan = buildBatchPlan({
        suggestions: [s],
        existingOverrides: [existing('stage', 'f1::s1', 'stage', { goal: 'objetivo manual' })],
      });
      expect(plan.items[0].mergedPayload.goal).toBe('objetivo manual');
      expect(plan.items[0].existingPayload?.goal).toBe('objetivo manual');
    });

    it('faz união de arrays sem duplicatas', () => {
      const s1 = sug({ id: 'a', payload: { successCriteria: ['c1', 'c2'] } });
      const s2 = sug({ id: 'b', payload: { successCriteria: ['c2', 'c3'] } });
      const plan = buildBatchPlan({
        suggestions: [s1, s2],
        existingOverrides: [existing('stage', 'f1::s1', 'stage', { successCriteria: ['c0'] })],
      });
      expect(plan.items[0].mergedPayload.successCriteria).toEqual(['c0', 'c1', 'c2', 'c3']);
    });

    it('ignora overrides desativados ao buscar existing', () => {
      const s = sug({ payload: { goal: 'sugerido' } });
      const plan = buildBatchPlan({
        suggestions: [s],
        existingOverrides: [existing('stage', 'f1::s1', 'stage', { goal: 'velho' }, false)],
      });
      expect(plan.items[0].existingPayload).toBeUndefined();
      expect(plan.items[0].mergedPayload.goal).toBe('sugerido');
    });

    it('summaryTitle reflete múltiplas sugestões', () => {
      const s1 = sug({ id: 'a', title: 'um' });
      const s2 = sug({ id: 'b', title: 'dois' });
      const plan = buildBatchPlan({ suggestions: [s1, s2], existingOverrides: [] });
      expect(plan.items[0].summaryTitle).toMatch(/2 sugestões fundidas/);
    });

    it('summaryTitle único reusa o título da sugestão', () => {
      const plan = buildBatchPlan({
        suggestions: [sug({ title: 'unico título' })],
        existingOverrides: [],
      });
      expect(plan.items[0].summaryTitle).toBe('unico título');
    });

    it('plano vazio quando não há sugestões', () => {
      const plan = buildBatchPlan({ suggestions: [], existingOverrides: [] });
      expect(plan.items).toEqual([]);
      expect(plan.totalWrites).toBe(0);
      expect(plan.totalSuggestions).toBe(0);
    });
  });

  describe('buildBatchNote / extractBatchId', () => {
    it('inclui o batchId em formato parseável', () => {
      const plan = buildBatchPlan({
        suggestions: [sug({ id: 'lb_problematic:stage:f1::s1:stage:LB_X' })],
        existingOverrides: [],
        batchId: 'batch_abc123',
      });
      const note = buildBatchNote(plan.batchId, plan.items[0], plan.totalWrites);
      expect(note.startsWith('[batch_abc123]')).toBe(true);
      expect(extractBatchId(note)).toBe('batch_abc123');
    });

    it('extractBatchId retorna null para notas avulsas', () => {
      expect(extractBatchId(null)).toBeNull();
      expect(extractBatchId('auto-sugestão (lb_problematic) — algo')).toBeNull();
      expect(extractBatchId('')).toBeNull();
    });

    it('formato lote (N escopos) só quando totalWrites > 1', () => {
      const plan = buildBatchPlan({
        suggestions: [
          sug({ id: 'a', scope: { type: 'stage', id: 'f1::s1' } }),
          sug({ id: 'b', scope: { type: 'stage', id: 'f1::s2' } }),
        ],
        existingOverrides: [],
        batchId: 'batch_x',
      });
      const note1 = buildBatchNote(plan.batchId, plan.items[0], plan.totalWrites);
      expect(note1).toContain('(2 escopos)');
    });
  });
});
