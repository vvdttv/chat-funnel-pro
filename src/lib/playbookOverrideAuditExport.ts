/**
 * Sprint 22 — Exportação CSV/JSON de snapshots + diff agregado de período.
 *
 * Núcleo PURO. Recebe a lista de snapshots já filtrados pela UI e devolve:
 *  - `buildSnapshotsCSV(snapshots, memberMap)` → string CSV
 *  - `buildSnapshotsJSON(snapshots)`           → string JSON pretty
 *  - `summarizeAuditPeriod(snapshots, ...)`    → contadores agregados por
 *     escopo, layer, ação, autor e funil — para o card "Resumo do período".
 */

import type { OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';
import type { PlaybookOverride } from '@/lib/playbookComposer';
import { extractBatchId } from '@/lib/playbookSuggestionBatch';

interface ExportCtx {
  memberMap: Map<string, string>;
}

const CSV_COLUMNS: Array<{ label: string; pick: (s: OverrideSnapshot, ctx: ExportCtx) => unknown }> = [
  { label: 'created_at', pick: s => s.createdAt },
  { label: 'scope_type', pick: s => s.scopeType },
  { label: 'scope_id', pick: s => s.scopeId },
  { label: 'layer', pick: s => s.layer },
  { label: 'action', pick: s => s.action },
  { label: 'is_active', pick: s => s.isActive },
  { label: 'author', pick: (s, ctx) => (s.createdBy ? ctx.memberMap.get(s.createdBy) ?? s.createdBy : '(sistema)') },
  { label: 'override_id', pick: s => s.overrideId ?? '' },
  { label: 'batch_id', pick: s => extractBatchId(s.note) ?? '' },
  { label: 'note', pick: s => s.note ?? '' },
  { label: 'goal', pick: s => s.payload.goal ?? '' },
  { label: 'persona', pick: s => s.payload.identity?.persona ?? '' },
  { label: 'tone', pick: s => s.payload.identity?.tone ?? '' },
  { label: 'mission', pick: s => s.payload.identity?.mission ?? '' },
  { label: 'identity_notes', pick: s => s.payload.identity?.identityNotes ?? '' },
  { label: 'success_criteria', pick: s => (s.payload.successCriteria ?? []).join('|') },
  { label: 'failure_criteria', pick: s => (s.payload.failureCriteria ?? []).join('|') },
  { label: 'expected_behaviors', pick: s => (s.payload.expectedBehaviorIds ?? []).join('|') },
  { label: 'rules_add', pick: s => (s.payload.rulesAdd ?? []).join('|') },
  { label: 'rules_remove', pick: s => (s.payload.rulesRemove ?? []).join('|') },
  { label: 'payload_json', pick: s => JSON.stringify(s.payload) },
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildSnapshotsCSV(
  snapshots: OverrideSnapshot[],
  memberMap: Map<string, string> = new Map(),
): string {
  const ctx: ExportCtx = { memberMap };
  const header = CSV_COLUMNS.map(c => c.label).join(',');
  const rows = snapshots.map(s =>
    CSV_COLUMNS.map(c => csvEscape(c.pick(s, ctx))).join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildSnapshotsJSON(snapshots: OverrideSnapshot[]): string {
  return JSON.stringify(snapshots, null, 2);
}

function tsSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
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

export function exportSnapshotsCSV(
  snapshots: OverrideSnapshot[],
  memberMap?: Map<string, string>,
) {
  triggerDownload(
    `playbook_overrides_history_${tsSuffix()}.csv`,
    buildSnapshotsCSV(snapshots, memberMap),
    'text/csv',
  );
}

export function exportSnapshotsJSON(snapshots: OverrideSnapshot[]) {
  triggerDownload(
    `playbook_overrides_history_${tsSuffix()}.json`,
    buildSnapshotsJSON(snapshots),
    'application/json',
  );
}

// ---------------- Resumo agregado ----------------

export interface AuditPeriodSummary {
  total: number;
  byScope: Array<[PlaybookOverride['scopeType'], number]>;
  byLayer: Array<[PlaybookOverride['layer'], number]>;
  byAction: Array<[OverrideSnapshot['action'], number]>;
  byAuthor: Array<[string, number]>;
  byFunnelId: Array<[string, number]>;
  batchCount: number;
  periodFrom?: string;
  periodTo?: string;
}

export function summarizeAuditPeriod(
  snapshots: OverrideSnapshot[],
  memberMap: Map<string, string> = new Map(),
): AuditPeriodSummary {
  const byScope = new Map<PlaybookOverride['scopeType'], number>();
  const byLayer = new Map<PlaybookOverride['layer'], number>();
  const byAction = new Map<OverrideSnapshot['action'], number>();
  const byAuthor = new Map<string, number>();
  const byFunnelId = new Map<string, number>();
  const batchIds = new Set<string>();

  let minTs: number | null = null;
  let maxTs: number | null = null;

  for (const s of snapshots) {
    byScope.set(s.scopeType, (byScope.get(s.scopeType) ?? 0) + 1);
    byLayer.set(s.layer, (byLayer.get(s.layer) ?? 0) + 1);
    byAction.set(s.action, (byAction.get(s.action) ?? 0) + 1);

    const author = s.createdBy ? memberMap.get(s.createdBy) ?? s.createdBy : '(sistema)';
    byAuthor.set(author, (byAuthor.get(author) ?? 0) + 1);

    let funnelId: string | null = null;
    if (s.scopeType === 'funnel') funnelId = s.scopeId;
    else if (s.scopeType === 'stage') funnelId = s.scopeId.split('::')[0] ?? null;
    if (funnelId) byFunnelId.set(funnelId, (byFunnelId.get(funnelId) ?? 0) + 1);

    const bid = extractBatchId(s.note);
    if (bid) batchIds.add(bid);

    const ts = new Date(s.createdAt).getTime();
    if (!Number.isNaN(ts)) {
      if (minTs === null || ts < minTs) minTs = ts;
      if (maxTs === null || ts > maxTs) maxTs = ts;
    }
  }

  return {
    total: snapshots.length,
    byScope: Array.from(byScope.entries()).sort((a, b) => b[1] - a[1]),
    byLayer: Array.from(byLayer.entries()).sort((a, b) => b[1] - a[1]),
    byAction: Array.from(byAction.entries()).sort((a, b) => b[1] - a[1]),
    byAuthor: Array.from(byAuthor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    byFunnelId: Array.from(byFunnelId.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    batchCount: batchIds.size,
    periodFrom: minTs ? new Date(minTs).toISOString() : undefined,
    periodTo: maxTs ? new Date(maxTs).toISOString() : undefined,
  };
}
