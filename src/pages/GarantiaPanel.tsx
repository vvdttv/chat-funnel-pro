import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Loader2, FileText, Clock, CheckCircle2, XCircle, AlertCircle, LogOut, ShieldCheck,
  Play, Send, Paperclip, MessageSquarePlus, ExternalLink, ChevronLeft, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  GuaranteeAnalysesProvider,
  useGuaranteeAnalysesContext,
  type GuaranteeAnalysis,
  type GuaranteeAnalysisDocument,
  type GuaranteeAnalysisComment,
  type GuaranteeAnalysisResult,
  type GuaranteeType,
} from '@/hooks/useGuaranteeAnalyses';
import { InsurersProvider, useInsurersContext } from '@/hooks/useInsurers';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  received: { label: 'Recebida', cls: 'bg-warning/15 text-warning' },
  in_analysis: { label: 'Em analise', cls: 'bg-primary/15 text-primary' },
  returned: { label: 'Devolvida', cls: 'bg-[hsl(150,40%,25%)]/40 text-[hsl(150,60%,65%)]' },
  cancelled: { label: 'Cancelada', cls: 'bg-secondary text-muted-foreground' },
};

const RESULT_META: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  approved: { label: 'Aprovada', cls: 'text-[hsl(150,60%,65%)]', icon: CheckCircle2 },
  approved_conditioned: { label: 'Aprovada c/ condicionamento', cls: 'text-warning', icon: AlertCircle },
  rejected: { label: 'Reprovada', cls: 'text-destructive', icon: XCircle },
};

const GUARANTEE_TYPES: { value: GuaranteeType; label: string }[] = [
  { value: 'fiador', label: 'Fiador' },
  { value: 'caucao', label: 'Caucao' },
  { value: 'seguro_fianca', label: 'Seguro-fianca' },
  { value: 'titulo_capitalizacao', label: 'Titulo de capitalizacao' },
];

const GUARANTEE_LABEL: Record<string, string> = {
  fiador: 'Fiador',
  caucao: 'Caucao',
  seguro_fianca: 'Seguro-fianca',
  titulo_capitalizacao: 'Titulo de capitalizacao',
};

const isImage = (mime: string) => mime.startsWith('image/');

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
      {h > 0 ? pad(h) + ':' : ''}{pad(m)}:{pad(s)}
    </span>
  );
};

// ========== OVERRIDE DE SEGURADORA ==========

/**
 * Permite ao admin trocar a seguradora/atendente da analise quando a roleta
 * caiu em alguem indisponivel. So aparece para tipos que envolvem seguradora
 * (seguro_fianca, titulo_capitalizacao) e enquanto a analise esta em curso
 * (status in_analysis). A RPC `assign_insurer_to_analysis` valida que o
 * atendente pertence a seguradora escolhida.
 */
const InsurerOverrideCard = ({ analysis }: { analysis: GuaranteeAnalysis }) => {
  const { insurers, attendants, loading } = useInsurersContext();
  const { assignInsurerToAnalysis } = useGuaranteeAnalysesContext();
  const [editing, setEditing] = useState(false);
  const [insurerId, setInsurerId] = useState<string>(analysis.insurerId ?? '');
  const [attendantId, setAttendantId] = useState<string>(analysis.insurerAttendantId ?? '');
  const [busy, setBusy] = useState(false);

  const isRoulettedType =
    analysis.guaranteeType === 'seguro_fianca' || analysis.guaranteeType === 'titulo_capitalizacao';
  const canOverride = isRoulettedType && analysis.status === 'in_analysis';

  const currentInsurer = useMemo(
    () => insurers.find(i => i.id === analysis.insurerId) ?? null,
    [insurers, analysis.insurerId],
  );
  const currentAttendant = useMemo(
    () => attendants.find(a => a.id === analysis.insurerAttendantId) ?? null,
    [attendants, analysis.insurerAttendantId],
  );

  const insurerOptions = useMemo(
    () => insurers.filter(i => i.isActive).sort((a, b) => a.position - b.position),
    [insurers],
  );
  const attendantOptions = useMemo(
    () => attendants
      .filter(a => a.isActive && a.insurerId === insurerId)
      .sort((x, y) => x.position - y.position),
    [attendants, insurerId],
  );

  if (!canOverride) return null;

  const handleApply = async () => {
    if (!insurerId) { alert('Selecione a seguradora.'); return; }
    setBusy(true);
    const { error } = await assignInsurerToAnalysis(
      analysis.id,
      insurerId,
      attendantId || null,
    );
    setBusy(false);
    if (error) { alert('Erro ao reatribuir: ' + error); return; }
    setEditing(false);
    // Realtime do GuaranteeAnalysesProvider atualiza a analise. Nao fechamos
    // o detalhe para o admin ver o novo atendente refletido no card.
  };

  const handleCancel = () => {
    setInsurerId(analysis.insurerId ?? '');
    setAttendantId(analysis.insurerAttendantId ?? '');
    setEditing(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck size={13} /> Seguradora atribuida
        </span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-primary font-medium active:scale-95 flex items-center gap-1"
          >
            <RefreshCw size={11} /> Trocar
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {currentInsurer ? currentInsurer.name : <span className="text-muted-foreground italic">Sem seguradora</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Atendente: {currentAttendant ? currentAttendant.name : <span className="italic">sem atendente</span>}
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" /> Carregando seguradoras...
        </div>
      ) : insurerOptions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-2">
          Nenhuma seguradora ativa cadastrada. Cadastre em Config &gt; Seguradoras.
        </p>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Seguradora</label>
            <select
              value={insurerId}
              onChange={e => { setInsurerId(e.target.value); setAttendantId(''); }}
              className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50"
            >
              <option value="">(selecione)</option>
              {insurerOptions.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          {insurerId && (
            <div>
              <label className="text-[10px] text-muted-foreground">Atendente (opcional)</label>
              <select
                value={attendantId}
                onChange={e => setAttendantId(e.target.value)}
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50"
              >
                <option value="">(roleta da seguradora escolhe)</option>
                {attendantOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {attendantOptions.length === 0 && (
                <p className="text-[10px] text-warning mt-1">
                  Esta seguradora nao tem atendentes ativos. A RPC vai falhar; cadastre antes.
                </p>
              )}
            </div>
          )}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={handleCancel}
              disabled={busy}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary text-muted-foreground text-xs font-medium active:scale-95"
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              disabled={busy || !insurerId}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ========== DETALHE ==========

const AnalysisDetail = ({ analysis, onClose }: { analysis: GuaranteeAnalysis; onClose: () => void }) => {
  const { loadDocuments, loadComments, addComment, uploadAnalystDoc, startAnalysis, submitDevolutiva, setGuaranteeType: rpcSetGuaranteeType } = useGuaranteeAnalysesContext();
  const [docs, setDocs] = useState<GuaranteeAnalysisDocument[]>([]);
  const [comments, setComments] = useState<GuaranteeAnalysisComment[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [generalComment, setGeneralComment] = useState('');
  const [typeDraft, setTypeDraft] = useState<GuaranteeType | ''>(analysis.guaranteeType ?? '');

  // Form de devolutiva
  const [result, setResult] = useState<GuaranteeAnalysisResult>('approved');
  const [guaranteeType, setGuaranteeType] = useState<GuaranteeType | ''>(analysis.guaranteeType ?? '');
  const [conditions, setConditions] = useState('');
  const [reason, setReason] = useState('');
  const [prazo, setPrazo] = useState<string>('');

  const refresh = useCallback(async () => {
    setLoadingDocs(true);
    const [d, c] = await Promise.all([loadDocuments(analysis.id), loadComments(analysis.id)]);
    setDocs(d);
    setComments(c);
    setLoadingDocs(false);
  }, [analysis.id, loadDocuments, loadComments]);

  useEffect(() => { refresh(); }, [refresh]);

  const commentsByDoc = useMemo(() => {
    const map: Record<string, GuaranteeAnalysisComment[]> = {};
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
    if (error) alert('Erro ao iniciar analise: ' + error);
  };

  const handleAddComment = async (docId: string | null, body: string) => {
    if (!body.trim()) return;
    const { error } = await addComment(analysis.id, body.trim(), docId);
    if (error) { alert('Erro ao comentar: ' + error); return; }
    if (docId) setCommentDrafts(prev => ({ ...prev, [docId]: '' }));
    else setGeneralComment('');
    await refresh();
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    const res = await uploadAnalystDoc(analysis.id, file);
    setBusy(false);
    if (res.error) { alert('Erro no upload: ' + res.error); return; }
    await refresh();
  };

  const handleSubmit = async () => {
    if (!guaranteeType) { alert('Selecione o tipo de garantia.'); return; }
    if (result === 'approved_conditioned' && !conditions.trim()) {
      alert('Descreva os condicionamentos.'); return;
    }
    if (result === 'rejected' && !reason.trim()) {
      alert('Descreva o motivo da reprovacao.'); return;
    }
    if (!confirm('Enviar a devolutiva? Esta acao move o lead no funil e nao pode ser desfeita pelo painel.')) return;
    setBusy(true);
    const { error } = await submitDevolutiva(analysis.id, {
      result,
      guaranteeType: guaranteeType || null,
      conditions: conditions.trim() || null,
      reason: reason.trim() || null,
      retomadaPrazoDias: prazo.trim() ? Math.max(1, parseInt(prazo, 10) || 0) || null : null,
    });
    setBusy(false);
    if (error) { alert('Erro ao enviar devolutiva: ' + error); return; }
    onClose();
  };

  const sMeta = STATUS_META[analysis.status];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95"><ChevronLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">Analise de garantia</p>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{analysis.dealId}</p>
        </div>
        <span className={'text-[10px] px-2 py-0.5 rounded-full font-medium ' + sMeta.cls}>{sMeta.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 lg:max-w-3xl lg:mx-auto w-full">
        {analysis.status === 'in_analysis' && analysis.analysisStartedAt && (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock size={13} /> Tempo de analise</span>
            <Stopwatch since={analysis.analysisStartedAt} />
          </div>
        )}

        {analysis.guaranteeType && (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5"><ShieldCheck size={13} /> Tipo de garantia</span>
            <span className="text-sm font-medium text-foreground">{GUARANTEE_LABEL[analysis.guaranteeType] ?? analysis.guaranteeType}</span>
          </div>
        )}

        <InsurerOverrideCard analysis={analysis} />

        {analysis.status === 'received' && !analysis.guaranteeType && (
          <div className="bg-card border border-warning/30 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-warning flex items-center gap-1.5"><ShieldCheck size={13} /> Definir tipo de garantia</p>
            <p className="text-[11px] text-muted-foreground">Selecione o tipo para que a analise siga. Se escolher seguro-fianca ou titulo de capitalizacao, a seguradora e o atendente sao roteados automaticamente pela roleta.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {GUARANTEE_TYPES.map(t => (
                <button key={t.value} onClick={() => setTypeDraft(t.value)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium active:scale-95 ${typeDraft === t.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={async () => {
              if (!typeDraft) return;
              setBusy(true);
              const r = await rpcSetGuaranteeType(analysis.id, typeDraft as GuaranteeType);
              setBusy(false);
              if (r.error) alert('Erro: ' + r.error);
              else if (r.routed) alert('Tipo definido. Roteado automaticamente para a seguradora pela roleta.');
            }} disabled={!typeDraft || busy}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {busy && <Loader2 size={12} className="animate-spin" />}
              Confirmar tipo
            </button>
          </div>
        )}

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
                    <p className="text-[10px] text-muted-foreground">{doc.mimeType}{doc.source === 'manual_upload' ? ' - anexo do analista' : ''}</p>
                  </div>
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="p-2 text-primary active:scale-95"><ExternalLink size={15} /></a>
                </div>
                {isImage(doc.mimeType) && (
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                    <img src={doc.fileUrl} alt={doc.fileName} className="w-full max-h-48 object-contain rounded-lg bg-secondary mb-2" loading="lazy" />
                  </a>
                )}
                {(commentsByDoc[doc.id] ?? []).map(c => (
                  <div key={c.id} className="text-[11px] text-foreground bg-secondary rounded-lg px-2.5 py-1.5 mb-1">{c.body}</div>
                ))}
                {analysis.status === 'in_analysis' && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      value={commentDrafts[doc.id] ?? ''}
                      onChange={e => setCommentDrafts(prev => ({ ...prev, [doc.id]: e.target.value }))}
                      placeholder="Comentar este documento..."
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

        {analysis.status === 'in_analysis' && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observacao geral</p>
            {(commentsByDoc['__general__'] ?? []).map(c => (
              <div key={c.id} className="text-[11px] text-foreground bg-secondary rounded-lg px-2.5 py-1.5 mb-1">{c.body}</div>
            ))}
            <div className="flex items-center gap-1.5">
              <input value={generalComment} onChange={e => setGeneralComment(e.target.value)}
                placeholder="Observacao sobre o conjunto..."
                className="flex-1 bg-secondary rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none border border-border focus:border-primary/50"
                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(null, generalComment); }} />
              <button onClick={() => handleAddComment(null, generalComment)}
                className="p-2 rounded-lg bg-primary text-primary-foreground active:scale-95"><MessageSquarePlus size={14} /></button>
            </div>
          </div>
        )}

        {analysis.status === 'returned' && analysis.result && (() => {
          const rm = RESULT_META[analysis.result];
          const RIcon = rm.icon;
          return (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className={'flex items-center gap-2 font-semibold ' + rm.cls}>
                <RIcon size={18} /> {rm.label}
              </div>
              {analysis.resultConditions && <p className="text-xs text-foreground mt-2">Condicionamentos: {analysis.resultConditions}</p>}
              {analysis.resultReason && <p className="text-xs text-foreground mt-2">Motivo/obs.: {analysis.resultReason}</p>}
              {analysis.retomadaPrazoDias != null && <p className="text-[11px] text-muted-foreground mt-1">Prazo de retomada: {analysis.retomadaPrazoDias} dias</p>}
            </div>
          );
        })()}
      </div>

      <div className="border-t border-border p-4 lg:max-w-3xl lg:mx-auto w-full">
        {analysis.status === 'received' && (
          <button onClick={handleStart} disabled={busy}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Iniciar analise
          </button>
        )}

        {analysis.status === 'in_analysis' && (
          <div className="space-y-3">
            {/* Tipo de garantia */}
            <div>
              <label className="text-[11px] text-muted-foreground">Tipo de garantia</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {GUARANTEE_TYPES.map(g => (
                  <button key={g.value} type="button" onClick={() => setGuaranteeType(g.value)}
                    className={'px-2.5 py-1 rounded-lg text-[11px] border active:scale-95 ' + (
                      guaranteeType === g.value ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
                    )}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resultado */}
            <div className="flex gap-1.5">
              {(['approved', 'approved_conditioned', 'rejected'] as GuaranteeAnalysisResult[]).map(r => {
                const rm = RESULT_META[r];
                return (
                  <button key={r} onClick={() => setResult(r)}
                    className={'flex-1 py-2 rounded-lg text-[11px] font-medium border active:scale-[0.98] ' + (
                      result === r ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
                    )}>
                    {rm.label}
                  </button>
                );
              })}
            </div>

            {result === 'approved_conditioned' && (
              <textarea value={conditions} onChange={e => setConditions(e.target.value)} rows={2}
                placeholder="Descreva os condicionamentos..."
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 resize-none" />
            )}
            {result === 'rejected' && (
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="Motivo da reprovacao..."
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 resize-none" />
            )}
            {result !== 'rejected' && (
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={1}
                placeholder="Observacoes (opcional)..."
                className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 resize-none" />
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

const AnalysisCard = ({ a, onOpen }: { a: GuaranteeAnalysis; onOpen: () => void }) => {
  const sMeta = STATUS_META[a.status];
  return (
    <button onClick={onOpen} className="w-full text-left bg-card rounded-xl p-4 mb-2 border border-border active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <ShieldCheck size={15} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground truncate font-mono">{a.dealId}</p>
        </div>
        <span className={'text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ' + sMeta.cls}>{sMeta.label}</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
        <span>Recebida {new Date(a.receivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        {a.guaranteeType && <span className="text-foreground">{GUARANTEE_LABEL[a.guaranteeType] ?? a.guaranteeType}</span>}
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
  const { analyses, loading } = useGuaranteeAnalysesContext();
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Painel de Garantia Locaticia</p>
              <p className="text-[10px] text-muted-foreground truncate">@{profile?.username}</p>
            </div>
          </div>
          <button onClick={() => signOut()} className="flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary px-2.5 py-1.5 rounded-full active:scale-95">
            <LogOut size={11} /> Sair
          </button>
        </div>

        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {([
            { id: 'received', label: 'Recebidas', n: grouped.received.length },
            { id: 'in_analysis', label: 'Em analise', n: grouped.in_analysis.length },
            { id: 'returned', label: 'Devolvidas', n: grouped.returned.length },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium shrink-0 active:scale-95 ' + (
                tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              )}>
              {t.label}
              <span className={'text-[10px] px-1.5 rounded-full ' + (tab === t.id ? 'bg-primary-foreground/20' : 'bg-background/50')}>{t.n}</span>
            </button>
          ))}
        </div>

        <div className="px-4 pb-24">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" /><span className="text-xs ml-2">Carregando...</span>
            </div>
          ) : grouped[tab].length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">Nenhuma analise nesta categoria.</p>
          ) : (
            grouped[tab].map(a => <AnalysisCard key={a.id} a={a} onOpen={() => setOpenId(a.id)} />)
          )}
        </div>
      </div>

      {open && <AnalysisDetail key={open.id} analysis={open} onClose={() => setOpenId(null)} />}
    </div>
  );
};

// ========== PAGINA (guarda de role) ==========

const GarantiaPanel = () => {
  const { session, loading, profile, isAdmin } = useAuth();

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
  // Acesso: a analise de garantia e trabalhada pela equipe interna. O RLS ja
  // restringe (admin ve todas; analista atribuido ve as suas). Aqui liberamos
  // para admin (visao total); analistas individuais acessam via deep-link.
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <GuaranteeAnalysesProvider>
      <InsurersProvider>
        <PanelInner />
      </InsurersProvider>
    </GuaranteeAnalysesProvider>
  );
};

export default GarantiaPanel;
