import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Agendamentos (`appointments`) e briefings (`broker_briefings`) da Fase 3A.
 * Usado pela visão do corretor (deals transferidos + agenda + briefing) e por
 * painéis admin. RLS já filtra: corretor vê só os seus; admin vê tudo.
 */
export type AppointmentStatus = 'proposed' | 'confirmed' | 'done' | 'cancelled' | 'no_show';
export type AppointmentChannel = 'presencial' | 'video' | 'ligacao';

export interface Appointment {
  id: string;
  iaDealId: string | null;
  brokerDealId: string | null;
  brokerId: string | null;
  kind: 'visita' | 'apresentacao';
  channel: AppointmentChannel;
  location: string | null;
  scheduledAt: string | null;
  status: AppointmentStatus;
  attempts: number;
  proposedSlots: Array<{ at: string }>;
  firstAttemptAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface BrokerBriefing {
  id: string;
  iaDealId: string | null;
  brokerDealId: string | null;
  brokerId: string | null;
  appointmentId: string | null;
  reason: string;
  fields: Record<string, unknown>;
  channelsSent: string[];
  createdAt: string;
}

type DBApptRow = {
  id: string;
  ia_deal_id: string | null;
  broker_deal_id: string | null;
  broker_id: string | null;
  kind: 'visita' | 'apresentacao';
  channel: AppointmentChannel;
  location: string | null;
  scheduled_at: string | null;
  status: AppointmentStatus;
  attempts: number;
  proposed_slots: unknown;
  first_attempt_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

type DBBriefingRow = {
  id: string;
  ia_deal_id: string | null;
  broker_deal_id: string | null;
  broker_id: string | null;
  appointment_id: string | null;
  reason: string;
  fields: unknown;
  channels_sent: unknown;
  created_at: string;
};

function rowToAppointment(r: DBApptRow): Appointment {
  return {
    id: r.id,
    iaDealId: r.ia_deal_id,
    brokerDealId: r.broker_deal_id,
    brokerId: r.broker_id,
    kind: r.kind,
    channel: r.channel,
    location: r.location,
    scheduledAt: r.scheduled_at,
    status: r.status,
    attempts: r.attempts ?? 0,
    proposedSlots: Array.isArray(r.proposed_slots) ? (r.proposed_slots as Array<{ at: string }>) : [],
    firstAttemptAt: r.first_attempt_at,
    confirmedAt: r.confirmed_at,
    createdAt: r.created_at,
  };
}

function rowToBriefing(r: DBBriefingRow): BrokerBriefing {
  return {
    id: r.id,
    iaDealId: r.ia_deal_id,
    brokerDealId: r.broker_deal_id,
    brokerId: r.broker_id,
    appointmentId: r.appointment_id,
    reason: r.reason,
    fields: (r.fields && typeof r.fields === 'object' && !Array.isArray(r.fields))
      ? (r.fields as Record<string, unknown>) : {},
    channelsSent: Array.isArray(r.channels_sent) ? (r.channels_sent as string[]) : [],
    createdAt: r.created_at,
  };
}

export function useAppointments() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [briefings, setBriefings] = useState<BrokerBriefing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setAppointments([]); setBriefings([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [apRes, brRes] = await Promise.all([
        supabase.from('appointments').select('*').order('created_at', { ascending: false }),
        supabase.from('broker_briefings').select('*').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setAppointments((apRes.data || []).map(r => rowToAppointment(r as DBApptRow)));
      setBriefings((brRes.data || []).map(r => rowToBriefing(r as DBBriefingRow)));
      setLoading(false);
    })();

    const apChannel = supabase
      .channel(`appointments-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBApptRow;
          setAppointments(prev => prev.some(a => a.id === r.id) ? prev : [rowToAppointment(r), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBApptRow;
          setAppointments(prev => prev.map(a => a.id === r.id ? rowToAppointment(r) : a));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setAppointments(prev => prev.filter(a => a.id !== r.id));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(apChannel);
    };
  }, [orgId]);

  const confirmAppointment = useCallback(async (
    appointmentId: string,
    patch: { scheduledAt?: string; channel?: AppointmentChannel; location?: string; status?: AppointmentStatus },
  ) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.scheduledAt !== undefined) dbPatch.scheduled_at = patch.scheduledAt;
    if (patch.channel !== undefined) dbPatch.channel = patch.channel;
    if (patch.location !== undefined) dbPatch.location = patch.location;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    const { error } = await supabase.from('appointments').update(dbPatch).eq('id', appointmentId);
    if (error) { console.error('[useAppointments] atualizar', error); return { error: error.message }; }
    return {};
  }, []);

  return { appointments, briefings, loading, confirmAppointment };
}

const AppointmentsContext = createContext<ReturnType<typeof useAppointments> | null>(null);

export function AppointmentsProvider({ children }: { children: React.ReactNode }) {
  const value = useAppointments();
  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

export function useAppointmentsContext() {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error('useAppointmentsContext deve ser usado dentro de AppointmentsProvider');
  return ctx;
}
