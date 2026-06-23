import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Analises de garantia locaticia (tabela `guarantee_analyses`), Fase J-2a.
 * Equivalente funcional ao correspondente bancario, mas para LOCACAO: a etapa
 * `loc-analise-garantia` do funil `fun-ia-locacao` gera uma analise (fiador /
 * caucao / seguro-fianca / titulo de capitalizacao) que a equipe interna
 * (analista = `profiles`, nao atendente de banco) trabalha no painel.
 *
 * RLS: admin ve todas; o analista atribuido ve as suas. Acoes de negocio
 * (iniciar analise, enviar devolutiva) passam por RPCs SECURITY DEFINER que
 * validam status. Espelha o ciclo de vida de credit_analyses.
 */
export type GuaranteeAnalysisStatus = 'received' | 'in_analysis' | 'returned' | 'cancelled';
export type GuaranteeAnalysisResult = 'approved' | 'approved_conditioned' | 'rejected';
export type GuaranteeType = 'fiador' | 'caucao' | 'seguro_fianca' | 'titulo_capitalizacao';

export interface GuaranteeAnalysis {
  id: string;
  dealId: string;
  guaranteeType: GuaranteeType | null;
  analystId: string | null;
  providerName: string | null;
  status: GuaranteeAnalysisStatus;
  result: GuaranteeAnalysisResult | null;
  resultConditions: string | null;
  resultReason: string | null;
  retomadaPrazoDias: number | null;
  receivedAt: string;
  analysisStartedAt: string | null;
  returnedAt: string | null;
}

export interface GuaranteeAnalysisDocument {
  id: string;
  analysisId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  source: string;
  createdAt: string;
}

export interface GuaranteeAnalysisComment {
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
  guarantee_type: GuaranteeType | null;
  analyst_id: string | null;
  provider_name: string | null;
  status: GuaranteeAnalysisStatus;
  result: GuaranteeAnalysisResult | null;
  result_conditions: string | null;
  result_reason: string | null;
  retomada_prazo_dias: number | null;
  received_at: string;
  analysis_started_at: string | null;
  returned_at: string | null;
};

function rowToAnalysis(r: DBAnalysisRow): GuaranteeAnalysis {
  return {
    id: r.id,
    dealId: r.deal_id,
    guaranteeType: r.guarantee_type,
    analystId: r.analyst_id,
    providerName: r.provider_name,
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

export interface GuaranteeDevolutivaInput {
  result: GuaranteeAnalysisResult;
  guaranteeType?: GuaranteeType | null;
  conditions?: string | null;
  reason?: string | null;
  retomadaPrazoDias?: number | null;
  customFieldsResponse?: Record<string, unknown> | null;
}

export function useGuaranteeAnalyses() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [analyses, setAnalyses] = useState<GuaranteeAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setAnalyses([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('guarantee_analyses')
        .select('*')
        .order('received_at', { ascending: false });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setAnalyses((data || []).map(r => rowToAnalysis(r as DBAnalysisRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel('guarantee-analyses-org-' + orgId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guarantee_analyses' }, (payload) => {
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

  const loadDocuments = useCallback(async (analysisId: string): Promise<GuaranteeAnalysisDocument[]> => {
    const { data, error } = await supabase
      .from('guarantee_analysis_documents')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[useGuaranteeAnalyses] docs', error); return []; }
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

  const loadComments = useCallback(async (analysisId: string): Promise<GuaranteeAnalysisComment[]> => {
    const { data, error } = await supabase
      .from('guarantee_analysis_comments')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[useGuaranteeAnalyses] comments', error); return []; }
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
    const { error } = await supabase.from('guarantee_analysis_comments').insert({
      organization_id: orgId,
      analysis_id: analysisId,
      document_id: documentId ?? null,
      author_id: profile.user_id,
      body,
    });
    if (error) { console.error('[useGuaranteeAnalyses] addComment', error); return { error: error.message }; }
    return {};
  }, [orgId, profile?.user_id]);

  // Upload de anexo da garantia (apolice de seguro-fianca, ficha do fiador, etc.).
  const uploadAnalystDoc = useCallback(async (analysisId: string, file: File) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const ext = file.name.split('.').pop() || 'bin';
    const rand = Math.random().toString(36).slice(2, 8);
    const path = orgId + '/guarantee-analyses/' + analysisId + '/' + Date.now() + '-' + rand + '.' + ext;
    const { error: upErr } = await supabase.storage
      .from('whatsapp-media-public')
      .upload(path, file, { upsert: false });
    if (upErr) { console.error('[useGuaranteeAnalyses] upload anexo', upErr); return { error: upErr.message }; }
    const { data: pub } = supabase.storage.from('whatsapp-media-public').getPublicUrl(path);
    const { error: docErr } = await supabase.from('guarantee_analysis_documents').insert({
      organization_id: orgId,
      analysis_id: analysisId,
      file_url: pub.publicUrl,
      file_name: file.name.slice(0, 200),
      mime_type: file.type || '',
      source: 'manual_upload',
    });
    if (docErr) { console.error('[useGuaranteeAnalyses] inserir anexo', docErr); return { error: docErr.message }; }
    return { path, mimeType: file.type || '' };
  }, [orgId]);

  const startAnalysis = useCallback(async (analysisId: string) => {
    const { error } = await supabase.rpc('start_guarantee_analysis', { p_analysis_id: analysisId });
    if (error) { console.error('[useGuaranteeAnalyses] startAnalysis', error); return { error: error.message }; }
    return {};
  }, []);

  const submitDevolutiva = useCallback(async (analysisId: string, input: GuaranteeDevolutivaInput) => {
    const { error } = await supabase.rpc('submit_guarantee_devolutiva', {
      p_analysis_id: analysisId,
      p_result: input.result,
      p_guarantee_type: input.guaranteeType ?? null,
      p_conditions: input.conditions ?? null,
      p_reason: input.reason ?? null,
      p_retomada_prazo_dias: input.retomadaPrazoDias ?? null,
      p_custom_fields_response: (input.customFieldsResponse ?? null) as never,
    });
    if (error) { console.error('[useGuaranteeAnalyses] submitDevolutiva', error); return { error: error.message }; }
    return {};
  }, []);

  return {
    analyses, loading, error,
    loadDocuments, loadComments, addComment, uploadAnalystDoc,
    startAnalysis, submitDevolutiva,
  };
}

const GuaranteeAnalysesContext = createContext<ReturnType<typeof useGuaranteeAnalyses> | null>(null);

export function GuaranteeAnalysesProvider({ children }: { children: React.ReactNode }) {
  const value = useGuaranteeAnalyses();
  return <GuaranteeAnalysesContext.Provider value={value}>{children}</GuaranteeAnalysesContext.Provider>;
}

export function useGuaranteeAnalysesContext() {
  const ctx = useContext(GuaranteeAnalysesContext);
  if (!ctx) throw new Error('useGuaranteeAnalysesContext deve ser usado dentro de GuaranteeAnalysesProvider');
  return ctx;
}
