/**
 * Helpers para exportar ia_decision_logs filtrados em CSV/JSON
 * e calcular o heatmap temporal (dia da semana × hora do dia).
 *
 * Tudo client-side: opera sobre o array já carregado pelo hook
 * useIADecisionLogs (respeita filtros e RLS aplicados).
 */

import type { IADecisionLog } from '@/hooks/useIADecisionLogs';

const CSV_COLUMNS: Array<{ key: keyof IADecisionLog | 'context_json'; label: string }> = [
  { key: 'created_at', label: 'created_at' },
  { key: 'deal_id', label: 'deal_id' },
  { key: 'deal_status', label: 'deal_status' },
  { key: 'funnel_id', label: 'funnel_id' },
  { key: 'stage_id', label: 'stage_id' },
  { key: 'playbook_code', label: 'playbook_code' },
  { key: 'archetype_code', label: 'archetype_code' },
  { key: 'status_overlay_code', label: 'status_overlay_code' },
  { key: 'intent', label: 'intent' },
  { key: 'tone', label: 'tone' },
  { key: 'outcome', label: 'outcome' },
  { key: 'action_taken', label: 'action_taken' },
  { key: 'detected_behavior_codes', label: 'detected_behaviors' },
  { key: 'applied_rule_codes', label: 'applied_rules' },
  { key: 'applied_override_ids', label: 'applied_overrides' },
  { key: 'context_tags', label: 'context_tags' },
  { key: 'context_json', label: 'context_json' },
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (Array.isArray(value)) s = value.join('|');
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCSV(logs: IADecisionLog[]): string {
  const header = CSV_COLUMNS.map(c => c.label).join(',');
  const rows = logs.map(log =>
    CSV_COLUMNS.map(c => {
      if (c.key === 'context_json') return csvEscape(log.context);
      return csvEscape(log[c.key]);
    }).join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildJSON(logs: IADecisionLog[]): string {
  return JSON.stringify(logs, null, 2);
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function tsSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function exportLogsCSV(logs: IADecisionLog[]) {
  triggerDownload(`ia_decision_logs_${tsSuffix()}.csv`, buildCSV(logs), 'text/csv');
}

export function exportLogsJSON(logs: IADecisionLog[]) {
  triggerDownload(`ia_decision_logs_${tsSuffix()}.json`, buildJSON(logs), 'application/json');
}

// ---------------- Heatmap temporal ----------------

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Gera matriz 7×24 (dia da semana × hora do dia) com a contagem de
 * decisões IA em cada célula, mais o pico encontrado.
 */
export function buildHeatmap(logs: IADecisionLog[]): {
  matrix: number[][]; // [weekday 0..6][hour 0..23]
  max: number;
  total: number;
} {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const log of logs) {
    const d = new Date(log.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const w = d.getDay();
    const h = d.getHours();
    matrix[w][h] += 1;
    if (matrix[w][h] > max) max = matrix[w][h];
  }
  return { matrix, max, total: logs.length };
}
