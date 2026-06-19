import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Tag {
  id: number;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

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

export function useDealTags(dealId: string) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTags = async () => {
    if (!dealId) return;
    const { data } = await supabase.rpc('get_deal_tags_json', { p_deal_id: dealId });
    setTags(Array.isArray(data) ? data : []);
  };

  useEffect(() => { fetchTags(); }, [dealId]);
  setIsLoading(false);

  const assignTag = async (tagId: number, userId?: string) => {
    const { error } = await supabase.from('deal_tag_assignments').insert({ deal_id: dealId, tag_id: tagId, assigned_by: userId || null });
    if (!error) fetchTags();
    return !error;
  };

  const removeTag = async (tagId: number) => {
    const { error } = await supabase.from('deal_tag_assignments').delete().eq('deal_id', dealId).eq('tag_id', tagId);
    if (!error) setTags(prev => prev.filter(t => t.id !== tagId));
    return !error;
  };

  return { tags, isLoading, assignTag, removeTag };
}
