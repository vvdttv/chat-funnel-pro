import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Seguradoras / emissoras de garantia (tabela `insurers`) e seus atendentes
 * (`insurer_attendants`), Fase J-2b-4. Espelha o padrao de correspondent_banks/
 * _attendants: roleta dupla distribui analises de garantia entre seguradoras
 * por percentual e depois entre atendentes da seguradora. CRUD restrito a admin.
 */
export interface Insurer {
  id: string;
  name: string;
  cnpj: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  distributionPct: number;
  isActive: boolean;
  position: number;
  createdAt: string;
}

export interface InsurerAttendant {
  id: string;
  insurerId: string;
  userId: string | null;
  name: string;
  email: string | null;
  phoneE164: string | null;
  distributionPct: number;
  isActive: boolean;
  position: number;
  createdAt: string;
}

type DBInsurerRow = {
  id: string;
  name: string;
  cnpj: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  distribution_pct: number;
  is_active: boolean;
  position: number;
  created_at: string;
};

type DBAttendantRow = {
  id: string;
  insurer_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone_e164: string | null;
  distribution_pct: number;
  is_active: boolean;
  position: number;
  created_at: string;
};

function rowToInsurer(r: DBInsurerRow): Insurer {
  return {
    id: r.id,
    name: r.name,
    cnpj: r.cnpj,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    distributionPct: r.distribution_pct ?? 0,
    isActive: r.is_active,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

function rowToAttendant(r: DBAttendantRow): InsurerAttendant {
  return {
    id: r.id,
    insurerId: r.insurer_id,
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

export interface InsurerInput {
  name: string;
  cnpj?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  distributionPct?: number;
  isActive?: boolean;
}

export interface InsurerAttendantInput {
  insurerId: string;
  userId?: string | null;
  name: string;
  email?: string | null;
  phoneE164?: string | null;
  distributionPct?: number;
  isActive?: boolean;
}

const toInsurerPatch = (i: InsurerInput) => ({
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.cnpj !== undefined ? { cnpj: i.cnpj } : {}),
  ...(i.contactPhone !== undefined ? { contact_phone: i.contactPhone } : {}),
  ...(i.contactEmail !== undefined ? { contact_email: i.contactEmail } : {}),
  ...(i.distributionPct !== undefined ? { distribution_pct: i.distributionPct } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

const toAttendantPatch = (i: InsurerAttendantInput) => ({
  ...(i.insurerId !== undefined ? { insurer_id: i.insurerId } : {}),
  ...(i.userId !== undefined ? { user_id: i.userId } : {}),
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.email !== undefined ? { email: i.email } : {}),
  ...(i.phoneE164 !== undefined ? { phone_e164: i.phoneE164 } : {}),
  ...(i.distributionPct !== undefined ? { distribution_pct: i.distributionPct } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useInsurers() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [attendants, setAttendants] = useState<InsurerAttendant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setInsurers([]); setAttendants([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [insRes, attRes] = await Promise.all([
        supabase.from('insurers').select('*').order('position', { ascending: true }),
        supabase.from('insurer_attendants').select('*').order('position', { ascending: true }),
      ]);
      if (cancelled) return;
      if (insRes.error) console.error('[useInsurers] insurers', insRes.error);
      if (attRes.error) console.error('[useInsurers] attendants', attRes.error);
      setInsurers(((insRes.data as DBInsurerRow[]) || []).map(rowToInsurer));
      setAttendants(((attRes.data as DBAttendantRow[]) || []).map(rowToAttendant));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const addInsurer = useCallback(async (input: InsurerInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { data, error } = await supabase.from('insurers').insert({
      organization_id: orgId,
      ...toInsurerPatch(input),
    }).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setInsurers(prev => [...prev, rowToInsurer(data as DBInsurerRow)]);
    return {};
  }, [orgId]);

  const updateInsurer = useCallback(async (id: string, input: InsurerInput) => {
    const { data, error } = await supabase.from('insurers').update(toInsurerPatch(input)).eq('id', id).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setInsurers(prev => prev.map(i => i.id === id ? rowToInsurer(data as DBInsurerRow) : i));
    return {};
  }, []);

  const deleteInsurer = useCallback(async (id: string) => {
    const { error } = await supabase.from('insurers').delete().eq('id', id);
    if (error) { console.error(error); return { error: error.message }; }
    setInsurers(prev => prev.filter(i => i.id !== id));
    setAttendants(prev => prev.filter(a => a.insurerId !== id));
    return {};
  }, []);

  const addAttendant = useCallback(async (input: InsurerAttendantInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { data, error } = await supabase.from('insurer_attendants').insert({
      organization_id: orgId,
      ...toAttendantPatch(input),
    }).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setAttendants(prev => [...prev, rowToAttendant(data as DBAttendantRow)]);
    return {};
  }, [orgId]);

  const updateAttendant = useCallback(async (id: string, input: InsurerAttendantInput) => {
    const { data, error } = await supabase.from('insurer_attendants').update(toAttendantPatch(input)).eq('id', id).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setAttendants(prev => prev.map(a => a.id === id ? rowToAttendant(data as DBAttendantRow) : a));
    return {};
  }, []);

  const deleteAttendant = useCallback(async (id: string) => {
    const { error } = await supabase.from('insurer_attendants').delete().eq('id', id);
    if (error) { console.error(error); return { error: error.message }; }
    setAttendants(prev => prev.filter(a => a.id !== id));
    return {};
  }, []);

  return { insurers, attendants, loading, addInsurer, updateInsurer, deleteInsurer, addAttendant, updateAttendant, deleteAttendant };
}

const InsurersContext = createContext<ReturnType<typeof useInsurers> | null>(null);

export function InsurersProvider({ children }: { children: React.ReactNode }) {
  const value = useInsurers();
  return <InsurersContext.Provider value={value}>{children}</InsurersContext.Provider>;
}

export function useInsurersContext() {
  const ctx = useContext(InsurersContext);
  if (!ctx) throw new Error('useInsurersContext deve ser usado dentro de InsurersProvider');
  return ctx;
}