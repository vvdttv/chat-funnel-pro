/**
 * Sprint 15 — Diff visual entre versões de `PlaybookOverride.payload`.
 *
 * Função PURA. Recebe payload anterior e atual e devolve uma lista
 * normalizada de mudanças por campo, com tipo (`added` | `removed` |
 * `changed`), facilitando renderização inline (badges/highlight) sem
 * acoplar lógica visual.
 *
 * Para arrays (successCriteria/failureCriteria/expectedBehaviorIds),
 * detecta itens adicionados e removidos individualmente.
 * Para `identity`, faz diff por subcampo.
 * Para escalares (`goal`), troca direta.
 */

import type { PlaybookOverride } from './playbookComposer';

type Payload = PlaybookOverride['payload'];

export type DiffChangeKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  /** Caminho legível, ex.: 'goal' | 'identity.persona' | 'successCriteria' */
  path: string;
  kind: DiffChangeKind;
  /** Para arrays: itens adicionados ou removidos; null caso contrário. */
  arrayDelta?: { added: string[]; removed: string[] };
  before: unknown;
  after: unknown;
}

const ARRAY_FIELDS: Array<keyof Payload> = [
  'successCriteria',
  'failureCriteria',
  'expectedBehaviorIds',
  'rulesAdd',
  'rulesRemove',
];

const IDENTITY_FIELDS: Array<keyof NonNullable<Payload['identity']>> = [
  'persona',
  'tone',
  'mission',
  'identityNotes',
];

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' ||
  (Array.isArray(v) && v.length === 0);

const arrDiff = (a: string[] = [], b: string[] = []) => {
  const sa = new Set(a); const sb = new Set(b);
  return {
    added: b.filter(x => !sa.has(x)),
    removed: a.filter(x => !sb.has(x)),
  };
};

export function buildPayloadDiff(before: Payload | undefined, after: Payload | undefined): DiffEntry[] {
  const a = before ?? {};
  const b = after ?? {};
  const out: DiffEntry[] = [];

  // goal (escalar)
  if ((a.goal ?? '') !== (b.goal ?? '')) {
    const beforeEmpty = isEmpty(a.goal);
    const afterEmpty = isEmpty(b.goal);
    out.push({
      path: 'goal',
      kind: beforeEmpty ? 'added' : afterEmpty ? 'removed' : 'changed',
      before: a.goal ?? null,
      after: b.goal ?? null,
    });
  }

  // identity (objeto)
  for (const f of IDENTITY_FIELDS) {
    const va = a.identity?.[f] ?? '';
    const vb = b.identity?.[f] ?? '';
    if (va !== vb) {
      out.push({
        path: `identity.${f}`,
        kind: isEmpty(va) ? 'added' : isEmpty(vb) ? 'removed' : 'changed',
        before: va || null,
        after: vb || null,
      });
    }
  }

  // arrays
  for (const f of ARRAY_FIELDS) {
    const va = (a[f] as string[] | undefined) ?? [];
    const vb = (b[f] as string[] | undefined) ?? [];
    const delta = arrDiff(va, vb);
    if (delta.added.length === 0 && delta.removed.length === 0) continue;
    const kind: DiffChangeKind =
      va.length === 0 ? 'added' : vb.length === 0 ? 'removed' : 'changed';
    out.push({
      path: f as string,
      kind,
      arrayDelta: delta,
      before: va,
      after: vb,
    });
  }

  return out;
}

/** Resumo curto: "3 alterações (1 adicionada, 1 removida, 1 alterada)" */
export function summarizeDiff(entries: DiffEntry[]): string {
  if (entries.length === 0) return 'sem alterações';
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const e of entries) counts[e.kind]++;
  const parts: string[] = [];
  if (counts.added) parts.push(`${counts.added} adicionada${counts.added > 1 ? 's' : ''}`);
  if (counts.removed) parts.push(`${counts.removed} removida${counts.removed > 1 ? 's' : ''}`);
  if (counts.changed) parts.push(`${counts.changed} alterada${counts.changed > 1 ? 's' : ''}`);
  return `${entries.length} alteraç${entries.length > 1 ? 'ões' : 'ão'} (${parts.join(', ')})`;
}
