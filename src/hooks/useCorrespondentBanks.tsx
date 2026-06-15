import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Correspondentes bancários (tabela `correspondent_banks`) e seus atendentes
 * (`correspondent_attendants`), Fase 2C. A roleta dupla distribui análises de
 * crédito: 1) escolhe o banco pelos percentuais; 2) escolhe o atendente dentro
 * dele. Atendente pertence a exatamente um banco. CRUD restrito a admin (RLS).
 */
export interface CorrespondentBank {
  id: string;
  name: string;
  distributionPct: number;
  isActive: boolean;
  position: number;
  createdAt: string;
}

export interface CorrespondentAttendant {
  id: string;
  bankId: string;
  userId: string | null;
  name: string;
  email: string | null;
  phoneE164: string | null;
  distributionPct: number;
  isActive: boolean;
  position: number;
  createdAt: string;
}

type DBBankRow = {
  id: string;
  name: string;
  distribution_pct: number;
  is_active: boolean;
  position: number;
  created_at: string;
};

type DBAttendantRow = {
  id: string;
  bank_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone_e164: string | null;
  distribution_pct: number;
  is_active: boolean;
  position: number;
  created_at: string;
};

function rowToBank(r: DBBankRow): CorrespondentBank {
  return {
    id: r.id,
    name: r.name,
    distributionPct: r.distribution_pct ?? 0,
    isActive: r.is_active,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

function rowToAttendant(r: DBAttendantRow): CorrespondentAttendant {
  return {
    id: r.id,
    bankId: r.bank_id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    phoneE164: r.phone_e164,
    distributionPct: r.distribution_pct ?? 0,
    isActive: r.is_active,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

export interface BankInput {
  name: string;
  distributionPct?: number;
  isActive?: boolean;
}

export interface AttendantInput {
  bankId: string;
  userId?: string | null;
  name: string;
  email?: string | null;
  phoneE164?: string | null;
  distributionPct?: number;
  isActive?: boolean;
}

const toBankPatch = (i: BankInput) => ({
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.distributionPct !== undefined ? { distribution_pct: i.distributionPct } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

const toAttendantPatch = (i: AttendantInput) => ({
  ...(i.bankId !== undefined ? { bank_id: i.bankId } : {}),
  ...(i.userId !== undefined ? { user_id: i.userId } : {}),
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.email !== undefined ? { email: i.email } : {}),
  ...(i.phoneE164 !== undefined ? { phone_e164: i.phoneE164 } : {}),
  ...(i.distributionPct !== undefined ? { distribution_pct: i.distributionPct } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useCorrespondentBanks() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [banks, setBanks] = useState<CorrespondentBank[]>([]);
  const [attendants, setAttendants] = useState<CorrespondentAttendant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setBanks([]); setAttendants([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [banksRes, attRes] = await Promise.all([
        supabase.from('correspondent_banks').select('*').order('position', { ascending: true }),
        supabase.from('correspondent_attendants').select('*').order('position', { ascending: true }),
      ]);
      if (cancelled) return;
      if (banksRes.error) { setError(banksRes.error.message); setLoading(false); return; }
      if (attRes.error) { setError(attRes.error.message); setLoading(false); return; }
      setBanks((banksRes.data || []).map(r => rowToBank(r as DBBankRow)));
      setAttendants((attRes.data || []).map(r => rowToAttendant(r as DBAttendantRow)));
      setLoading(false);
    })();

    const bankChannel = supabase
      .channel(`corr-banks-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'correspondent_banks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBBankRow;
          setBanks(prev => prev.some(b => b.id === r.id) ? prev : [...prev, rowToBank(r)]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBBankRow;
          setBanks(prev => prev.map(b => b.id === r.id ? rowToBank(r) : b));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setBanks(prev => prev.filter(b => b.id !== r.id));
        }
      })
      .subscribe();

    const attChannel = supabase
      .channel(`corr-attendants-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'correspondent_attendants' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBAttendantRow;
          setAttendants(prev => prev.some(a => a.id === r.id) ? prev : [...prev, rowToAttendant(r)]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBAttendantRow;
          setAttendants(prev => prev.map(a => a.id === r.id ? rowToAttendant(r) : a));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setAttendants(prev => prev.filter(a => a.id !== r.id));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(bankChannel);
      supabase.removeChannel(attChannel);
    };
  }, [orgId]);

  const addBank = useCallback(async (input: BankInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { error } = await supabase.from('correspondent_banks').insert({
      organization_id: orgId,
      position: banks.length,
      ...toBankPatch(input),
    });
    if (error) { console.error('[useCorrespondentBanks] criar banco', error); return { error: error.message }; }
    return {};
  }, [orgId, banks.length]);

  const updateBank = useCallback(async (id: string, input: BankInput) => {
    const { error } = await supabase.from('correspondent_banks').update(toBankPatch(input)).eq('id', id);
    if (error) { console.error('[useCorrespondentBanks] atualizar banco', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteBank = useCallback(async (id: string) => {
    const { error } = await supabase.from('correspondent_banks').delete().eq('id', id);
    if (error) { console.error('[useCorrespondentBanks] excluir banco', error); return { error: error.message }; }
    return {};
  }, []);

  const addAttendant = useCallback(async (input: AttendantInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const countInBank = attendants.filter(a => a.bankId === input.bankId).length;
    const { error } = await supabase.from('correspondent_attendants').insert({
      organization_id: orgId,
      position: countInBank,
      ...toAttendantPatch(input),
    });
    if (error) { console.error('[useCorrespondentBanks] criar atendente', error); return { error: error.message }; }
    return {};
  }, [orgId, attendants]);

  const updateAttendant = useCallback(async (id: string, input: AttendantInput) => {
    const { error } = await supabase.from('correspondent_attendants').update(toAttendantPatch(input)).eq('id', id);
    if (error) { console.error('[useCorrespondentBanks] atualizar atendente', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteAttendant = useCallback(async (id: string) => {
    const { error } = await supabase.from('correspondent_attendants').delete().eq('id', id);
    if (error) { console.error('[useCorrespondentBanks] excluir atendente', error); return { error: error.message }; }
    return {};
  }, []);

  return {
    banks, attendants, loading, error,
    addBank, updateBank, deleteBank,
    addAttendant, updateAttendant, deleteAttendant,
  };
}

const CorrespondentBanksContext = createContext<ReturnType<typeof useCorrespondentBanks> | null>(null);

export function CorrespondentBanksProvider({ children }: { children: React.ReactNode }) {
  const value = useCorrespondentBanks();
  return <CorrespondentBanksContext.Provider value={value}>{children}</CorrespondentBanksContext.Provider>;
}

export function useCorrespondentBanksContext() {
  const ctx = useContext(CorrespondentBanksContext);
  if (!ctx) throw new Error('useCorrespondentBanksContext deve ser usado dentro de CorrespondentBanksProvider');
  return ctx;
}
