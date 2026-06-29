import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Vistorias de imovel (tabela `property_inspections`) e vistoriadores
 * (`inspectors`), Fase J-2b-2. Operado pelo dpto administrativo. Vistoria de
 * ENTRADA nasce automatica ao deal entrar na etapa papel vistoria_entrada;
 * vistoria de SAIDA e manual. Itens do checklist em property_inspection_items
 * (1 por comodo). Atribuicao em 2 modos (roleta+fila), configuravel em
 * organizations.metadata.inspection_assignment. CRUD restrito a admin.
 */
export type InspectionType = 'entrada' | 'saida';
export type InspectionStatus = 'pendente' | 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
export type InspectorType = 'perito_externo' | 'administrativo';

export interface Inspector {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  phoneE164: string | null;
  inspectorType: InspectorType;
  distributionPct: number;
  isActive: boolean;
  position: number;
  createdAt: string;
}

export interface PropertyInspection {
  id: string;
  dealId: string;
  propertyId: string | null;
  leaseContractId: string | null;
  inspectionType: InspectionType;
  status: InspectionStatus;
  inspectorId: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  reportUrl: string | null;
  generalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionItem {
  id: string;
  inspectionId: string;
  room: string | null;
  item: string;
  condition: string | null;
  notes: string | null;
  photoUrls: string[];
  position: number;
  createdAt: string;
}

type DBInspectorRow = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone_e164: string | null;
  inspector_type: InspectorType;
  distribution_pct: number;
  is_active: boolean;
  position: number;
  created_at: string;
};

type DBInspectionRow = {
  id: string;
  deal_id: string;
  property_id: string | null;
  lease_contract_id: string | null;
  inspection_type: InspectionType;
  status: InspectionStatus;
  inspector_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  report_url: string | null;
  general_notes: string | null;
  created_at: string;
  updated_at: string;
};

type DBItemRow = {
  id: string;
  inspection_id: string;
  room: string | null;
  item: string;
  condition: string | null;
  notes: string | null;
  photo_urls: unknown;
  position: number;
  created_at: string;
};

function rowToInspector(r: DBInspectorRow): Inspector {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    phoneE164: r.phone_e164,
    inspectorType: r.inspector_type,
    distributionPct: r.distribution_pct ?? 0,
    isActive: r.is_active,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

function rowToInspection(r: DBInspectionRow): PropertyInspection {
  return {
    id: r.id,
    dealId: r.deal_id,
    propertyId: r.property_id,
    leaseContractId: r.lease_contract_id,
    inspectionType: r.inspection_type,
    status: r.status,
    inspectorId: r.inspector_id,
    scheduledAt: r.scheduled_at,
    completedAt: r.completed_at,
    reportUrl: r.report_url,
    generalNotes: r.general_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToItem(r: DBItemRow): InspectionItem {
  return {
    id: r.id,
    inspectionId: r.inspection_id,
    room: r.room,
    item: r.item,
    condition: r.condition,
    notes: r.notes,
    photoUrls: Array.isArray(r.photo_urls) ? (r.photo_urls as string[]) : [],
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

export interface InspectorInput {
  userId?: string | null;
  name: string;
  email?: string | null;
  phoneE164?: string | null;
  inspectorType?: InspectorType;
  distributionPct?: number;
  isActive?: boolean;
}

const toInspectorPatch = (i: InspectorInput) => ({
  ...(i.userId !== undefined ? { user_id: i.userId } : {}),
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.email !== undefined ? { email: i.email } : {}),
  ...(i.phoneE164 !== undefined ? { phone_e164: i.phoneE164 } : {}),
  ...(i.inspectorType !== undefined ? { inspector_type: i.inspectorType } : {}),
  ...(i.distributionPct !== undefined ? { distribution_pct: i.distributionPct } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useInspectorsAndInspections() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [inspections, setInspections] = useState<PropertyInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setInspectors([]); setInspections([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [iRes, pRes] = await Promise.all([
        supabase.from('inspectors').select('*').order('position', { ascending: true }),
        supabase.from('property_inspections').select('*').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      if (iRes.error) console.error('[useInspectors] inspectors', iRes.error);
      if (pRes.error) console.error('[useInspectors] inspections', pRes.error);
      setInspectors(((iRes.data as DBInspectorRow[]) || []).map(rowToInspector));
      setInspections(((pRes.data as DBInspectionRow[]) || []).map(rowToInspection));
      setLoading(false);
    })();

    const channel = supabase
      .channel('property-inspections-org-' + orgId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_inspections' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBInspectionRow;
          setInspections(prev => prev.some(x => x.id === r.id) ? prev : [rowToInspection(r), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBInspectionRow;
          setInspections(prev => prev.map(x => x.id === r.id ? rowToInspection(r) : x));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setInspections(prev => prev.filter(x => x.id !== r.id));
        }
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const addInspector = useCallback(async (input: InspectorInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { data, error } = await supabase.from('inspectors').insert({
      organization_id: orgId,
      ...toInspectorPatch(input),
    }).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setInspectors(prev => [...prev, rowToInspector(data as DBInspectorRow)]);
    return {};
  }, [orgId]);

  const updateInspector = useCallback(async (id: string, input: InspectorInput) => {
    const { data, error } = await supabase.from('inspectors').update(toInspectorPatch(input)).eq('id', id).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setInspectors(prev => prev.map(i => i.id === id ? rowToInspector(data as DBInspectorRow) : i));
    return {};
  }, []);

  const deleteInspector = useCallback(async (id: string) => {
    const { error } = await supabase.from('inspectors').delete().eq('id', id);
    if (error) { console.error(error); return { error: error.message }; }
    setInspectors(prev => prev.filter(i => i.id !== id));
    return {};
  }, []);

  const assignInspector = useCallback(async (inspectionId: string, inspectorId: string | null) => {
    const { error } = await supabase.rpc('assign_inspector_to_inspection', {
      p_inspection_id: inspectionId,
      p_inspector_id: inspectorId,
    });
    if (error) { console.error('[useInspectors] assign', error); return { error: error.message }; }
    return {};
  }, []);

  const updateInspectionStatus = useCallback(async (
    inspectionId: string,
    status: InspectionStatus,
    scheduledAt?: string | null,
    reportUrl?: string | null,
    generalNotes?: string | null,
  ) => {
    const { error } = await supabase.rpc('update_inspection_status', {
      p_inspection_id: inspectionId,
      p_status: status,
      p_scheduled_at: scheduledAt ?? null,
      p_report_url: reportUrl ?? null,
      p_general_notes: generalNotes ?? null,
    });
    if (error) { console.error('[useInspectors] updateStatus', error); return { error: error.message }; }
    return {};
  }, []);

  const loadItems = useCallback(async (inspectionId: string): Promise<InspectionItem[]> => {
    const { data, error } = await supabase
      .from('property_inspection_items')
      .select('*')
      .eq('inspection_id', inspectionId)
      .order('position', { ascending: true });
    if (error) { console.error('[useInspectors] items', error); return []; }
    return ((data as DBItemRow[]) || []).map(rowToItem);
  }, []);

  const addItem = useCallback(async (inspectionId: string, item: Partial<InspectionItem> & { item: string }) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { data, error } = await supabase.from('property_inspection_items').insert({
      organization_id: orgId,
      inspection_id: inspectionId,
      room: item.room ?? null,
      item: item.item,
      condition: item.condition ?? null,
      notes: item.notes ?? null,
      photo_urls: item.photoUrls ?? [],
      position: item.position ?? 0,
    }).select('*').single();
    if (error) { console.error('[useInspectors] addItem', error); return { error: error.message }; }
    return { item: rowToItem(data as DBItemRow) };
  }, [orgId]);

  const updateItem = useCallback(async (itemId: string, patch: Partial<InspectionItem>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.room !== undefined) dbPatch.room = patch.room;
    if (patch.item !== undefined) dbPatch.item = patch.item;
    if (patch.condition !== undefined) dbPatch.condition = patch.condition;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.photoUrls !== undefined) dbPatch.photo_urls = patch.photoUrls;
    const { error } = await supabase.from('property_inspection_items').update(dbPatch).eq('id', itemId);
    if (error) { console.error('[useInspectors] updateItem', error); return { error: error.message }; }
    return {};
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    const { error } = await supabase.from('property_inspection_items').delete().eq('id', itemId);
    if (error) { console.error('[useInspectors] deleteItem', error); return { error: error.message }; }
    return {};
  }, []);

  const createSaidaInspection = useCallback(async (dealId: string, leaseContractId?: string | null) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { data, error } = await supabase.from('property_inspections').insert({
      organization_id: orgId,
      deal_id: dealId,
      lease_contract_id: leaseContractId ?? null,
      inspection_type: 'saida',
      status: 'pendente',
    }).select('*').single();
    if (error) { console.error('[useInspectors] createSaida', error); return { error: error.message }; }
    setInspections(prev => [rowToInspection(data as DBInspectionRow), ...prev]);
    return { inspection: rowToInspection(data as DBInspectionRow) };
  }, [orgId]);

  return {
    inspectors, inspections, loading,
    addInspector, updateInspector, deleteInspector,
    assignInspector, updateInspectionStatus, createSaidaInspection,
    loadItems, addItem, updateItem, deleteItem,
  };
}

const InspectorsContext = createContext<ReturnType<typeof useInspectorsAndInspections> | null>(null);

export function InspectorsProvider({ children }: { children: React.ReactNode }) {
  const value = useInspectorsAndInspections();
  return <InspectorsContext.Provider value={value}>{children}</InspectorsContext.Provider>;
}

export function useInspectorsContext() {
  const ctx = useContext(InspectorsContext);
  if (!ctx) throw new Error('useInspectorsContext deve ser usado dentro de InspectorsProvider');
  return ctx;
}