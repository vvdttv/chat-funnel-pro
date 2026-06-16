import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Análises de crédito (tabela `credit_analyses`), Fase 2C. O painel do
 * correspondente lista as análises que lhe foram atribuídas (RLS já filtra:
 * admin vê todas; atendente vê só as suas). Ações de negócio (iniciar análise,
 * enviar devolutiva) passam por RPCs SECURITY DEFINER que validam status.
 */
export type CreditAnalysisStatus = 'received' | 'in_analysis' | 'returned' | 'cancelled';
export type CreditAnalysisResult = 'approved' | 'approved_conditioned' | 'rejected';

export interface CreditAnalysis {
  id: string;
  dealId: string;
  bankId: string | null;
  attendantId: string | null;
  status: CreditAnalysisStatus;
  result: CreditAnalysisResult | null;
  resultConditions: string | null;
  resultReason: string | null;
  retomadaPrazoDias: number | null;
  receivedAt: string;
  analysisStartedAt: string | null;
  returnedAt: string | null;
}

export interface CreditAnalysisDocument {
  id: string;
  analysisId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  source: string;
  createdAt: string;
}

export interface CreditAnalysisComment {
  id: string;
  analysisId: string;
  documentId: string | null;
  authorId: string | null;
  body: string;
  createdAt: string;
}

type DBAnalysisRow = {
  id: string;
  deal_id: string;
  bank_id: string | null;
  attendant_id: string | null;
  status: CreditAnalysisStatus;
  result: CreditAnalysisResult | null;
  result_conditions: string | null;
  result_reason: string | null;
  retomada_prazo_dias: number | null;
  received_at: string;
  analysis_started_at: string | null;
  returned_at: string | null;
};

function rowToAnalysis(r: DBAnalysisRow): CreditAnalysis {
  return {
    id: r.id,
    dealId: r.deal_id,
    bankId: r.bank_id,
    attendantId: r.attendant_id,
    status: r.status,
    result: r.result,
    resultConditions: r.result_conditions,
    resultReason: r.result_reason,
    retomadaPrazoDias: r.retomada_prazo_dias,
    receivedAt: r.received_at,
    analysisStartedAt: r.analysis_started_at,
    returnedAt: r.returned_at,
  };
}

export interface DevolutivaInput {
  result: CreditAnalysisResult;
  conditions?: string | null;
  reason?: string | null;
  retomadaPrazoDias?: number | null;
  approvedFinancingAmount?: number | null;
  requiresEntry?: boolean | null;
  customFieldsResponse?: Record<string, unknown> | null;
}

export interface ExtractedDevolutiva {
  approved_financing_amount: number | null;
  requires_entry: boolean | null;
  conditions: string | null;
  raw_text: string | null;
}

export function useCreditAnalyses() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [analyses, setAnalyses] = useState<CreditAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setAnalyses([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('credit_analyses')
        .select('*')
        .order('received_at', { ascending: false });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setAnalyses((data || []).map(r => rowToAnalysis(r as DBAnalysisRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`credit-analyses-org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_analyses' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as DBAnalysisRow;
          setAnalyses(prev => prev.some(a => a.id === r.id) ? prev : [rowToAnalysis(r), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          const r = payload.new as DBAnalysisRow;
          setAnalyses(prev => prev.map(a => a.id === r.id ? rowToAnalysis(r) : a));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as { id?: string };
          if (r?.id) setAnalyses(prev => prev.filter(a => a.id !== r.id));
        }
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  // Carrega documentos de uma análise sob demanda (ao abrir o detalhe).
  const loadDocuments = useCallback(async (analysisId: string): Promise<CreditAnalysisDocument[]> => {
    const { data, error } = await supabase
      .from('credit_analysis_documents')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[useCreditAnalyses] docs', error); return []; }
    return (data || []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      analysisId: d.analysis_id as string,
      fileUrl: d.file_url as string,
      fileName: (d.file_name as string) ?? '',
      mimeType: (d.mime_type as string) ?? '',
      source: (d.source as string) ?? 'lead_whatsapp',
      createdAt: d.created_at as string,
    }));
  }, []);

  const loadComments = useCallback(async (analysisId: string): Promise<CreditAnalysisComment[]> => {
    const { data, error } = await supabase
      .from('credit_analysis_comments')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[useCreditAnalyses] comments', error); return []; }
    return (data || []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      analysisId: c.analysis_id as string,
      documentId: (c.document_id as string) ?? null,
      authorId: (c.author_id as string) ?? null,
      body: c.body as string,
      createdAt: c.created_at as string,
    }));
  }, []);

  const addComment = useCallback(async (analysisId: string, body: string, documentId?: string | null) => {
    if (!orgId || !profile?.user_id) return { error: 'sem_sessao' };
    const { error } = await supabase.from('credit_analysis_comments').insert({
      organization_id: orgId,
      analysis_id: analysisId,
      document_id: documentId ?? null,
      author_id: profile.user_id,
      body,
    });
    if (error) { console.error('[useCreditAnalyses] addComment', error); return { error: error.message }; }
    return {};
  }, [orgId, profile?.user_id]);

  // Upload de anexo do correspondente (devolutiva).
  const uploadAttendantDoc = useCallback(async (analysisId: string, file: File) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const ext = file.name.split('.').pop() || 'bin';
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${orgId}/credit-analyses/${analysisId}/${Date.now()}-${rand}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('whatsapp-media-public')
      .upload(path, file, { upsert: false });
    if (upErr) { console.error('[useCreditAnalyses] upload anexo', upErr); return { error: upErr.message }; }
    const { data: pub } = supabase.storage.from('whatsapp-media-public').getPublicUrl(path);
    const { error: docErr } = await supabase.from('credit_analysis_documents').insert({
      organization_id: orgId,
      analysis_id: analysisId,
      file_url: pub.publicUrl,
      file_name: file.name.slice(0, 200),
      mime_type: file.type || '',
      source: 'manual_upload',
      uploaded_by: profile?.user_id ?? null,
    });
    if (docErr) { console.error('[useCreditAnalyses] inserir anexo', docErr); return { error: docErr.message }; }
    return { path, mimeType: file.type || '' };
  }, [orgId, profile?.user_id]);

  // Extração assistida por IA: lê o anexo (foto/PDF) e devolve os dados extraídos
  // para o correspondente conferir antes de submeter. Não submete a devolutiva.
  const extractFromAttachment = useCallback(async (
    analysisId: string, documentPath: string, mimeType?: string,
  ): Promise<{ extracted?: ExtractedDevolutiva; error?: string; fallback?: boolean }> => {
    const { data, error } = await supabase.functions.invoke('extract-devolutiva-attachment', {
      body: { analysis_id: analysisId, document_path: documentPath, mime_type: mimeType },
    });
    if (error) { console.error('[useCreditAnalyses] extract', error); return { error: error.message }; }
    if (data?.ok && data?.extracted) return { extracted: data.extracted as ExtractedDevolutiva };
    if (data?.error) { console.error('[useCreditAnalyses] extract resp', data.error); return { error: String(data.error) }; }
    return { fallback: true, extracted: (data?.extracted as ExtractedDevolutiva) ?? undefined };
  }, []);

  const startAnalysis = useCallback(async (analysisId: string) => {
    const { error } = await supabase.rpc('start_credit_analysis', { p_analysis_id: analysisId });
    if (error) { console.error('[useCreditAnalyses] startAnalysis', error); return { error: error.message }; }
    return {};
  }, []);

  const submitDevolutiva = useCallback(async (analysisId: string, input: DevolutivaInput) => {
    const { error } = await supabase.rpc('submit_credit_devolutiva', {
      p_analysis_id: analysisId,
      p_result: input.result,
      p_conditions: input.conditions ?? null,
      p_reason: input.reason ?? null,
      p_retomada_prazo_dias: input.retomadaPrazoDias ?? null,
      p_approved_financing_amount: input.approvedFinancingAmount ?? null,
      p_requires_entry: input.requiresEntry ?? null,
      p_custom_fields_response: input.customFieldsResponse ?? null,
    });
    if (error) { console.error('[useCreditAnalyses] submitDevolutiva', error); return { error: error.message }; }
    return {};
  }, []);

  return {
    analyses, loading, error,
    loadDocuments, loadComments, addComment, uploadAttendantDoc, extractFromAttachment,
    startAnalysis, submitDevolutiva,
  };
}

const CreditAnalysesContext = createContext<ReturnType<typeof useCreditAnalyses> | null>(null);

export function CreditAnalysesProvider({ children }: { children: React.ReactNode }) {
  const value = useCreditAnalyses();
  return <CreditAnalysesContext.Provider value={value}>{children}</CreditAnalysesContext.Provider>;
}

export function useCreditAnalysesContext() {
  const ctx = useContext(CreditAnalysesContext);
  if (!ctx) throw new Error('useCreditAnalysesContext deve ser usado dentro de CreditAnalysesProvider');
  return ctx;
}
