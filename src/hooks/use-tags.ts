import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tag } from '@/types/tags';

export type { Tag };

interface UseTagsResult {
  tags: Tag[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTags(pipelineId?: string): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setTags([]); return; }
      const orgId = user.user_metadata?.organization_id || '11111111-1111-1111-1111-111111111111';
      const { data, error: err } = await supabase.from('deal_tags').select('*').eq('organization_id', orgId).order('name');
      if (err) throw err;
      setTags(data || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading tags');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTags(); }, [pipelineId]);
  return { tags, isLoading, error, refetch: fetchTags };
}

/**
 * Tags de um deal específico. Lê via RPC get_deal_tags_json (SECURITY DEFINER,
 * escopada por org) e persiste em deal_tag_assignments. Usado no detalhe do
 * deal (Kanban) para adicionar/remover tags.
 */
export function useDealTags(dealId: string) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!dealId) { setTags([]); setIsLoading(false); return; }
    setIsLoading(true);
    const { data } = await supabase.rpc('get_deal_tags_json', { p_deal_id: dealId });
    setTags(Array.isArray(data) ? (data as Tag[]) : []);
    setIsLoading(false);
  }, [dealId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const assignTag = useCallback(async (tagId: number, userId?: string) => {
    const { error } = await supabase.from('deal_tag_assignments').insert({ deal_id: dealId, tag_id: tagId, assigned_by: userId || null });
    if (!error) await fetchTags();
    return !error;
  }, [dealId, fetchTags]);

  const removeTag = useCallback(async (tagId: number) => {
    const { error } = await supabase.from('deal_tag_assignments').delete().eq('deal_id', dealId).eq('tag_id', tagId);
    if (!error) setTags(prev => prev.filter(t => t.id !== tagId));
    return !error;
  }, [dealId]);

  return { tags, isLoading, assignTag, removeTag, refetch: fetchTags };
}
