import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Uma sugestão de resposta da IA aguardando aprovação humana (modo assistido). */
export interface AISuggestion {
  queue_id: string;
  deal_id: string;
  lead_name: string | null;
  funnel_id: string;
  stage_id: string;
  lead_message: string | null;
  suggested_response: string | null;
  autonomy_mode: string;
  created_at: string;
}

interface UseAISuggestionsResult {
  suggestions: AISuggestion[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  approve: (queueId: string, editedText?: string) => Promise<boolean>;
  reject: (queueId: string, reason?: string) => Promise<boolean>;
}

const POLL_MS = 15_000;

/**
 * Lista e opera as sugestões da IA (status awaiting_approval) via RPCs
 * get_pending_ai_responses / approve_ai_response / reject_ai_response.
 * Poll a cada 15s (alinhado ao ciclo do dispatcher).
 */
export function useAISuggestions(): UseAISuggestionsResult {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchSuggestions = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc('get_pending_ai_responses');
      if (err) throw err;
      if (mounted.current) {
        setSuggestions((data ?? []) as AISuggestion[]);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'erro ao carregar sugestões');
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchSuggestions();
    const t = setInterval(fetchSuggestions, POLL_MS);
    return () => { mounted.current = false; clearInterval(t); };
  }, [fetchSuggestions]);

  const approve = useCallback(async (queueId: string, editedText?: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('approve_ai_response', {
      p_queue_id: queueId,
      p_edited_text: editedText ?? null,
    });
    if (err) { setError(err.message); return false; }
    // remove da lista localmente (otimista) + refetch
    setSuggestions((prev) => prev.filter((s) => s.queue_id !== queueId));
    fetchSuggestions();
    return true;
  }, [fetchSuggestions]);

  const reject = useCallback(async (queueId: string, reason?: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('reject_ai_response', {
      p_queue_id: queueId,
      p_reason: reason ?? null,
    });
    if (err) { setError(err.message); return false; }
    setSuggestions((prev) => prev.filter((s) => s.queue_id !== queueId));
    fetchSuggestions();
    return true;
  }, [fetchSuggestions]);

  return { suggestions, isLoading, error, refetch: fetchSuggestions, approve, reject };
}
