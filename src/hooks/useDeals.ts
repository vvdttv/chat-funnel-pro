import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Deal, Funnel } from '@/data/mockData';

type DBDealRow = {
  id: string;
  funnel_id: string;
  stage_id: string;
  lead_id: string;
  lead_name: string;
  property: string;
  property_code: string;
  value: number;
  status: string;
  secondary_contacts: unknown;
  created_at: string;
  updated_at: string;
};

/**
 * Resolve nome da etapa a partir do stage_id usando a lista de funis.
 * Fallback para o próprio stage_id caso o funil/etapa não esteja carregado.
 */
function stageNameFor(funnels: Funnel[], funnelId: string, stageId: string): string {
  const funnel = funnels.find(f => f.id === funnelId);
  const stage = funnel?.stages.find(s => s.id === stageId);
  return stage?.name || stageId;
}

function stageIdFor(funnels: Funnel[], funnelId: string, stageName: string): string | null {
  const funnel = funnels.find(f => f.id === funnelId);
  const stage = funnel?.stages.find(s => s.name === stageName);
  return stage?.id || null;
}

function rowToDeal(row: DBDealRow, funnels: Funnel[]): Deal {
  const funnel = funnels.find(f => f.id === row.funnel_id);
  const stage = funnel?.stages.find(s => s.id === row.stage_id);
  return {
    id: row.id,
    funnelId: row.funnel_id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    property: row.property,
    propertyCode: row.property_code,
    value: Number(row.value) || 0,
    stage: stage?.name || row.stage_id,
    probability: stage?.probability ?? 0,
    createdAt: row.created_at,
    secondaryContacts: Array.isArray(row.secondary_contacts)
      ? (row.secondary_contacts as { name: string; role: string }[])
      : [],
  };
}

/**
 * Hook que carrega/persiste oportunidades em Lovable Cloud.
 * Recebe a lista de funis para resolver stage_id <-> nome da etapa.
 */
export function useDeals(funnels: Funnel[]) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const funnelsRef = useRef(funnels);
  funnelsRef.current = funnels;

  // Re-mapeia stage names quando os funis carregam após os deals
  useEffect(() => {
    if (funnels.length === 0) return;
    setDeals(prev => prev.map(d => {
      const stage = funnels.find(f => f.id === d.funnelId)?.stages.find(s => s.name === d.stage || s.id === d.stage);
      return stage ? { ...d, stage: stage.name, probability: stage.probability } : d;
    }));
  }, [funnels]);

  // Load inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const mapped = (data || []).map(row => rowToDeal(row as DBDealRow, funnelsRef.current));
      setDeals(mapped);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const persistDeal = useCallback((deal: Deal) => {
    const existing = saveTimers.current.get(deal.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      const stageId = stageIdFor(funnelsRef.current, deal.funnelId, deal.stage) || deal.stage;
      const { error } = await supabase.from('deals').update({
        funnel_id: deal.funnelId,
        stage_id: stageId,
        lead_id: deal.leadId,
        lead_name: deal.leadName,
        property: deal.property,
        property_code: deal.propertyCode,
        value: deal.value,
        secondary_contacts: (deal.secondaryContacts || []) as unknown as any,
      }).eq('id', deal.id);
      if (error) console.error('[useDeals] erro ao salvar deal', deal.id, error);
      saveTimers.current.delete(deal.id);
    }, 400);
    saveTimers.current.set(deal.id, timer);
  }, []);

  const updateDeal = useCallback((updated: Deal) => {
    setDeals(prev => prev.map(d => d.id === updated.id ? updated : d));
    persistDeal(updated);
  }, [persistDeal]);

  const addDeal = useCallback(async (deal: Deal) => {
    setDeals(prev => [deal, ...prev]);
    const stageId = stageIdFor(funnelsRef.current, deal.funnelId, deal.stage) || deal.stage;
    const { error } = await supabase.from('deals').insert({
      id: deal.id,
      funnel_id: deal.funnelId,
      stage_id: stageId,
      lead_id: deal.leadId,
      lead_name: deal.leadName,
      property: deal.property,
      property_code: deal.propertyCode,
      value: deal.value,
      status: 'open',
      secondary_contacts: (deal.secondaryContacts || []) as unknown as any,
    });
    if (error) console.error('[useDeals] erro ao criar deal', error);
  }, []);

  const deleteDeal = useCallback(async (id: string) => {
    setDeals(prev => prev.filter(d => d.id !== id));
    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) console.error('[useDeals] erro ao deletar deal', error);
  }, []);

  /** Marca como ganho/perdido — atualiza status no banco. */
  const setDealStatus = useCallback(async (id: string, status: 'open' | 'won' | 'lost') => {
    const { error } = await supabase.from('deals').update({ status }).eq('id', id);
    if (error) console.error('[useDeals] erro ao atualizar status', error);
  }, []);

  return { deals, loading, error, updateDeal, addDeal, deleteDeal, setDealStatus };
}

// ========== Contexto global ==========

interface DealsContextValue {
  deals: Deal[];
  loading: boolean;
  updateDeal: (d: Deal) => void;
  addDeal: (d: Deal) => void;
  deleteDeal: (id: string) => void;
  setDealStatus: (id: string, status: 'open' | 'won' | 'lost') => void;
}

const noop = () => {};
const DealsContext = createContext<DealsContextValue>({
  deals: [],
  loading: true,
  updateDeal: noop,
  addDeal: noop,
  deleteDeal: noop,
  setDealStatus: noop,
});

export const DealsProvider = DealsContext.Provider;

export function useDealsContext() {
  return useContext(DealsContext);
}
