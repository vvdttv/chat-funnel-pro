import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActivityType {
  id: string;
  organization_id: string;
  code: string;
  label: string;
  icon: string;
  color: string;
  default_duration_min: number;
  is_system: boolean;
  is_active: boolean;
  position: number;
}

export interface ActivityTypeInput {
  code: string;
  label: string;
  icon: string;
  color: string;
  default_duration_min?: number;
}

interface Ctx {
  types: ActivityType[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createType: (input: ActivityTypeInput) => Promise<{ error?: string }>;
  updateType: (id: string, patch: Partial<ActivityType>) => Promise<{ error?: string }>;
  deleteType: (id: string) => Promise<{ error?: string }>;
  reorderTypes: (ordered: { id: string; position: number }[]) => Promise<void>;
  byCode: (code: string) => ActivityType | undefined;
}

const ActivityTypesContext = createContext<Ctx | null>(null);

export const ActivityTypesProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    if (!profile?.organization_id) {
      setTypes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: e } = await supabase
      .from('activity_types')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('position', { ascending: true });
    if (e) setError(e.message);
    else setTypes(data || []);
    setLoading(false);
  }, [profile?.organization_id]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  // Auto-seed dos 4 tipos system para organizações novas (idempotente)
  useEffect(() => {
    if (loading || !profile?.organization_id || types.length > 0) return;
    const seed = [
      { code: 'call', label: 'Ligação', icon: 'Phone', color: 'hsl(210,80%,55%)' },
      { code: 'proposal', label: 'Proposta', icon: 'FileText', color: 'hsl(38,92%,50%)' },
      { code: 'visit', label: 'Visita', icon: 'MapPin', color: 'hsl(145,63%,49%)' },
      { code: 'followup', label: 'Follow-up', icon: 'MessageCircle', color: 'hsl(270,60%,65%)' },
    ];
    (async () => {
      const rows = seed.map((s, i) => ({
        organization_id: profile.organization_id,
        code: s.code,
        label: s.label,
        icon: s.icon,
        color: s.color,
        default_duration_min: 30,
        is_system: true,
        position: i,
      }));
      const { error: e } = await supabase.from('activity_types').insert(rows);
      if (!e) await fetchTypes();
    })();
  }, [loading, types.length, profile?.organization_id, fetchTypes]);

  const createType = async (input: ActivityTypeInput) => {
    if (!profile?.organization_id) return { error: 'sem organização' };
    const maxPos = types.reduce((m, t) => Math.max(m, t.position), -1);
    const { error: e } = await supabase.from('activity_types').insert({
      organization_id: profile.organization_id,
      code: input.code,
      label: input.label,
      icon: input.icon,
      color: input.color,
      default_duration_min: input.default_duration_min ?? 30,
      is_system: false,
      position: maxPos + 1,
    });
    if (e) return { error: e.message };
    await fetchTypes();
    return {};
  };

  const updateType = async (id: string, patch: Partial<ActivityType>) => {
    const { id: _i, organization_id: _o, is_system: _s, ...rest } = patch;
    const { error: e } = await supabase.from('activity_types').update(rest).eq('id', id);
    if (e) return { error: e.message };
    await fetchTypes();
    return {};
  };

  const deleteType = async (id: string) => {
    const t = types.find(x => x.id === id);
    if (t?.is_system) return { error: 'tipos do sistema não podem ser excluídos' };
    const { error: e } = await supabase.from('activity_types').delete().eq('id', id);
    if (e) return { error: e.message };
    await fetchTypes();
    return {};
  };

  const reorderTypes = async (ordered: { id: string; position: number }[]) => {
    await Promise.all(ordered.map(o =>
      supabase.from('activity_types').update({ position: o.position }).eq('id', o.id)
    ));
    await fetchTypes();
  };

  const byCode = useCallback((code: string) => types.find(t => t.code === code), [types]);

  const value = useMemo<Ctx>(() => ({
    types, loading, error, refresh: fetchTypes,
    createType, updateType, deleteType, reorderTypes, byCode,
  }), [types, loading, error, fetchTypes, byCode]);

  return <ActivityTypesContext.Provider value={value}>{children}</ActivityTypesContext.Provider>;
};

export const useActivityTypes = () => {
  const ctx = useContext(ActivityTypesContext);
  if (!ctx) throw new Error('useActivityTypes deve ser usado dentro de ActivityTypesProvider');
  return ctx;
};
