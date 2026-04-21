import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageArchetype {
  id: string;
  code: string;
  name: string;
  purpose: string;
  position: number;
  default_playbook_code: string | null;
  context_tags: string[];
  is_active: boolean;
}

export interface StatusArchetype {
  id: string;
  code: string;
  name: string;
  default_overlay_rules: Record<string, unknown>;
  is_active: boolean;
}

/**
 * Lê os catálogos globais de arquétipos de etapa e status.
 * Tabelas globais (sem organization_id) com RLS de SELECT para todos autenticados.
 */
export function useArchetypes() {
  const [stageArchetypes, setStageArchetypes] = useState<StageArchetype[]>([]);
  const [statusArchetypes, setStatusArchetypes] = useState<StatusArchetype[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: stages, error: e1 }, { data: statuses, error: e2 }] = await Promise.all([
        supabase
          .from('stage_archetypes')
          .select('*')
          .eq('is_active', true)
          .order('position', { ascending: true }),
        supabase
          .from('status_archetypes')
          .select('*')
          .eq('is_active', true)
          .order('code', { ascending: true }),
      ]);
      if (cancelled) return;
      if (e1 || e2) {
        setError(e1?.message || e2?.message || 'Erro ao carregar arquétipos');
        setLoading(false);
        return;
      }
      setStageArchetypes(
        ((stages as Array<Record<string, unknown>>) || []).map((row) => ({
          id: row.id as string,
          code: row.code as string,
          name: row.name as string,
          purpose: (row.purpose as string) || '',
          position: (row.position as number) || 0,
          default_playbook_code: (row.default_playbook_code as string | null) ?? null,
          context_tags: (row.context_tags as string[]) || [],
          is_active: (row.is_active as boolean) ?? true,
        })),
      );
      setStatusArchetypes(
        ((statuses as Array<Record<string, unknown>>) || []).map((row) => ({
          id: row.id as string,
          code: row.code as string,
          name: row.name as string,
          default_overlay_rules: (row.default_overlay_rules as Record<string, unknown>) || {},
          is_active: (row.is_active as boolean) ?? true,
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { stageArchetypes, statusArchetypes, loading, error };
}
