import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Loader2, FileText, Clock, CheckCircle2, XCircle, AlertCircle, LogOut, Landmark,
  Play, Send, Paperclip, MessageSquarePlus, ExternalLink, ChevronLeft, Sparkles, DollarSign,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  CreditAnalysesProvider,
  useCreditAnalysesContext,
  type CreditAnalysis,
  type CreditAnalysisDocument,
  type CreditAnalysisComment,
  type CreditAnalysisResult,
} from '@/hooks/useCreditAnalyses';
import { useDevolutivaFields, type DevolutivaFieldDef } from '@/hooks/useDevolutivaFields';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  received: { label: 'Recebida', cls: 'bg-warning/15 text-warning' },
  in_analysis: { label: 'Em análise', cls: 'bg-primary/15 text-primary' },
  returned: { label: 'Devolvida', cls: 'bg-[hsl(150,40%,25%)]/40 text-[hsl(150,60%,65%)]' },
  cancelled: { label: 'Cancelada', cls: 'bg-secondary text-muted-foreground' },
};

const RESULT_META: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  approved: { label: 'Aprovado', cls: 'text-[hsl(150,60%,65%)]', icon: CheckCircle2 },
  approved_conditioned: { label: 'Aprovado c/ condicionamento', cls: 'text-warning', icon: AlertCircle },
  rejected: { label: 'Reprovado', cls: 'text-destructive', icon: XCircle },
};

const isImage = (mime: string) => mime.startsWith('image/');

// ========== CRONÔMETRO ==========

const Stopwatch = ({ since }: { since: string }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - new Date(since).getTime());
  const h = Math.floor(elapsed / 3.6e6);
  const m = Math.floor((elapsed % 3.6e6) / 6e4);
  const s = Math.floor((elapsed % 6e4) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="font-mono text-sm text-primary tabular-nums">
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
    </span>
  );
};

// ========== CAMPO CUSTOMIZÁVEL (Fase 3B) ==========

const CustomFieldInput = ({ field, value, onChange }: {
  field: DevolutivaFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) => {
  const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50';
  if (field.fieldType === 'text') {
    return (
      <div>
        <label className="text-[11px] text-muted-foreground">{field.label}</label>
        <input value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} className={inputCls} />
      </div>
    );
  }
  if (field.fieldType === 'single_select') {
    return (
      <div>
        <label className="text-[11px] text-muted-foreground">{field.label}</label>
        <select value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  // multi_select
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o]);
  return (
    <div>
      <label className="text-[11px] text-muted-foreground">{field.label}</label>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {field.options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            className={`px-2.5 py-1 rounded-lg text-[11px] border active:scale-95 ${
              arr.includes(o) ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
            }`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
};

// ========== DETALHE (Dialog/Sheet simples full-screen mobile) ==========

const AnalysisDetail = ({ analysis, onClose }: { analysis: CreditAnalysis; onClose: () => void }) => {
  const { loadDocuments, loadComments, addComment, uploadAttendantDoc, extractFromAttachment, startAnalysis, submitDevolutiva } = useCreditAnalysesContext();
  const { fields: customFieldDefs } = useDevolutivaFields();
  const [docs, setDocs] = useState<CreditAnalysisDocument[]>([]);
  const [comments, setComments] = useState<CreditAnalysisComment[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [generalComment, setGeneralComment] = useState('');

  // Form de devolutiva
  const [result, setResult] = useState<CreditAnalysisResult>('approved');
  const [conditions, setConditions] = useState('');
  const [reason, setReason] = useState('');
  const [prazo, setPrazo] = useState<string>('');
  // Fase 3B: valor aprovado, exige entrada, campos custom, extração IA.
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [requiresEntry, setRequiresEntry] = useState<boolean>(false);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [extracting, setExtracting] = useState(false);
  const [lastUpload, setLastUpload] = useState<{ path: string; mimeType: string } | null>(null);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);

  const activeCustomFields = useMemo(
    () => customFieldDefs.filter(f => f.isActive),
    [customFieldDefs],
  );

  const refresh = useCallback(async () => {
    setLoadingDocs(true);
    const [d, c] = await Promise.all([loadDocuments(analysis.id), loadComments(analysis.id)]);
    setDocs(d);
    setComments(c);
    setLoadingDocs(false);
  }, [analysis.id, loadDocuments, loadComments]);

  useEffect(() => { refresh(); }, [refresh]);

  const commentsByDoc = useMemo(() => {
    const map: Record<string, CreditAnalysisComment[]> = {};
    for (const c of comments) {
      const key = c.documentId ?? '__general__';
      (map[key] ??= []).push(c);
    }
    return map;
  }, [comments]);

  const handleStart = async () => {
    setBusy(true);
    const { error } = await startAnalysis(analysis.id);
    setBusy(false);
    if (error) alert(`Erro ao iniciar análise: ${error}`);
  };

  const handleAddComment = async (docId: string | null, body: string) => {
    if (!body.trim()) return;
    const { error } = await addComment(analysis.id, body.trim(), docId);
    if (error) { alert(`Erro ao comentar: ${error}`); return; }
    if (docId) setCommentDrafts(prev => ({ ...prev, [docId]: '' }));
    else setGeneralComment('');
    await refresh();
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    const res = await uploadAttendantDoc(analysis.id, file);
    setBusy(false);
    if (res.error) { alert(`Erro no upload: ${res.error}`); return; }
    if (res.path) setLastUpload({ path: res.path, mimeType: res.mimeType ?? file.type ?? '' });
    setExtractMsg(null);
    await refresh();
  };

  // Extração assistida por IA sobre o último anexo enviado.
  const handleExtract = async () => {
    if (!lastUpload) { alert('Envie um anexo (foto/PDF) da devolutiva primeiro.'); return; }
    setExtracting(true);
    setExtractMsg(null);
    const res = await extractFromAttachment(analysis.id, lastUpload.path, lastUpload.mimeType);
    setExtracting(false);
    if (res.error) { setExtractMsg(`Falha na extração: ${res.error}. Preencha manualmente.`); return; }
    const ex = res.extracted;
    if (!ex) { setExtractMsg('Não consegui ler o anexo. Preencha manualmente.'); return; }
    // Pré-preenche o que veio (correspondente confirma/edita).
    if (typeof ex.approved_financing_amount === 'number') setApprovedAmount(String(ex.approved_financing_amount));
    if (typeof ex.requires_entry === 'boolean') setRequiresEntry(ex.requires_entry);
    if (ex.conditions && result === 'approved_conditioned') setConditions(ex.conditions);
    setExtractMsg(res.fallback
      ? 'Li o anexo, mas confirme os valores (não foi salvo automaticamente).'
      : 'Dados pré-preenchidos pela IA. Confira antes de enviar.');
  };

  const handleSubmit = async () => {
    if (result === 'approved_conditioned' && !conditions.trim()) {
      alert('Descreva os condicionamentos.'); return;
    }
    if (result === 'rejected' && !reason.trim()) {
      alert('Descreva o motivo da reprovação.'); return;
    }
    const isApproved = result === 'approved' || result === 'approved_conditioned';
    if (!confirm('Enviar a devolutiva? Esta ação move o lead no funil e não pode ser desfeita pelo painel.')) return;
    setBusy(true);
    const { error } = await submitDevolutiva(analysis.id, {
      result,
      conditions: conditions.trim() || null,
      reason: reason.trim() || null,
      retomadaPrazoDias: prazo.trim() ? Math.max(1, parseInt(prazo, 10) || 0) || null : null,
      approvedFinancingAmount: isApproved && approvedAmount.trim() ? Number(approvedAmount) : null,
      requiresEntry: isApproved ? requiresEntry : null,
      customFieldsResponse: Object.keys(customValues).length ? customValues : null,
    });
    setBusy(false);
    if (error) { alert(`Erro ao enviar devolutiva: ${error}`); return; }
    onClose();
  };

  const sMeta = STATUS_META[analysis.status];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95"><ChevronLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">Análise de crédito</p>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{analysis.dealId}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sMeta.cls}`}>{sMeta.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 lg:max-w-3xl lg:mx-auto w-full">
        {/* Cronômetro */}
        {analysis.status === 'in_analysis' && analysis.analysisStartedAt && (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock size={13} /> Tempo de análise</span>
            <Stopwatch since={analysis.analysisStartedAt} />
          </div>
        )}

        {/* Documentos */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Documentos recebidos</p>
          {loadingDocs ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum documento ainda.</p>
          ) : (
            docs.map(doc => (
              <div key={doc.id} className="bg-card rounded-xl p-3 mb-2 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{doc.fileName || 'documento'}</p>
                    <p className="text-[10px] text-muted-foreground">{doc.mimeType}{doc.source === 'manual_upload' ? ' · anexo do correspondente' : ''}</p>
                  </div>
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="p-2 text-primary active:scale-95"><ExternalLink size={15} /></a>
                </div>
                {isImage(doc.mimeType) && (
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                    <img src={doc.fileUrl} alt={doc.fileName} className="w-full max-h-48 object-contain rounded-lg bg-secondary mb-2" loading="lazy" />
                  </a>
                )}
                {/* Comentários do doc */}
                {(commentsByDoc[doc.id] ?? []).map(c => (
                  <div key={c.id} className="text-[11px] text-foreground bg-secondary rounded-lg px-2.5 py-1.5 mb-1">{c.body}</div>
                ))}
                {/* Comentar este doc (só quando em análise) */}
                {analysis.status === 'in_analysis' && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      value={commentDrafts[doc.id] ?? ''}
                      onChange={e => setCommentDrafts(prev => ({ ...prev, [doc.id]: e.target.value }))}
                      placeholder="Comentar este documento…"
                      className="flex-1 bg-secondary rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none border border-border focus:border-primary/50"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddComment(doc.id, commentDrafts[doc.id] ?? ''); }}
                    />
                    <button onClick={() => handleAddComment(doc.id, commentDrafts[doc.id] ?? '')}
                      className="p-2 rounded-lg bg-primary text-primary-foreground active:scale-95"><MessageSquarePlus size={14} /></button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Comentários gerais */}
        {analysis.status === 'in_analysis' && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observação geral</p>
            {(commentsByDoc['__general__'] ?? []).map(c => (
              <div key={c.id} className="text-[11px] text-foreground bg-secondary rounded-lg px-2.5 py-1.5 mb-1">{c.body}</div>
            ))}
            <div className="flex items-center gap-1.5">
              <input value={generalComment} onChange={e => setGeneralComment(e.target.value)}
                placeholder="Observação sobre o conjunto…"
                className="flex-1 bg-secondary rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none border border-border focus:border-primary/50"
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(null, generalComment); }} />
              <button onClick={() => handleAddComment(null, generalComment)}
                className="p-2 rounded-lg bg-primary text-primary-foreground active:scale-95"><MessageSquarePlus size={14} /></button>
            </div>
          </div>
        )}

        {/* Resultado, se já devolvida */}
        {analysis.status === 'returned' && analysis.result && (() => {
          const rm = RESULT_META[analysis.result];
          const RIcon = rm.icon;
          return (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className={`flex items-center gap-2 font-semibold ${rm.cls}`}>
                <RIcon size={18} /> {rm.label}
              </div>
              {analysis.resultConditions && <p className="text-xs text-foreground mt-2">Condicionamentos: {analysis.resultConditions}</p>}
              {analysis.resultReason && <p className="text-xs text-foreground mt-2">Motivo/obs.: {analysis.resultReason}</p>}
              {analysis.retomadaPrazoDias != null && <p className="text-[11px] text-muted-foreground mt-1">Prazo de retomada: {analysis.retomadaPrazoDias} dias</p>}
            </div>
          );
        })()}
      </div>

      {/* Ações fixas no rodapé */}
      <div className="border-t border-border p-4 lg:max-w-3xl lg:mx-auto w-full">
        {analysis.status === 'received' && (
          <button onClick={handleStart} disabled={busy}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Iniciar análise
          </button>
        )}

        {analysis.status === 'in_analysis' && (
          <div className="space-y-3">
            {/* Resultado */}
            <div className="flex gap-1.5">
              {(['approved', 'approved_conditioned', 'rejected'] as CreditAnalysisResult[]).map(r => {
                const rm = RESULT_META[r];
                return (
                  <button key={r} onClick={() => setResult(r)}
                    className={`flex-1 py-2 rounded-lg text-[11px] font-medium border active:scale-[0.98] ${
                      result === r ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
                    }`}>
                    {rm.label}
                  </button>
                );
              })}
            </div>

            {result === 'approved_conditioned' && (
              <textarea value={conditions} onChange={e => setConditions(e.target.value)} rows={2}
                placeholder="Descreva os condicionamentos…"
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 resize-none" />
            )}
            {result === 'rejected' && (
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="Motivo da reprovação…"
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 resize-none" />
            )}
            {result !== 'rejected' && (
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={1}
                placeholder="Observações (opcional)…"
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 resize-none" />
            )}

            {/* Fase 3B: valor aprovado + exige entrada (só em aprovação) */}
            {result !== 'rejected' && (
              <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-lg px-2.5 flex-1">
                    <DollarSign size={13} className="text-muted-foreground" />
                    <input type="number" min={0} value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)}
                      placeholder="valor aprovado (R$)" className="flex-1 bg-transparent py-2 text-xs text-foreground outline-none" />
                  </div>
                  <button onClick={() => setRequiresEntry(v => !v)}
                    className={`px-3 py-2 rounded-lg text-[11px] font-medium border active:scale-95 ${
                      requiresEntry ? 'bg-warning/15 text-warning border-warning/30' : 'bg-secondary text-muted-foreground border-border'
                    }`}>
                    {requiresEntry ? 'Exige entrada' : 'Sem entrada'}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Usado para casar imóveis compatíveis no briefing do corretor.</p>
              </div>
            )}

            {/* Fase 3B: campos extras configuráveis */}
            {activeCustomFields.length > 0 && (
              <div className="space-y-2">
                {activeCustomFields.map(f => (
                  <CustomFieldInput key={f.id} field={f}
                    value={customValues[f.fieldKey]}
                    onChange={(v) => setCustomValues(prev => ({ ...prev, [f.fieldKey]: v }))} />
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-lg px-2.5 flex-1">
                <Clock size={13} className="text-muted-foreground" />
                <input type="number" min={1} value={prazo} onChange={e => setPrazo(e.target.value)}
                  placeholder="prazo retomada" className="flex-1 bg-transparent py-2 text-xs text-foreground outline-none" />
                <span className="text-[10px] text-muted-foreground">dias</span>
              </div>
              <label className="flex items-center gap-1.5 bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground active:scale-95 cursor-pointer">
                <Paperclip size={14} />
                Anexo
                <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
              </label>
            </div>

            {/* Fase 3B: extração assistida por IA do anexo */}
            {lastUpload && (
              <button onClick={handleExtract} disabled={extracting}
                className="w-full py-2 rounded-lg bg-secondary border border-primary/30 text-primary text-xs font-medium active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
                {extracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Extrair dados do anexo com IA
              </button>
            )}
            {extractMsg && <p className="text-[11px] text-muted-foreground">{extractMsg}</p>}

            <button onClick={handleSubmit} disabled={busy}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar devolutiva
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ========== LISTA ==========

const AnalysisCard = ({ a, onOpen }: { a: CreditAnalysis; onOpen: () => void }) => {
  const sMeta = STATUS_META[a.status];
  return (
    <button onClick={onOpen} className="w-full text-left bg-card rounded-xl p-4 mb-2 border border-border active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <FileText size={15} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground truncate font-mono">{a.dealId}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${sMeta.cls}`}>{sMeta.label}</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
        <span>Recebida {new Date(a.receivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        {a.status === 'in_analysis' && a.analysisStartedAt && (
          <span className="flex items-center gap-1 text-primary"><Clock size={11} /><Stopwatch since={a.analysisStartedAt} /></span>
        )}
        {a.status === 'returned' && a.result && (
          <span className={RESULT_META[a.result].cls}>{RESULT_META[a.result].label}</span>
        )}
      </div>
    </button>
  );
};

const PanelInner = () => {
  const { profile, signOut } = useAuth();
  const { analyses, loading } = useCreditAnalysesContext();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'received' | 'in_analysis' | 'returned'>('received');

  const grouped = useMemo(() => ({
    received: analyses.filter(a => a.status === 'received'),
    in_analysis: analyses.filter(a => a.status === 'in_analysis'),
    returned: analyses.filter(a => a.status === 'returned'),
  }), [analyses]);

  const open = openId ? analyses.find(a => a.id === openId) ?? null : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md lg:max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Landmark size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Painel do Correspondente</p>
              <p className="text-[10px] text-muted-foreground truncate">@{profile?.username}</p>
            </div>
          </div>
          <button onClick={() => signOut()} className="flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary px-2.5 py-1.5 rounded-full active:scale-95">
            <LogOut size={11} /> Sair
          </button>
        </div>

        {/* Tabs por status */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {([
            { id: 'received', label: 'Recebidas', n: grouped.received.length },
            { id: 'in_analysis', label: 'Em análise', n: grouped.in_analysis.length },
            { id: 'returned', label: 'Devolvidas', n: grouped.returned.length },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium shrink-0 active:scale-95 ${
                tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
              {t.label}
              <span className={`text-[10px] px-1.5 rounded-full ${tab === t.id ? 'bg-primary-foreground/20' : 'bg-background/50'}`}>{t.n}</span>
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="px-4 pb-24">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" /><span className="text-xs ml-2">Carregando…</span>
            </div>
          ) : grouped[tab].length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">Nenhuma análise nesta categoria.</p>
          ) : (
            grouped[tab].map(a => <AnalysisCard key={a.id} a={a} onOpen={() => setOpenId(a.id)} />)
          )}
        </div>
      </div>

      {open && <AnalysisDetail key={open.id} analysis={open} onClose={() => setOpenId(null)} />}
    </div>
  );
};

// ========== PÁGINA (guarda de role) ==========

const CorrespondentePanel = () => {
  const { session, loading, profile, roles, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }
  // Acesso: atendente/correspondente (visão restrita) ou admin (visão total).
  const allowed = isAdmin || roles.includes('atendente') || roles.includes('correspondente');
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <CreditAnalysesProvider>
      <PanelInner />
    </CreditAnalysesProvider>
  );
};

export default CorrespondentePanel;
