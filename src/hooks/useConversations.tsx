import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Conversa persistida (tabela `conversations`, Fase 0/1). Substitui o antigo
 * `ChatThread` do mock. Uma conversa por (org, canal, contato), ligada a um deal.
 */
export interface Conversation {
  id: string;
  dealId: string | null;
  leadChannelId: string | null;
  channel: string;
  provider: string | null;
  contactPhoneE164: string | null;
  contactName: string | null;
  status: 'active' | 'archived' | 'closed';
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

type DBConversationRow = {
  id: string;
  deal_id: string | null;
  lead_channel_id: string | null;
  channel: string;
  provider: string | null;
  contact_phone_e164: string | null;
  contact_name: string | null;
  status: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
  created_at: string;
};

function rowToConversation(row: DBConversationRow): Conversation {
  return {
    id: row.id,
    dealId: row.deal_id,
    leadChannelId: row.lead_channel_id,
    channel: row.channel,
    provider: row.provider,
    contactPhoneE164: row.contact_phone_e164,
    contactName: row.contact_name,
    status: (row.status as Conversation['status']) ?? 'active',
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

/**
 * Carrega as conversas da organização (RLS filtra) e mantém via realtime.
 * Espelha o padrão de `useDeals` (load inicial + canal postgres_changes).
 */
export function useConversations() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setConversations([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setConversations((data || []).map(r => rowToConversation(r as DBConversationRow)));
      setLoading(false);
    })();

    // Realtime desabilitado: ver useDeals.ts. Reabilitar quando o WS do
    // self-hosted parar de derrubar canais (atualmente causa reconnect loop).
    return () => { cancelled = true; };
  }, [orgId]);

  return { conversations, loading, error };
}

// Context para evitar múltiplas subscriptions quando vários componentes usam.
const ConversationsContext = createContext<ReturnType<typeof useConversations> | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const value = useConversations();
  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}

export function useConversationsContext() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error('useConversationsContext deve ser usado dentro de ConversationsProvider');
  return ctx;
}
