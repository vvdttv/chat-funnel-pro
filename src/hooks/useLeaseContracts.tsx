import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Contratos de locacao (tabela `lease_contracts`), Fase J-2b-3. Operado pelo
 * dpto administrativo. Pre-requisito: existir guarantee_analyses com result
 * approved/approved_conditioned para o deal. Criacao manual via RPC
 * create_lease_contract (decisao do cliente: nao automatico ao entrar na
 * etapa). Lifecycle: rascunho -> enviado -> assinado -> ativo -> encerrado
 * (cancelado a qualquer momento). Campos customizaveis em
 * lease_contract_field_defs (4 secoes), gravados em custom_fields_response.
 */
export type LeaseContractStatus = 'rascunho' | 'enviado' | 'assinado' | 'ativo' | 'encerrado' | 'cancelado';
export type LeaseContractSection = 'dados_cliente' | 'dados_imobiliaria' | 'endereco_imovel' | 'garantia';
export type LeaseFieldType = 'text' | 'single_select' | 'multi_select';

export interface LeaseContract {
  id: string;
  dealId: string;
  propertyId: string | null;
  guaranteeAnalysisId: string | null;
  locadorNome: string | null;
  locadorDoc: string | null;
  locatarioNome: string | null;
  locatarioDoc: string | null;
  rentValue: number | null;
  condoFee: number | null;
  iptu: number | null;
  diaVencimento: number | null;
  startDate: string | null;
  endDate: string | null;
  durationMonths: number | null;
  readjustmentIndex: string | null;
  readjustmentPeriodMonths: number | null;
  multaRescisoriaMeses: number | null;
  caucaoMeses: number | null;
  status: LeaseContractStatus;
  signedAt: string | null;
  activatedAt: string | null;
  terminatedAt: string | null;
  documentUrl: string | null;
  customFieldsResponse: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type DBContractRow = {
  id: string;
  deal_id: string;
  property_id: string | null;
  guarantee_analysis_id: string | null;
  locador_nome: string | null;
  locador_doc: string | null;
  locatario_nome: string | null;
  locatario_doc: string | null;
  rent_value: number | null;
  condo_fee: number | null;
  iptu: number | null;
  dia_vencimento: number | null;
  start_date: string | null;
  end_date: string | null;
  duration_months: number | null;
  readjustment_index: string | null;
  readjustment_period_months: number | null;
  multa_rescisoria_meses: number | null;
  caucao_meses: number | null;
  status: LeaseContractStatus;
  signed_at: string | null;
  activated_at: string | null;
  terminated_at: string | null;
  document_url: string | null;
  custom_fields_response: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function rowToContract(r: DBContractRow): LeaseContract {
  return {
    id: r.id,
    dealId: r.deal_id,
    propertyId: r.property_id,
    guaranteeAnalysisId: r.guarantee_analysis_id,
    locadorNome: r.locador_nome,
    locadorDoc: r.locador_doc,
    locatarioNome: r.locatario_nome,
    locatarioDoc: r.locatario_doc,
    rentValue: r.rent_value,
    condoFee: r.condo_fee,
    iptu: r.iptu,
    diaVencimento: r.dia_vencimento,
    startDate: r.start_date,
    endDate: r.end_date,
    durationMonths: r.duration_months,
    readjustmentIndex: r.readjustment_index,
    readjustmentPeriodMonths: r.readjustment_period_months,
    multaRescisoriaMeses: r.multa_rescisoria_meses,
    caucaoMeses: r.caucao_meses,
    status: r.status,
    signedAt: r.signed_at,
    activatedAt: r.activated_at,
    terminatedAt: r.terminated_at,
    documentUrl: r.document_url,
    customFieldsResponse: r.custom_fields_response ?? {},
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface LeaseContractFieldDef {
  id: string;
  section: LeaseContractSection;
  fieldKey: string;
  label: string;
  fieldType: LeaseFieldType;
  options: string[];
  position: number;
  isActive: boolean;
  isDefault: boolean;
}

type DBFieldDefRow = {
  id: string;
  section: LeaseContractSection;
  field_key: string;
  label: string;
  field_type: LeaseFieldType;
  options: unknown;
  position: number;
  is_active: boolean;
  is_default: boolean;
};

function parseOptions(opts: unknown): string[] {
  if (Array.isArray(opts)) return opts.map(o => String(o));
  return [];
}

function rowToFieldDef(r: DBFieldDefRow): LeaseContractFieldDef {
  return {
    id: r.id,
    section: r.section,
    fieldKey: r.field_key,
    label: r.label,
    fieldType: r.field_type,
    options: parseOptions(r.options),
    position: r.position ?? 0,
    isActive: r.is_active,
    isDefault: r.is_default,
  };
}

export interface LeaseFieldInput {
  section: LeaseContractSection;
  fieldKey?: string;
  label: string;
  fieldType: LeaseFieldType;
  options: string[];
  isActive?: boolean;
}

const toFieldPatch = (i: LeaseFieldInput) => ({
  ...(i.section !== undefined ? { section: i.section } : {}),
  ...(i.fieldKey !== undefined ? { field_key: i.fieldKey } : {}),
  ...(i.label !== undefined ? { label: i.label } : {}),
  ...(i.fieldType !== undefined ? { field_type: i.fieldType } : {}),
  ...(i.options !== undefined ? { options: i.options } : {}),
  ...(i.isActive !== undefined ? { is_active: i.isActive } : {}),
});

export function useLeaseContracts() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [contracts, setContracts] = useState<LeaseContract[]>([]);
  const [fieldDefs, setFieldDefs] = useState<LeaseContractFieldDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setContracts([]); setFieldDefs([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [cRes, fRes] = await Promise.all([
        supabase.from('lease_contracts').select('*').order('created_at', { ascending: false }),
        supabase.from('lease_contract_field_defs').select('*').order('section').order('position'),
      ]);
      if (cancelled) return;
      if (cRes.error) console.error('[useLeaseContracts] contracts', cRes.error);
      if (fRes.error) console.error('[useLeaseContracts] field_defs', fRes.error);
      setContracts(((cRes.data as DBContractRow[]) || []).map(rowToContract));
      setFieldDefs(((fRes.data as DBFieldDefRow[]) || []).map(rowToFieldDef));
      setLoading(false);
    })();

    const channel = supabase
      .channel('lease-contracts-org-' + orgId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lease_contracts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBContractRow;
          setContracts(prev => prev.some(c => c.id === r.id) ? prev : [rowToContract(r), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBContractRow;
          setContracts(prev => prev.map(c => c.id === r.id ? rowToContract(r) : c));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setContracts(prev => prev.filter(c => c.id !== r.id));
        }
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const createContract = useCallback(async (dealId: string, metadata?: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc('create_lease_contract', {
      p_deal_id: dealId,
      p_metadata: (metadata ?? {}) as never,
    });
    if (error) { console.error('[useLeaseContracts] create', error); return { error: error.message }; }
    const row = Array.isArray(data) ? data[0] : data;
    return { contractId: row?.out_contract_id as string, created: row?.out_created as boolean };
  }, []);

  const updateStatus = useCallback(async (contractId: string, newStatus: LeaseContractStatus, reason?: string) => {
    const { error } = await supabase.rpc('update_lease_contract_status', {
      p_contract_id: contractId,
      p_new_status: newStatus,
      p_reason: reason ?? null,
    });
    if (error) { console.error('[useLeaseContracts] updateStatus', error); return { error: error.message }; }
    return {};
  }, []);

  const setField = useCallback(async (contractId: string, fieldKey: string, value: unknown) => {
    const { error } = await supabase.rpc('set_lease_contract_field', {
      p_contract_id: contractId,
      p_field_key: fieldKey,
      p_value: (value ?? null) as never,
    });
    if (error) { console.error('[useLeaseContracts] setField', error); return { error: error.message }; }
    return {};
  }, []);

  const updateContractFields = useCallback(async (contractId: string, patch: Partial<LeaseContract>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.locadorNome !== undefined) dbPatch.locador_nome = patch.locadorNome;
    if (patch.locadorDoc !== undefined) dbPatch.locador_doc = patch.locadorDoc;
    if (patch.locatarioNome !== undefined) dbPatch.locatario_nome = patch.locatarioNome;
    if (patch.locatarioDoc !== undefined) dbPatch.locatario_doc = patch.locatarioDoc;
    if (patch.rentValue !== undefined) dbPatch.rent_value = patch.rentValue;
    if (patch.condoFee !== undefined) dbPatch.condo_fee = patch.condoFee;
    if (patch.iptu !== undefined) dbPatch.iptu = patch.iptu;
    if (patch.diaVencimento !== undefined) dbPatch.dia_vencimento = patch.diaVencimento;
    if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
    if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate;
    if (patch.durationMonths !== undefined) dbPatch.duration_months = patch.durationMonths;
    if (patch.readjustmentIndex !== undefined) dbPatch.readjustment_index = patch.readjustmentIndex;
    if (patch.readjustmentPeriodMonths !== undefined) dbPatch.readjustment_period_months = patch.readjustmentPeriodMonths;
    if (patch.multaRescisoriaMeses !== undefined) dbPatch.multa_rescisoria_meses = patch.multaRescisoriaMeses;
    if (patch.caucaoMeses !== undefined) dbPatch.caucao_meses = patch.caucaoMeses;
    if (patch.documentUrl !== undefined) dbPatch.document_url = patch.documentUrl;
    const { data, error } = await supabase.from('lease_contracts').update(dbPatch).eq('id', contractId).select('*').single();
    if (error) { console.error('[useLeaseContracts] updateFields', error); return { error: error.message }; }
    setContracts(prev => prev.map(c => c.id === contractId ? rowToContract(data as DBContractRow) : c));
    return {};
  }, []);

  const addFieldDef = useCallback(async (input: LeaseFieldInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { data, error } = await supabase.from('lease_contract_field_defs').insert({
      organization_id: orgId,
      is_default: false,
      ...toFieldPatch(input),
    }).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setFieldDefs(prev => [...prev, rowToFieldDef(data as DBFieldDefRow)]);
    return {};
  }, [orgId]);

  const updateFieldDef = useCallback(async (id: string, input: LeaseFieldInput) => {
    const { data, error } = await supabase.from('lease_contract_field_defs').update(toFieldPatch(input)).eq('id', id).select('*').single();
    if (error) { console.error(error); return { error: error.message }; }
    setFieldDefs(prev => prev.map(f => f.id === id ? rowToFieldDef(data as DBFieldDefRow) : f));
    return {};
  }, []);

  const deleteFieldDef = useCallback(async (id: string) => {
    const { error } = await supabase.from('lease_contract_field_defs').delete().eq('id', id);
    if (error) { console.error(error); return { error: error.message }; }
    setFieldDefs(prev => prev.filter(f => f.id !== id));
    return {};
  }, []);

  return {
    contracts, fieldDefs, loading,
    createContract, updateStatus, setField, updateContractFields,
    addFieldDef, updateFieldDef, deleteFieldDef,
  };
}

const LeaseContractsContext = createContext<ReturnType<typeof useLeaseContracts> | null>(null);

export function LeaseContractsProvider({ children }: { children: React.ReactNode }) {
  const value = useLeaseContracts();
  return <LeaseContractsContext.Provider value={value}>{children}</LeaseContractsContext.Provider>;
}

export function useLeaseContractsContext() {
  const ctx = useContext(LeaseContractsContext);
  if (!ctx) throw new Error('useLeaseContractsContext deve ser usado dentro de LeaseContractsProvider');
  return ctx;
}