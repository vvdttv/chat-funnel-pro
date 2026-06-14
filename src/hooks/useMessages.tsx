import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Mensagem persistida (tabela `messages`, Fase 0/1). Substitui o `ChatMessage`
 * do mock. `sender` mapeado para o vocabulário do front (lead/agent/ai).
 */
export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  sender: 'lead' | 'agent' | 'ai' | 'system' | 'correspondent';
  contentType: string;
  content: string | null;
  mediaUrl: string | null;
  channelRoute: string | null;
  status: string;
  createdAt: string;
}

type DBMessageRow = {
  id: string;
  conversation_id: string;
  direction: string;
  sender_type: string;
  content_type: string;
  content: string | null;
  media_url: string | null;
  channel_route: string | null;
  status: string;
  created_at: string;
};

function rowToMessage(row: DBMessageRow): Message {
  // sender_type já é lead/ai/broker/system/correspondent; mapeia broker→agent
  const sender = row.sender_type === 'broker' ? 'agent' : (row.sender_type as Message['sender']);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: (row.direction as Message['direction']),
    sender,
    contentType: row.content_type,
    content: row.content,
    mediaUrl: row.media_url,
    channelRoute: row.channel_route,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Carrega e mantém em tempo real as mensagens de uma conversa.
 * Passar `null` desativa (ex.: nenhuma conversa selecionada).
 */
export function useMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !conversationId) { setMessages([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) { setLoading(false); return; }
      setMessages((data || []).map(r => rowToMessage(r as DBMessageRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`messages-conv-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as DBMessageRow;
          setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, rowToMessage(row)]);
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId, conversationId]);

  return { messages, loading };
}
