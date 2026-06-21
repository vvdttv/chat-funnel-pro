import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Uma tag sugerida pela IA, aguardando aprovação (Fase G-2). */
export interface TagSuggestion {
  assignment_id: number;
  deal_id: string;
  lead_name: string | null;
  tag_id: number;
  tag_name: string;
  group_name: string;
  confidence: number | null;
  rationale: string | null;
  created_at: string;
}

interface UseTagSuggestionsResult {
  tagSuggestions: TagSuggestion[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  review: (assignmentId: number, approve: boolean) => Promise<boolean>;
}

const POLL_MS = 15_000;

/** Lista e revisa as tags sugeridas pela IA (status suggested, source ai). */
export function useTagSuggestions(): UseTagSuggestionsResult {
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchSuggestions = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc('get_pending_tag_suggestions');
      if (err) throw err;
      if (mounted.current) { setTagSuggestions((data ?? []) as TagSuggestion[]); setError(null); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'erro ao carregar tags');
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

  const review = useCallback(async (assignmentId: number, approve: boolean): Promise<boolean> => {
    const { error: err } = await supabase.rpc('review_tag_suggestion', {
      p_assignment_id: assignmentId,
      p_approve: approve,
    });
    if (err) { setError(err.message); return false; }
    setTagSuggestions((prev) => prev.filter((s) => s.assignment_id !== assignmentId));
    fetchSuggestions();
    return true;
  }, [fetchSuggestions]);

  return { tagSuggestions, isLoading, error, refetch: fetchSuggestions, review };
}
