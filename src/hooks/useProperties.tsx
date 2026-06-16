import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Banco de imóveis (`properties`), Fase 3B. Cadastro manual no painel admin.
 * Alimenta o match engine (match_properties_internal) que classifica os imóveis
 * por valor de financiamento aprovado em 100% (cobre sem entrada) / 80% (com
 * entrada) / sem match. CRUD restrito a admin (RLS).
 */
export type PropertyStatus = 'disponivel' | 'reservado' | 'vendido' | 'inativo';

export interface Property {
  id: string;
  code: string;
  title: string;
  segment: string;
  operation: string;
  price: number;
  appraisalValue: number | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  parkingSpaces: number | null;
  status: PropertyStatus;
  photoUrl: string | null;
  notes: string | null;
  isActive: boolean;
  position: number;
  createdAt: string;
}

type DBPropertyRow = {
  id: string;
  code: string;
  title: string;
  segment: string;
  operation: string;
  price: number | string;
  appraisal_value: number | string | null;
  city: string | null;
  neighborhood: string | null;
  bedrooms: number | null;
  parking_spaces: number | null;
  status: PropertyStatus;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
};

const num = (v: number | string | null): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v);

function rowToProperty(r: DBPropertyRow): Property {
  return {
    id: r.id,
    code: r.code,
    title: r.title ?? '',
    segment: r.segment ?? 'mcmv',
    operation: r.operation ?? 'venda',
    price: num(r.price) ?? 0,
    appraisalValue: num(r.appraisal_value),
    city: r.city,
    neighborhood: r.neighborhood,
    bedrooms: r.bedrooms,
    parkingSpaces: r.parking_spaces,
    status: r.status ?? 'disponivel',
    photoUrl: r.photo_url,
    notes: r.notes,
    isActive: r.is_active,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

export interface PropertyInput {
  code?: string;
  title?: string;
  segment?: string;
  operation?: string;
  price?: number;
  appraisalValue?: number | null;
  city?: string | null;
  neighborhood?: string | null;
  bedrooms?: number | null;
  parkingSpaces?: number | null;
  status?: PropertyStatus;
  photoUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

const toPropertyPatch = (i: PropertyInput) => ({
  ...(i.code !== undefined ? { code: i.code } : {}),
  ...(i.title !== undefined ? { title: i.title } : {}),
  ...(i.segment !== undefined ? { segment: i.segment } : {}),
  ...(i.operation !== undefined ? { operation: i.operation } : {}),
  ...(i.price !== undefined ? { price: i.price } : {}),
  ...(i.appraisalValue !== undefined ? { appraisal_value: i.appraisalValue } : {}),
  ...(i.city !== undefined ? { city: i.city } : {}),
  ...(i.neighborhood !== undefined ? { neighborhood: i.neighborhood } : {}),
  ...(i.bedrooms !== undefined ? { bedrooms: i.bedrooms } : {}),
  ...(i.parkingSpaces !== undefined ? { parking_spaces: i.parkingSpaces } : {}),
  ...(i.status !== undefined ? { status: i.status } : {}),
  ...(i.photoUrl !== undefined ? { photo_url: i.photoUrl } : {}),
  ...(i.notes !== undefined ? { notes: i.notes } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useProperties() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setProperties([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('properties').select('*').order('position', { ascending: true });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setProperties((data || []).map(r => rowToProperty(r as DBPropertyRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`properties-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBPropertyRow;
          setProperties(prev => prev.some(p => p.id === r.id) ? prev : [...prev, rowToProperty(r)]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBPropertyRow;
          setProperties(prev => prev.map(p => p.id === r.id ? rowToProperty(r) : p));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setProperties(prev => prev.filter(p => p.id !== r.id));
        }
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const addProperty = useCallback(async (input: PropertyInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { error } = await supabase.from('properties').insert({
      organization_id: orgId,
      position: properties.length,
      ...toPropertyPatch(input),
    });
    if (error) { console.error('[useProperties] criar imóvel', error); return { error: error.message }; }
    return {};
  }, [orgId, properties.length]);

  const updateProperty = useCallback(async (id: string, input: PropertyInput) => {
    const { error } = await supabase.from('properties').update(toPropertyPatch(input)).eq('id', id);
    if (error) { console.error('[useProperties] atualizar imóvel', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteProperty = useCallback(async (id: string) => {
    const { error } = await supabase.from('properties').delete().eq('id', id);
    if (error) { console.error('[useProperties] excluir imóvel', error); return { error: error.message }; }
    return {};
  }, []);

  return { properties, loading, error, addProperty, updateProperty, deleteProperty };
}

const PropertiesContext = createContext<ReturnType<typeof useProperties> | null>(null);

export function PropertiesProvider({ children }: { children: React.ReactNode }) {
  const value = useProperties();
  return <PropertiesContext.Provider value={value}>{children}</PropertiesContext.Provider>;
}

export function usePropertiesContext() {
  const ctx = useContext(PropertiesContext);
  if (!ctx) throw new Error('usePropertiesContext deve ser usado dentro de PropertiesProvider');
  return ctx;
}
