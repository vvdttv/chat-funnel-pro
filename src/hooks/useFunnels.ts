import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Funnel, FunnelStage } from '@/data/mockData';

/**
 * Hook que carrega/persiste a lista de funis em Lovable Cloud.
 * Sobrevive a reloads. Salva via debounce de 600ms a cada mudança.
 */
export function useFunnels() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('funnels')
        .select('*')
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const mapped: Funnel[] = (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        stages: (row.stages as unknown as FunnelStage[]) || [],
      }));
      setFunnels(mapped);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const persistFunnel = useCallback((funnel: Funnel, position: number) => {
    const existingTimer = saveTimers.current.get(funnel.id);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(async () => {
      const { error } = await supabase.from('funnels').upsert({
        id: funnel.id,
        name: funnel.name,
        description: funnel.description,
        icon: funnel.icon,
        color: funnel.color,
        stages: funnel.stages as unknown as any,
        position,
      });
      if (error) console.error('[useFunnels] erro ao salvar funil', funnel.id, error);
      saveTimers.current.delete(funnel.id);
    }, 600);
    saveTimers.current.set(funnel.id, timer);
  }, []);

  const updateFunnel = useCallback((updated: Funnel) => {
    setFunnels((prev) => {
      const next = prev.map((f) => (f.id === updated.id ? updated : f));
      const idx = next.findIndex((f) => f.id === updated.id);
      persistFunnel(updated, idx);
      return next;
    });
  }, [persistFunnel]);

  const addFunnel = useCallback(async (funnel: Funnel) => {
    setFunnels((prev) => {
      const position = prev.length;
      // dispara insert de forma assíncrona
      supabase.from('funnels').insert({
        id: funnel.id,
        name: funnel.name,
        description: funnel.description,
        icon: funnel.icon,
        color: funnel.color,
        stages: funnel.stages as unknown as any,
        position,
      }).then(({ error }) => {
        if (error) console.error('[useFunnels] erro ao criar funil', error);
      });
      return [...prev, funnel];
    });
  }, []);

  const deleteFunnel = useCallback(async (id: string) => {
    setFunnels((prev) => prev.filter((f) => f.id !== id));
    const { error } = await supabase.from('funnels').delete().eq('id', id);
    if (error) console.error('[useFunnels] erro ao deletar funil', error);
  }, []);

  return { funnels, loading, error, updateFunnel, addFunnel, deleteFunnel };
}

// ========== Contexto global (leitura compartilhada) ==========

interface FunnelsContextValue {
  funnels: Funnel[];
  loading: boolean;
}

const FunnelsContext = createContext<FunnelsContextValue>({ funnels: [], loading: true });

export const FunnelsProvider = FunnelsContext.Provider;

/** Lê funis do contexto. Use dentro de <FunnelsProvider value={...}>. */
export function useFunnelsContext() {
  return useContext(FunnelsContext);
}
