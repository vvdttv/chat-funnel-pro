import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Bot, Check, Clock, Edit3, Loader2, RefreshCw, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';

interface QueueItem {
  id: string;
  deal_id: string;
  funnel_id: string;
  stage_id: string;
  status: string;
  autonomy_mode: string;
  lead_message: string;
  suggested_response: string | null;
  final_response: string | null;
  scheduled_send_at: string | null;
  created_at: string;
  rejected_reason: string | null;
}

interface DealSummary {
  id: string;
  lead_name: string;
  property: string;
}

const STATUS_LABEL: Record<string, { label: string; tone: 'amber' | 'green' | 'red' | 'muted' }> = {
  awaiting_approval: { label: 'Aguardando aprovação', tone: 'amber' },
  approved: { label: 'Aprovada', tone: 'green' },
  sent: { label: 'Enviada', tone: 'green' },
  rejected: { label: 'Rejeitada', tone: 'red' },
  failed: { label: 'Falhou', tone: 'red' },
  pending: { label: 'Processando…', tone: 'muted' },
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const AIApprovalQueue = () => {
  const { profile } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [deals, setDeals] = useState<Record<string, DealSummary>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const orgId = profile?.organization_id;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('ai_response_queue')
      .select('*')
      .eq('organization_id', orgId)
      .in('status', ['awaiting_approval', 'approved', 'sent', 'rejected', 'failed'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[AIApprovalQueue] load', error);
      toast.error('Erro ao carregar fila de respostas');
      setLoading(false);
      return;
    }
    setItems(data as QueueItem[]);

    // Buscar dados básicos dos deals envolvidos
    const ids = Array.from(new Set((data || []).map((d) => d.deal_id)));
    if (ids.length > 0) {
      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, lead_name, property')
        .in('id', ids);
      const map: Record<string, DealSummary> = {};
      (dealRows || []).forEach((d) => {
        map[d.id] = d as DealSummary;
      });
      setDeals(map);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: atualiza quando algo muda na fila da org
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`ai-queue-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_response_queue', filter: `organization_id=eq.${orgId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, load]);

  const callApprove = async (
    queueId: string,
    action: 'approve' | 'edit_and_approve' | 'reject',
    extra: { edited_text?: string; reject_reason?: string } = {},
  ) => {
    setBusyId(queueId);
    try {
      const { data, error } = await supabase.functions.invoke('approve-ai-response', {
        body: { queue_id: queueId, action, ...extra },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(
        action === 'reject'
          ? 'Resposta rejeitada'
          : action === 'edit_and_approve'
          ? 'Resposta editada e aprovada'
          : 'Resposta aprovada',
      );
      setEditing((p) => {
        const n = { ...p };
        delete n[queueId];
        return n;
      });
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'erro';
      toast.error(`Falha: ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  if (!orgId) return null;

  const pending = items.filter((i) => i.status === 'awaiting_approval');
  const history = items.filter((i) => i.status !== 'awaiting_approval');

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bot size={14} className="text-primary" />
            Aprovação de respostas IA
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {pending.length} aguardando · {history.length} no histórico
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 -m-1 text-muted-foreground active:scale-95"
          aria-label="Atualizar"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {loading && items.length === 0 && (
        <div className="bg-card rounded-xl p-6 text-center">
          <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="bg-card rounded-xl p-6 text-center">
          <Bot size={28} className="text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-xs text-muted-foreground">
            Nenhuma resposta da IA na fila ainda.
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Quando um lead enviar uma mensagem e a IA responder, ela aparecerá aqui.
          </p>
        </div>
      )}

      {/* Pendentes */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide px-1">
            Aguardando você
          </p>
          {pending.map((item) => {
            const deal = deals[item.deal_id];
            const draft = editing[item.id];
            const isEditing = draft !== undefined;
            const text = isEditing ? draft : item.suggested_response ?? '';
            return (
              <div
                key={item.id}
                className="bg-card border border-amber-500/30 rounded-xl p-3 space-y-2.5"
              >
                {/* Header do card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {deal?.lead_name ?? `Deal ${item.deal_id.slice(0, 8)}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {deal?.property || `${item.funnel_id} · ${item.stage_id}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground shrink-0">
                    <Clock size={10} />
                    {fmtTime(item.created_at)}
                  </div>
                </div>

                {/* Mensagem do lead */}
                <div className="bg-secondary rounded-lg p-2">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Lead disse
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">
                    {item.lead_message}
                  </p>
                </div>

                {/* Sugestão da IA (editável) */}
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[9px] font-semibold text-primary uppercase tracking-wide">
                      IA sugere
                    </p>
                    {!isEditing && (
                      <button
                        onClick={() => setEditing((p) => ({ ...p, [item.id]: item.suggested_response ?? '' }))}
                        className="text-[10px] text-primary flex items-center gap-1 active:scale-95"
                      >
                        <Edit3 size={10} /> Editar
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={text}
                      onChange={(e) => setEditing((p) => ({ ...p, [item.id]: e.target.value }))}
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-primary/50 min-h-[80px] resize-y"
                    />
                  ) : (
                    <p className="text-xs text-foreground whitespace-pre-wrap">
                      {item.suggested_response || <span className="italic text-muted-foreground">— sem texto —</span>}
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={busyId === item.id}
                    onClick={() =>
                      callApprove(item.id, isEditing ? 'edit_and_approve' : 'approve', {
                        edited_text: isEditing ? text : undefined,
                      })
                    }
                    className="flex-1 bg-[hsl(142_76%_36%)] text-primary-foreground rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {busyId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {isEditing ? 'Editar e enviar' : 'Aprovar'}
                  </button>
                  <button
                    disabled={busyId === item.id}
                    onClick={() => {
                      const reason = window.prompt('Motivo da rejeição (opcional):') ?? undefined;
                      callApprove(item.id, 'reject', { reject_reason: reason });
                    }}
                    className="flex-1 bg-secondary text-foreground rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    <XIcon size={12} /> Rejeitar
                  </button>
                  {isEditing && (
                    <button
                      onClick={() =>
                        setEditing((p) => {
                          const n = { ...p };
                          delete n[item.id];
                          return n;
                        })
                      }
                      className="px-3 py-2 text-[10px] text-muted-foreground active:scale-95"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pt-2">
            Histórico
          </p>
          {history.map((item) => {
            const deal = deals[item.deal_id];
            const meta = STATUS_LABEL[item.status] ?? { label: item.status, tone: 'muted' as const };
            const toneClass =
              meta.tone === 'green'
                ? 'bg-[hsl(142_76%_36%/0.15)] text-[hsl(142_76%_50%)]'
                : meta.tone === 'red'
                ? 'bg-destructive/15 text-destructive'
                : meta.tone === 'amber'
                ? 'bg-amber-500/15 text-amber-400'
                : 'bg-secondary text-muted-foreground';
            return (
              <div key={item.id} className="bg-card rounded-lg p-2.5 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${toneClass}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {deal?.lead_name ?? item.deal_id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="text-[10px] text-foreground line-clamp-2">
                    {item.final_response || item.suggested_response || item.rejected_reason || '—'}
                  </p>
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {fmtTime(item.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
