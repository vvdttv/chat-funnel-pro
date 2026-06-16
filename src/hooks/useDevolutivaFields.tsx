import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Campos extras da devolutiva (`devolutiva_field_defs`), Fase 3B. Form-builder
 * por org: o admin define rótulo, tipo (texto / seleção única / múltipla) e
 * opções. O correspondente preenche no painel de devolutiva. Os campos padrão
 * MCMV vêm seedados (is_default) e podem ser editados/excluídos.
 */
export type DevolutivaFieldType = 'text' | 'single_select' | 'multi_select';

export interface DevolutivaFieldDef {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: DevolutivaFieldType;
  options: string[];
  position: number;
  isActive: boolean;
  isDefault: boolean;
}

type DBRow = {
  id: string;
  field_key: string;
  label: string;
  field_type: DevolutivaFieldType;
  options: unknown;
  position: number;
  is_active: boolean;
  is_default: boolean;
};

const toOptions = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function rowToField(r: DBRow): DevolutivaFieldDef {
  return {
    id: r.id,
    fieldKey: r.field_key,
    label: r.label,
    fieldType: r.field_type,
    options: toOptions(r.options),
    position: r.position ?? 0,
    isActive: r.is_active,
    isDefault: r.is_default,
  };
}

export interface FieldInput {
  fieldKey?: string;
  label?: string;
  fieldType?: DevolutivaFieldType;
  options?: string[];
  isActive?: boolean;
}

const toPatch = (i: FieldInput) => ({
  ...(i.fieldKey !== undefined ? { field_key: i.fieldKey } : {}),
  ...(i.label !== undefined ? { label: i.label } : {}),
  ...(i.fieldType !== undefined ? { field_type: i.fieldType } : {}),
  ...(i.options !== undefined ? { options: i.options } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useDevolutivaFields() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [fields, setFields] = useState<DevolutivaFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setFields([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('devolutiva_field_defs').select('*').order('position', { ascending: true });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setFields((data || []).map(r => rowToField(r as DBRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`devo-fields-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devolutiva_field_defs' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBRow;
          setFields(prev => prev.some(f => f.id === r.id) ? prev : [...prev, rowToField(r)]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBRow;
          setFields(prev => prev.map(f => f.id === r.id ? rowToField(r) : f));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setFields(prev => prev.filter(f => f.id !== r.id));
        }
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const addField = useCallback(async (input: FieldInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { error } = await supabase.from('devolutiva_field_defs').insert({
      organization_id: orgId,
      position: fields.length,
      is_default: false,
      ...toPatch(input),
    });
    if (error) { console.error('[useDevolutivaFields] criar', error); return { error: error.message }; }
    return {};
  }, [orgId, fields.length]);

  const updateField = useCallback(async (id: string, input: FieldInput) => {
    const { error } = await supabase.from('devolutiva_field_defs').update(toPatch(input)).eq('id', id);
    if (error) { console.error('[useDevolutivaFields] atualizar', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteField = useCallback(async (id: string) => {
    const { error } = await supabase.from('devolutiva_field_defs').delete().eq('id', id);
    if (error) { console.error('[useDevolutivaFields] excluir', error); return { error: error.message }; }
    return {};
  }, []);

  return { fields, loading, error, addField, updateField, deleteField };
}

const Ctx = createContext<ReturnType<typeof useDevolutivaFields> | null>(null);

export function DevolutivaFieldsProvider({ children }: { children: React.ReactNode }) {
  const value = useDevolutivaFields();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevolutivaFieldsContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDevolutivaFieldsContext deve ser usado dentro de DevolutivaFieldsProvider');
  return ctx;
}
