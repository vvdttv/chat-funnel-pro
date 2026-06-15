import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Número de WhatsApp (tabela `whatsapp_numbers`, Fase 2A). Vincula um número
 * (oficial Cloud API ou não-oficial WAHA) a uma persona. Operação padrão:
 * 2 personas em 2 números fixos. Mapeamento número -> persona -> provider.
 */
export interface WhatsappNumber {
  id: string;
  personaId: string | null;
  label: string;
  provider: 'waha' | 'cloud_api';
  phoneE164: string;
  wahaSession: string | null;
  externalNumberId: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

type DBNumberRow = {
  id: string;
  persona_id: string | null;
  label: string;
  provider: string;
  phone_e164: string;
  waha_session: string | null;
  external_number_id: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
};

function rowToNumber(row: DBNumberRow): WhatsappNumber {
  return {
    id: row.id,
    personaId: row.persona_id,
    label: row.label ?? '',
    provider: (row.provider as WhatsappNumber['provider']) ?? 'waha',
    phoneE164: row.phone_e164,
    wahaSession: row.waha_session,
    externalNumberId: row.external_number_id,
    isActive: row.is_active,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

export interface WhatsappNumberInput {
  personaId?: string | null;
  label?: string;
  provider?: 'waha' | 'cloud_api';
  phoneE164?: string;
  wahaSession?: string | null;
  externalNumberId?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
}

const toDBPatch = (input: WhatsappNumberInput) => ({
  ...(input.personaId !== undefined ? { persona_id: input.personaId } : {}),
  ...(input.label !== undefined ? { label: input.label } : {}),
  ...(input.provider !== undefined ? { provider: input.provider } : {}),
  ...(input.phoneE164 !== undefined ? { phone_e164: input.phoneE164 } : {}),
  ...(input.wahaSession !== undefined ? { waha_session: input.wahaSession } : {}),
  ...(input.externalNumberId !== undefined ? { external_number_id: input.externalNumberId } : {}),
  ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
});

/**
 * Carrega os números de WhatsApp da organização (RLS filtra) e mantém via realtime.
 */
export function useWhatsappNumbers() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setNumbers([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('whatsapp_numbers')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setNumbers((data || []).map(r => rowToNumber(r as DBNumberRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`whatsapp-numbers-org-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_numbers' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as DBNumberRow;
            setNumbers(prev => prev.some(n => n.id === row.id) ? prev : [...prev, rowToNumber(row)]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as DBNumberRow;
            setNumbers(prev => prev.map(n => n.id === row.id ? rowToNumber(row) : n));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as { id?: string };
            if (row?.id) setNumbers(prev => prev.filter(n => n.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const addNumber = useCallback(async (input: WhatsappNumberInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    if (!input.phoneE164?.trim()) return { error: 'phone_e164_obrigatorio' };
    const { error } = await supabase.from('whatsapp_numbers').insert({
      organization_id: orgId,
      ...toDBPatch(input),
    });
    if (error) { console.error('[useWhatsappNumbers] erro ao criar número', error); return { error: error.message }; }
    return {};
  }, [orgId]);

  const updateNumber = useCallback(async (id: string, input: WhatsappNumberInput) => {
    const { error } = await supabase.from('whatsapp_numbers').update(toDBPatch(input)).eq('id', id);
    if (error) { console.error('[useWhatsappNumbers] erro ao atualizar número', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteNumber = useCallback(async (id: string) => {
    const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', id);
    if (error) { console.error('[useWhatsappNumbers] erro ao deletar número', error); return { error: error.message }; }
    return {};
  }, []);

  return { numbers, loading, error, addNumber, updateNumber, deleteNumber };
}

// ========== Contexto global ==========

const WhatsappNumbersContext = createContext<ReturnType<typeof useWhatsappNumbers> | null>(null);

export function WhatsappNumbersProvider({ children }: { children: React.ReactNode }) {
  const value = useWhatsappNumbers();
  return <WhatsappNumbersContext.Provider value={value}>{children}</WhatsappNumbersContext.Provider>;
}

export function useWhatsappNumbersContext() {
  const ctx = useContext(WhatsappNumbersContext);
  if (!ctx) throw new Error('useWhatsappNumbersContext deve ser usado dentro de WhatsappNumbersProvider');
  return ctx;
}
