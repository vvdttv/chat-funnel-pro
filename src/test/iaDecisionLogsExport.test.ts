import { describe, it, expect } from 'vitest';
import { buildCSV, buildJSON, buildHeatmap, WEEKDAY_LABELS } from '@/lib/iaDecisionLogsExport';
import type { IADecisionLog } from '@/hooks/useIADecisionLogs';

const mk = (over: Partial<IADecisionLog>): IADecisionLog => ({
  id: 'id-1',
  created_at: '2025-04-21T10:30:00Z',
  deal_id: 'deal-1',
  funnel_id: 'funnel-1',
  stage_id: 'stage-1',
  playbook_code: 'pb_qual',
  detected_behavior_codes: ['silencio'],
  applied_rule_codes: ['regra_a'],
  intent: 'qualificar',
  tone: 'consultivo',
  action_taken: 'Reengajar com pergunta aberta, com vírgula, e "aspas"',
  outcome: 'success',
  context: { foo: 'bar' },
  archetype_code: 'arq_qual',
  status_overlay_code: null,
  applied_override_ids: [],
  context_tags: ['urgencia'],
  deal_status: 'open',
  ...over,
});

describe('iaDecisionLogsExport', () => {
  describe('buildCSV', () => {
    it('inclui header e escapa vírgulas/aspas/quebra de linha', () => {
      const csv = buildCSV([mk({})]);
      const [header, row] = csv.split('\n');
      expect(header).toContain('created_at');
      expect(header).toContain('action_taken');
      expect(header).toContain('context_json');
      // valor com vírgulas/aspas deve ficar entre aspas duplas e aspas duplicadas
      expect(row).toContain('"Reengajar com pergunta aberta, com vírgula, e ""aspas"""');
      // arrays joinados com pipe
      expect(row).toContain('silencio');
      expect(row).toContain('regra_a');
      // context serializado como JSON
      expect(row).toContain('{""foo"":""bar""}');
    });

    it('lida com valores nulos', () => {
      const csv = buildCSV([mk({ deal_id: null, intent: null, outcome: null })]);
      // não pode quebrar; deve emitir células vazias
      expect(csv.split('\n').length).toBe(2);
    });

    it('emite múltiplas linhas em ordem', () => {
      const csv = buildCSV([
        mk({ id: 'a', action_taken: 'aaa' }),
        mk({ id: 'b', action_taken: 'bbb' }),
      ]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain('aaa');
      expect(lines[2]).toContain('bbb');
    });
  });

  describe('buildJSON', () => {
    it('produz JSON válido', () => {
      const json = buildJSON([mk({}), mk({ id: 'id-2' })]);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('id-1');
      expect(parsed[1].id).toBe('id-2');
    });
  });

  describe('buildHeatmap', () => {
    it('agrega por dia da semana × hora local', () => {
      // Cria datas explícitas em LOCAL para evitar quirks de fuso ao testar
      const d1 = new Date(2025, 3, 21, 10, 0).toISOString(); // Seg 10h
      const d2 = new Date(2025, 3, 21, 10, 30).toISOString(); // Seg 10h
      const d3 = new Date(2025, 3, 22, 14, 0).toISOString(); // Ter 14h
      const hm = buildHeatmap([
        mk({ created_at: d1 }),
        mk({ created_at: d2 }),
        mk({ created_at: d3 }),
      ]);
      expect(hm.total).toBe(3);
      expect(hm.matrix[1][10]).toBe(2); // Seg 10h
      expect(hm.matrix[2][14]).toBe(1); // Ter 14h
      expect(hm.max).toBe(2);
    });

    it('matriz vazia quando sem logs', () => {
      const hm = buildHeatmap([]);
      expect(hm.total).toBe(0);
      expect(hm.max).toBe(0);
      expect(hm.matrix).toHaveLength(7);
      expect(hm.matrix[0]).toHaveLength(24);
      expect(hm.matrix.every(row => row.every(v => v === 0))).toBe(true);
    });

    it('ignora datas inválidas', () => {
      const hm = buildHeatmap([mk({ created_at: 'invalid-date' })]);
      expect(hm.total).toBe(1); // total reflete o tamanho do array
      expect(hm.max).toBe(0); // mas a célula não é incrementada
    });
  });

  it('expõe rótulos de dias em pt-BR', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe('Dom');
    expect(WEEKDAY_LABELS[6]).toBe('Sáb');
  });
});
