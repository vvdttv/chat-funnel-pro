import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Deal, Funnel } from '@/data/mockData';
import { useAuth } from '@/hooks/useAuth';
import {
  moveDealStageAtomic, changeDealStatusAtomic, type DealStatus,
} from '@/lib/dealTransitions';

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
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  lost_substage?: string | null;
  next_action_type?: string | null;
  next_action_at?: string | null;
  next_action_description?: string | null;
  last_activity_at?: string | null;
  last_activity_summary?: string | null;
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
    stageId: row.stage_id,
    probability: stage?.probability ?? 0,
    createdAt: row.created_at,
    assignedTo: row.assigned_to,
    secondaryContacts: Array.isArray(row.secondary_contacts)
      ? (row.secondary_contacts as { name: string; role: string }[])
      : [],
    status: (row.status as 'open' | 'won' | 'lost') || 'open',
    lostSubstage: row.lost_substage ?? null,
    nextActionType: row.next_action_type ?? null,
    nextActionAt: row.next_action_at ?? null,
    nextActionDescription: row.next_action_description ?? '',
    lastActivityAt: row.last_activity_at ?? null,
    lastActivitySummary: row.last_activity_summary ?? '',
  };
}

/**
 * Hook que carrega/persiste oportunidades em Lovable Cloud.
 * Recebe a lista de funis para resolver stage_id <-> nome da etapa.
 */
export function useDeals(funnels: Funnel[]) {
  const { profile, user, isAdmin } = useAuth();
  const orgId = profile?.organization_id;
  const userId = user?.id;
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

  // Load inicial + Realtime — só roda quando temos a org do usuário (RLS filtra)
  useEffect(() => {
    if (!orgId) { setDeals([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
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
      // Carrega tags por deal em batch (RPC get_deal_tags_json, escopada por
      // org). Best-effort: falha não derruba o board. Popula deal.tags p/ o
      // KanbanCard renderizar os badges.
      void (async () => {
        const results = await Promise.all(
          mapped.map(async (d) => {
            const { data: tagData } = await supabase.rpc('get_deal_tags_json', { p_deal_id: d.id });
            return [d.id, Array.isArray(tagData) ? (tagData as Deal['tags']) : []] as const;
          }),
        );
        if (cancelled) return;
        const byId = new Map(results);
        setDeals(prev => prev.map(d => byId.has(d.id) ? { ...d, tags: byId.get(d.id) } : d));
      })();
    })();

    // Subscription realtime — RLS continua filtrando o que cada usuário recebe
    const channel = supabase
      .channel(`deals-org-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as DBDealRow;
            setDeals(prev => prev.some(d => d.id === row.id) ? prev : [rowToDeal(row, funnelsRef.current), ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as DBDealRow;
            setDeals(prev => {
              // Se o deal saiu da visibilidade do usuário (reatribuído a outro corretor), RLS já fará o filtro
              // mas como o evento ainda chega, mantemos o registro se já existia.
              const exists = prev.some(d => d.id === row.id);
              if (!exists) return [rowToDeal(row, funnelsRef.current), ...prev];
              return prev.map(d => d.id === row.id ? { ...rowToDeal(row, funnelsRef.current) } : d);
            });
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as { id?: string };
            if (row?.id) setDeals(prev => prev.filter(d => d.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orgId]);

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
    if (!orgId || !userId) return;
    setDeals(prev => [deal, ...prev]);
    const stageId = stageIdFor(funnelsRef.current, deal.funnelId, deal.stage) || deal.stage;
    // Corretor sempre cria deals atribuídos a si mesmo; admin pode atribuir depois
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
      organization_id: orgId,
      assigned_to: userId,
    });
    if (error) console.error('[useDeals] erro ao criar deal', error);
  }, [orgId, userId]);

  const deleteDeal = useCallback(async (id: string) => {
    setDeals(prev => prev.filter(d => d.id !== id));
    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) console.error('[useDeals] erro ao deletar deal', error);
  }, []);

  /**
   * Marca como ganho/perdido — usa RPC atômica `change_deal_status` com
   * `SELECT FOR UPDATE` no servidor (evita corrida com outras abas).
   */
  const setDealStatus = useCallback(async (
    id: string,
    status: DealStatus,
    reason?: string,
    lostSubstage?: string,
  ) => {
    const { error } = await changeDealStatusAtomic(id, status, reason, lostSubstage);
    if (error) console.error('[useDeals] erro ao atualizar status', error);
    return { error };
  }, []);

  /**
   * Move um deal entre etapas usando RPC atômica `move_deal_stage` —
   * `SELECT FOR UPDATE` impede que dois usuários movam o mesmo deal ao
   * mesmo tempo. Atualiza o estado local apenas se a RPC sucedeu.
   */
  const moveDealStage = useCallback(async (
    id: string,
    newStageId: string,
    reason?: string,
  ) => {
    const { data, error } = await moveDealStageAtomic(id, newStageId, reason);
    if (error) {
      console.error('[useDeals] erro ao mover etapa', error);
      return { error };
    }
    if (data) {
      const stage = funnelsRef.current
        .flatMap(f => f.stages)
        .find(s => s.id === data.toStageId);
      if (stage) {
        setDeals(prev => prev.map(d =>
          d.id === id ? { ...d, stage: stage.name, probability: stage.probability } : d,
        ));
      }
    }
    return { error: null };
  }, []);

  /** Reatribui um deal a outro corretor (admin only — RLS valida). */
  const reassignDeal = useCallback(async (id: string, newAssignedTo: string) => {
    const { error } = await supabase.from('deals').update({ assigned_to: newAssignedTo }).eq('id', id);
    if (error) {
      console.error('[useDeals] erro ao reatribuir', error);
      return { error: error.message };
    }
    setDeals(prev => prev.map(d => d.id === id ? { ...d, assignedTo: newAssignedTo } : d));
    return { error: null };
  }, []);

  return { deals, loading, error, updateDeal, addDeal, deleteDeal, setDealStatus, moveDealStage, reassignDeal };
}

// ========== Contexto global ==========

interface DealsContextValue {
  deals: Deal[];
  loading: boolean;
  updateDeal: (d: Deal) => void;
  addDeal: (d: Deal) => void;
  deleteDeal: (id: string) => void;
  setDealStatus: (id: string, status: DealStatus, reason?: string, lostSubstage?: string) => Promise<{ error: string | null }>;
  moveDealStage: (id: string, newStageId: string, reason?: string) => Promise<{ error: string | null }>;
  reassignDeal: (id: string, newAssignedTo: string) => Promise<{ error: string | null }>;
}

const noop = () => {};
const DealsContext = createContext<DealsContextValue>({
  deals: [],
  loading: true,
  updateDeal: noop,
  addDeal: noop,
  deleteDeal: noop,
  setDealStatus: async () => ({ error: null }),
  moveDealStage: async () => ({ error: null }),
  reassignDeal: async () => ({ error: null }),
});

export const DealsProvider = DealsContext.Provider;

export function useDealsContext() {
  return useContext(DealsContext);
}
