/**
 * Sprint 25 — Cenários do sandbox composicional persistentes.
 *
 * Sem migration disponível, usamos `localStorage` por organização para
 * salvar cenários nomeados que o admin construiu no `PlaybookFourColumnEditor`
 * (identidade + critérios + LBs esperados). Permite recarregar mais tarde
 * ou comparar com o playbook real produzido.
 *
 * Chave: `sandbox_scenarios::${orgId}` → JSON Array<SandboxScenario>.
 *
 * Sem dependências de rede; apenas leitura/escrita síncrona.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { PlaybookOverride } from '@/lib/playbookComposer';

export interface SandboxScenario {
  id: string;
  name: string;
  funnelId: string;
  stageId: string;
  status: 'open' | 'won' | 'lost';
  payload: PlaybookOverride['payload'];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const storageKey = (orgId: string) => `sandbox_scenarios::${orgId}`;

const safeParse = (raw: string | null): SandboxScenario[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const genId = () => `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function useSandboxScenarios(filter?: { funnelId?: string; stageId?: string }) {
  const { profile, user } = useAuth();
  const orgId = profile?.organization_id ?? '';
  const [items, setItems] = useState<SandboxScenario[]>([]);

  const reload = useCallback(() => {
    if (!orgId || typeof window === 'undefined') {
      setItems([]);
      return;
    }
    setItems(safeParse(window.localStorage.getItem(storageKey(orgId))));
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  const persist = useCallback((next: SandboxScenario[]) => {
    if (!orgId || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(next));
    setItems(next);
  }, [orgId]);

  const filtered = filter
    ? items.filter(s =>
        (!filter.funnelId || s.funnelId === filter.funnelId) &&
        (!filter.stageId || s.stageId === filter.stageId),
      )
    : items;

  const save = useCallback((args: {
    name: string;
    funnelId: string;
    stageId: string;
    status: SandboxScenario['status'];
    payload: PlaybookOverride['payload'];
  }): SandboxScenario => {
    const now = new Date().toISOString();
    const scenario: SandboxScenario = {
      id: genId(),
      name: args.name.trim() || 'cenário sem nome',
      funnelId: args.funnelId,
      stageId: args.stageId,
      status: args.status,
      payload: args.payload,
      createdBy: user?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    persist([scenario, ...items]);
    return scenario;
  }, [items, persist, user?.id]);

  const update = useCallback((id: string, patch: Partial<Pick<SandboxScenario, 'name' | 'payload' | 'status'>>) => {
    const next = items.map(s =>
      s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
    );
    persist(next);
  }, [items, persist]);

  const remove = useCallback((id: string) => {
    persist(items.filter(s => s.id !== id));
  }, [items, persist]);

  const exportAll = useCallback((): string => {
    return JSON.stringify(items, null, 2);
  }, [items]);

  return { items: filtered, all: items, reload, save, update, remove, exportAll };
}
