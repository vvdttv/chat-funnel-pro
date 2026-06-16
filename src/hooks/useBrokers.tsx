import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Corretores (`broker_profiles`) e sua disponibilidade semanal
 * (`broker_availability`), Fase 3A. A roleta de corretores distribui as
 * transferências de leads aprovados pelos percentuais. CRUD restrito a admin
 * (RLS). A agenda alimenta a proposta de horários ("mais breve possível").
 */
export type BrokerChannel = 'presencial' | 'video' | 'ligacao';

export interface Broker {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  phoneE164: string | null;
  wahaSession: string | null;
  distributionPct: number;
  channels: BrokerChannel[];
  isActive: boolean;
  position: number;
  createdAt: string;
}

export interface BrokerAvailability {
  id: string;
  brokerId: string;
  weekday: number;       // 0=domingo … 6=sábado
  startTime: string;     // 'HH:MM'
  endTime: string;       // 'HH:MM'
  isActive: boolean;
}

type DBBrokerRow = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone_e164: string | null;
  waha_session: string | null;
  distribution_pct: number;
  channels: unknown;
  is_active: boolean;
  position: number;
  created_at: string;
};

type DBAvailabilityRow = {
  id: string;
  broker_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

const CHANNELS: BrokerChannel[] = ['presencial', 'video', 'ligacao'];

function toChannels(v: unknown): BrokerChannel[] {
  if (!Array.isArray(v)) return ['presencial', 'video', 'ligacao'];
  return v.filter((c): c is BrokerChannel => CHANNELS.includes(c as BrokerChannel));
}

function rowToBroker(r: DBBrokerRow): Broker {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    phoneE164: r.phone_e164,
    wahaSession: r.waha_session,
    distributionPct: r.distribution_pct ?? 0,
    channels: toChannels(r.channels),
    isActive: r.is_active,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

function rowToAvailability(r: DBAvailabilityRow): BrokerAvailability {
  return {
    id: r.id,
    brokerId: r.broker_id,
    weekday: r.weekday,
    startTime: (r.start_time ?? '').slice(0, 5),
    endTime: (r.end_time ?? '').slice(0, 5),
    isActive: r.is_active,
  };
}

export interface BrokerInput {
  name: string;
  email?: string | null;
  phoneE164?: string | null;
  wahaSession?: string | null;
  userId?: string | null;
  distributionPct?: number;
  channels?: BrokerChannel[];
  isActive?: boolean;
}

export interface AvailabilityInput {
  brokerId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

const toBrokerPatch = (i: BrokerInput) => ({
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.email !== undefined ? { email: i.email } : {}),
  ...(i.phoneE164 !== undefined ? { phone_e164: i.phoneE164 } : {}),
  ...(i.wahaSession !== undefined ? { waha_session: i.wahaSession } : {}),
  ...(i.userId !== undefined ? { user_id: i.userId } : {}),
  ...(i.distributionPct !== undefined ? { distribution_pct: i.distributionPct } : {}),
  ...(i.channels !== undefined ? { channels: i.channels } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useBrokers() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [availability, setAvailability] = useState<BrokerAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setBrokers([]); setAvailability([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [bRes, aRes] = await Promise.all([
        supabase.from('broker_profiles').select('*').order('position', { ascending: true }),
        supabase.from('broker_availability').select('*').order('weekday', { ascending: true }),
      ]);
      if (cancelled) return;
      if (bRes.error) { setError(bRes.error.message); setLoading(false); return; }
      if (aRes.error) { setError(aRes.error.message); setLoading(false); return; }
      setBrokers((bRes.data || []).map(r => rowToBroker(r as DBBrokerRow)));
      setAvailability((aRes.data || []).map(r => rowToAvailability(r as DBAvailabilityRow)));
      setLoading(false);
    })();

    const bChannel = supabase
      .channel(`brokers-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broker_profiles' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBBrokerRow;
          setBrokers(prev => prev.some(b => b.id === r.id) ? prev : [...prev, rowToBroker(r)]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBBrokerRow;
          setBrokers(prev => prev.map(b => b.id === r.id ? rowToBroker(r) : b));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setBrokers(prev => prev.filter(b => b.id !== r.id));
        }
      })
      .subscribe();

    const aChannel = supabase
      .channel(`broker-avail-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broker_availability' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBAvailabilityRow;
          setAvailability(prev => prev.some(a => a.id === r.id) ? prev : [...prev, rowToAvailability(r)]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBAvailabilityRow;
          setAvailability(prev => prev.map(a => a.id === r.id ? rowToAvailability(r) : a));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setAvailability(prev => prev.filter(a => a.id !== r.id));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(bChannel);
      supabase.removeChannel(aChannel);
    };
  }, [orgId]);

  const addBroker = useCallback(async (input: BrokerInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { error } = await supabase.from('broker_profiles').insert({
      organization_id: orgId,
      position: brokers.length,
      ...toBrokerPatch(input),
    });
    if (error) { console.error('[useBrokers] criar corretor', error); return { error: error.message }; }
    return {};
  }, [orgId, brokers.length]);

  const updateBroker = useCallback(async (id: string, input: BrokerInput) => {
    const { error } = await supabase.from('broker_profiles').update(toBrokerPatch(input)).eq('id', id);
    if (error) { console.error('[useBrokers] atualizar corretor', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteBroker = useCallback(async (id: string) => {
    const { error } = await supabase.from('broker_profiles').delete().eq('id', id);
    if (error) { console.error('[useBrokers] excluir corretor', error); return { error: error.message }; }
    return {};
  }, []);

  const addAvailability = useCallback(async (input: AvailabilityInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { error } = await supabase.from('broker_availability').insert({
      organization_id: orgId,
      broker_id: input.brokerId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
      is_active: input.isActive ?? true,
    });
    if (error) { console.error('[useBrokers] criar disponibilidade', error); return { error: error.message }; }
    return {};
  }, [orgId]);

  const deleteAvailability = useCallback(async (id: string) => {
    const { error } = await supabase.from('broker_availability').delete().eq('id', id);
    if (error) { console.error('[useBrokers] excluir disponibilidade', error); return { error: error.message }; }
    return {};
  }, []);

  return {
    brokers, availability, loading, error,
    addBroker, updateBroker, deleteBroker,
    addAvailability, deleteAvailability,
  };
}

const BrokersContext = createContext<ReturnType<typeof useBrokers> | null>(null);

export function BrokersProvider({ children }: { children: React.ReactNode }) {
  const value = useBrokers();
  return <BrokersContext.Provider value={value}>{children}</BrokersContext.Provider>;
}

export function useBrokersContext() {
  const ctx = useContext(BrokersContext);
  if (!ctx) throw new Error('useBrokersContext deve ser usado dentro de BrokersProvider');
  return ctx;
}
