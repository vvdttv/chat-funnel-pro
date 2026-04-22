/**
 * Sprint 16 — Comparação arbitrária entre snapshots de escopos distintos.
 *
 * Valida que `buildPayloadDiff` opera corretamente quando os payloads vêm de
 * escopos diferentes (ex.: snapshot de funil A vs snapshot de etapa do funil
 * B). O diff é puramente sobre o `payload` — escopo é metadado de exibição.
 *
 * Também testa a normalização de filtros usados no browser (escopo, layer,
 * ação, autor, data) via lógica equivalente ao componente.
 */

import { describe, it, expect } from 'vitest';
import { buildPayloadDiff, summarizeDiff } from '@/lib/playbookOverrideDiff';
import type { PlaybookOverride } from '@/lib/playbookComposer';

type Payload = PlaybookOverride['payload'];

describe('Sprint 16 — comparação cross-scope', () => {
  it('detecta diferenças entre payload de funnel e payload de stage', () => {
    const funnelPayload: Payload = {
      goal: 'maximizar conversão',
      identity: { tone: 'consultivo' },
      successCriteria: ['follow-up em 24h'],
    };
    const stagePayload: Payload = {
      goal: 'fechar contraproposta',
      identity: { tone: 'consultivo', persona: 'negociador sênior' },
      successCriteria: ['follow-up em 24h', 'aceite formal'],
    };

    const d = buildPayloadDiff(funnelPayload, stagePayload);
    const paths = d.map(e => e.path).sort();
    expect(paths).toEqual(['goal', 'identity.persona', 'successCriteria']);

    const goalEntry = d.find(e => e.path === 'goal')!;
    expect(goalEntry.kind).toBe('changed');
    expect(goalEntry.before).toBe('maximizar conversão');
    expect(goalEntry.after).toBe('fechar contraproposta');

    const personaEntry = d.find(e => e.path === 'identity.persona')!;
    expect(personaEntry.kind).toBe('added');

    const successEntry = d.find(e => e.path === 'successCriteria')!;
    expect(successEntry.arrayDelta).toEqual({ added: ['aceite formal'], removed: [] });
  });

  it('produz diff vazio para payloads idênticos mesmo em escopos diferentes', () => {
    const p: Payload = { goal: 'x', expectedBehaviorIds: ['LB1', 'LB2'] };
    expect(buildPayloadDiff(p, p)).toEqual([]);
  });

  it('summarize cobre o caso "rollback equivalente" (sem diferenças)', () => {
    expect(summarizeDiff([])).toBe('sem alterações');
  });

  it('detecta remoção total ao comparar com payload vazio', () => {
    const before: Payload = {
      goal: 'g',
      identity: { persona: 'p' },
      failureCriteria: ['f1', 'f2'],
    };
    const d = buildPayloadDiff(before, {});
    const paths = d.map(e => e.path).sort();
    expect(paths).toEqual(['failureCriteria', 'goal', 'identity.persona']);
    expect(d.every(e => e.kind === 'removed')).toBe(true);
  });
});

describe('Sprint 16 — filtros do browser (lógica)', () => {
  type Snap = {
    scopeType: PlaybookOverride['scopeType'];
    scopeId: string;
    layer: PlaybookOverride['layer'];
    action: 'upsert' | 'deactivate' | 'rollback';
    createdBy: string | null;
    createdAt: string;
  };

  // Réplica enxuta do filtro do componente para testar predicate
  const applyFilters = (
    items: Snap[],
    f: {
      scope?: 'all' | Snap['scopeType'];
      layer?: 'all' | Snap['layer'];
      action?: 'all' | Snap['action'];
      author?: string; // 'all' | '__none__' | userId
      funnel?: string; // 'all' | funnelId
      from?: string;
      to?: string;
    },
  ) => items.filter(s => {
    if (f.scope && f.scope !== 'all' && s.scopeType !== f.scope) return false;
    if (f.layer && f.layer !== 'all' && s.layer !== f.layer) return false;
    if (f.action && f.action !== 'all' && s.action !== f.action) return false;
    if (f.author && f.author !== 'all') {
      if (f.author === '__none__' && s.createdBy) return false;
      if (f.author !== '__none__' && s.createdBy !== f.author) return false;
    }
    if (f.funnel && f.funnel !== 'all') {
      if (s.scopeType === 'org') return false;
      if (s.scopeType === 'funnel' && s.scopeId !== f.funnel) return false;
      if (s.scopeType === 'stage' && s.scopeId.split('::')[0] !== f.funnel) return false;
    }
    if (f.from) {
      const ts = new Date(s.createdAt).getTime();
      if (ts < new Date(f.from + 'T00:00:00').getTime()) return false;
    }
    if (f.to) {
      const ts = new Date(s.createdAt).getTime();
      if (ts > new Date(f.to + 'T23:59:59').getTime()) return false;
    }
    return true;
  });

  const items: Snap[] = [
    { scopeType: 'org', scopeId: 'org1', layer: 'stage', action: 'upsert', createdBy: 'u1', createdAt: '2026-01-10T10:00:00Z' },
    { scopeType: 'funnel', scopeId: 'fA', layer: 'overlay', action: 'rollback', createdBy: 'u2', createdAt: '2026-01-15T10:00:00Z' },
    { scopeType: 'stage', scopeId: 'fA::s1', layer: 'stage', action: 'deactivate', createdBy: null, createdAt: '2026-01-20T10:00:00Z' },
    { scopeType: 'stage', scopeId: 'fB::s2', layer: 'stage', action: 'upsert', createdBy: 'u1', createdAt: '2026-01-25T10:00:00Z' },
  ];

  it('filtra por escopo', () => {
    expect(applyFilters(items, { scope: 'stage' })).toHaveLength(2);
    expect(applyFilters(items, { scope: 'org' })).toHaveLength(1);
  });

  it('filtra por funil incluindo stages do mesmo funil', () => {
    const r = applyFilters(items, { funnel: 'fA' });
    expect(r).toHaveLength(2); // funnel fA + stage fA::s1
    expect(r.every(s => s.scopeType !== 'org')).toBe(true);
  });

  it('filtra por autor "__none__" (sem autor)', () => {
    const r = applyFilters(items, { author: '__none__' });
    expect(r).toHaveLength(1);
    expect(r[0].createdBy).toBeNull();
  });

  it('filtra por autor específico', () => {
    expect(applyFilters(items, { author: 'u1' })).toHaveLength(2);
  });

  it('filtra por intervalo de datas', () => {
    const r = applyFilters(items, { from: '2026-01-14', to: '2026-01-21' });
    expect(r).toHaveLength(2);
  });

  it('combina múltiplos filtros', () => {
    const r = applyFilters(items, { scope: 'stage', author: 'u1', funnel: 'fB' });
    expect(r).toHaveLength(1);
    expect(r[0].scopeId).toBe('fB::s2');
  });
});
