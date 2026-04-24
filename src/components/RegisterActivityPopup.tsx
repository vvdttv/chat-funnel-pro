/**
 * RegisterActivityPopup — substitui o antigo NextStepPopup.
 *
 * Estrutura em 3 blocos colapsáveis (padrão Enermac):
 *   ① Atividade pendente (se houver)  → marcar feita / adiar
 *   ② Resultado do atendimento        → resumo + temperatura + mudanças (etapa/status/arquivar)
 *   ③ Próxima atividade               → tipo/data/hora/descrição OU "sem próxima"
 *
 * Submissão chama a RPC `resolve_deal_activity` que faz tudo atomicamente.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Loader2, FileText, CalendarDays, Clock, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { LEAD_TEMPERATURES, LOSS_REASONS, type Deal } from '@/data/mockData';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { useDealActivities } from '@/hooks/useDealActivities';
import { renderActivityIcon } from '@/components/ActivityTypesManager';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { useToast } from '@/hooks/use-toast';
import type { ForcedStep } from '@/lib/activityBlocking';

type BlockId = 'pending' | 'outcome' | 'next';

const formatDateTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => new Date().toTimeString().slice(0, 5);

export const RegisterActivityPopup = ({
  deal,
  onClose,
  onConfirm,
  initialStep,
}: {
  deal: Deal;
  onClose: () => void;
  onConfirm: () => void;
  initialStep?: ForcedStep;
}) => {
  const { types, byCode } = useActivityTypes();
  const { pendingActivity, lastDoneActivity, resolveActivity } = useDealActivities(deal.id);
  const { funnels } = useFunnelsContext();
  const { toast } = useToast();

  const activeTypes = useMemo(() => types.filter(t => t.is_active), [types]);
  const funnelStages = funnels.find(f => f.id === deal.funnelId)?.stages || [];

  // Bloco aberto inicial: depende do initialStep
  const initialOpen: BlockId =
    initialStep === 'resolve_overdue' ? 'pending' :
    initialStep === 'schedule_next' ? 'next' : 'outcome';
  const [openBlock, setOpenBlock] = useState<BlockId>(initialOpen);

  // ① Pendente
  const [pendingAction, setPendingAction] = useState<'concluir' | 'adiar' | null>(null);
  const [postponeDays, setPostponeDays] = useState(1);

  // ② Outcome
  const [summary, setSummary] = useState('');
  const [temperature, setTemperature] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [changeStage, setChangeStage] = useState(false);
  const [newStageId, setNewStageId] = useState<string>('');
  const [changeStatus, setChangeStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<'open' | 'won' | 'lost'>('open');
  const [lossReason, setLossReason] = useState('');
  const [archive, setArchive] = useState(false);

  // ③ Next
  const [skipNext, setSkipNext] = useState(false);
  const [nextTypeCode, setNextTypeCode] = useState('');
  const [nextDate, setNextDate] = useState(todayISO());
  const [nextTime, setNextTime] = useState(nowHHMM());
  const [nextDesc, setNextDesc] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeTypes.length > 0 && !nextTypeCode) {
      setNextTypeCode(activeTypes[0].code);
    }
  }, [activeTypes, nextTypeCode]);

  const handleAIExtract = () => {
    setAiLoading(true);
    setTimeout(() => {
      setSummary(prev => prev.trim()
        ? prev
        : `Conversa com ${deal.leadName} sobre ${deal.property}. Lead demonstrou interesse e aguarda próximos passos.`);
      setAiLoading(false);
    }, 1200);
  };

  const validateAndSubmit = async () => {
    // Validação: outcome obrigatório se não há ação só de pendente
    const hasOutcome = summary.trim() !== '' && temperature !== '';
    const hasPendingResolve = pendingActivity && pendingAction !== null;
    if (!hasOutcome && !hasPendingResolve) {
      toast({ title: 'Preencha o resultado do atendimento', variant: 'destructive' });
      setOpenBlock('outcome');
      return;
    }
    if (!skipNext && !archive && !hasPendingResolve) {
      if (!nextTypeCode || !nextDate || !nextTime || !nextDesc.trim()) {
        toast({ title: 'Defina a próxima atividade ou marque "sem próxima"', variant: 'destructive' });
        setOpenBlock('next');
        return;
      }
    }
    if (changeStatus && newStatus === 'lost' && !lossReason) {
      toast({ title: 'Selecione o motivo da perda', variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    // Caso especial: só adiar a pendente (sem outcome novo)
    if (pendingAction === 'adiar' && pendingActivity) {
      const newAt = new Date();
      newAt.setDate(newAt.getDate() + postponeDays);
      const { error } = await resolveActivity({
        nextTypeCode: pendingActivity.type_code,
        nextScheduledAt: newAt.toISOString(),
        nextDescription: pendingActivity.description,
      });
      // Marca a antiga como cancelada (done sem resultado adicional)
      if (!error) {
        await resolveActivity({
          doneActivityId: pendingActivity.id,
          outcomeSummary: 'Adiada pelo corretor',
        });
      }
      setSubmitting(false);
      if (error) {
        toast({ title: 'Falha ao adiar', description: error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Atividade adiada', description: `+${postponeDays} dia(s)` });
      onConfirm();
      return;
    }

    const nextScheduledAt = !skipNext && !archive && nextDate && nextTime
      ? new Date(`${nextDate}T${nextTime}`).toISOString()
      : null;

    const { error } = await resolveActivity({
      doneActivityId: pendingAction === 'concluir' ? pendingActivity?.id : null,
      outcomeSummary: temperature ? `[${temperature}] ${summary}` : summary,
      nextTypeCode: nextScheduledAt ? nextTypeCode : null,
      nextScheduledAt,
      nextDescription: nextDesc,
      newStageId: changeStage ? newStageId : null,
      newStatus: changeStatus ? newStatus : null,
      lossReason: changeStatus && newStatus === 'lost' ? lossReason : null,
      archive,
    });

    setSubmitting(false);
    if (error) {
      toast({ title: 'Falha ao registrar', description: error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Atendimento registrado' });
    onConfirm();
  };

  const Section = ({ id, title, badge, children }: { id: BlockId; title: string; badge?: string; children: React.ReactNode }) => {
    const open = openBlock === id;
    return (
      <div className="bg-secondary/40 rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setOpenBlock(open ? ('' as BlockId) : id)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{title}</span>
            {badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{badge}</span>}
          </div>
          {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>
        {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90" />
      <div
        className="relative w-full max-w-md bg-card rounded-t-2xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Registrar Atendimento</h3>
            <p className="text-[11px] text-muted-foreground">{deal.leadName} · {deal.property}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2.5">
          {/* ① Pendente */}
          {pendingActivity && (
            <Section
              id="pending"
              title={`① Atividade pendente — ${byCode(pendingActivity.type_code)?.label || pendingActivity.type_code}`}
              badge={new Date(pendingActivity.scheduled_at!) < new Date() ? 'vencida' : undefined}
            >
              <p className="text-[11px] text-muted-foreground">
                Agendada para <strong className="text-foreground">{formatDateTime(pendingActivity.scheduled_at)}</strong>
                {pendingActivity.description && <> · {pendingActivity.description}</>}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setPendingAction('concluir'); setOpenBlock('outcome'); }}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    pendingAction === 'concluir' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                  }`}
                >
                  Resolver agora
                </button>
                <button
                  onClick={() => setPendingAction('adiar')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                    pendingAction === 'adiar' ? 'bg-warning text-warning-foreground' : 'bg-secondary text-foreground'
                  }`}
                >
                  Adiar
                </button>
              </div>
              {pendingAction === 'adiar' && (
                <div className="flex gap-2">
                  {[1, 3, 7].map(d => (
                    <button
                      key={d}
                      onClick={() => setPostponeDays(d)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold ${
                        postponeDays === d ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      +{d} dia{d > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ② Outcome */}
          <Section id="outcome" title="② Resultado do atendimento">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-foreground">Resumo *</label>
                <button
                  onClick={handleAIExtract}
                  disabled={aiLoading}
                  className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  {aiLoading ? 'Extraindo…' : 'Extrair com IA'}
                </button>
              </div>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="O que aconteceu neste atendimento?"
                rows={3}
                className="w-full bg-secondary text-xs text-foreground rounded-lg px-2.5 py-2 outline-none border border-border placeholder:text-muted-foreground resize-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-foreground mb-1.5 block">Temperatura *</label>
              <div className="flex gap-1.5">
                {LEAD_TEMPERATURES.map(t => (
                  <button
                    key={t}
                    onClick={() => setTemperature(t)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold ${
                      temperature === t
                        ? t === 'Quente' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : t === 'Morno' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {t === 'Quente' ? '🔥' : t === 'Morno' ? '🌤️' : '❄️'} {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Mudança de etapa */}
            <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
              <Checkbox checked={changeStage} onCheckedChange={v => setChangeStage(!!v)} />
              Mudar etapa
            </label>
            {changeStage && (
              <select
                value={newStageId}
                onChange={e => setNewStageId(e.target.value)}
                className="w-full bg-secondary text-xs text-foreground rounded-lg px-2.5 py-2 border border-border outline-none focus:border-primary/50"
              >
                <option value="">Selecione…</option>
                {funnelStages.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}

            {/* Mudança de status */}
            <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
              <Checkbox checked={changeStatus} onCheckedChange={v => setChangeStatus(!!v)} />
              Mudar status
            </label>
            {changeStatus && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {(['open', 'won', 'lost'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setNewStatus(s)}
                      className={`py-1.5 rounded-lg text-[11px] font-semibold ${
                        newStatus === s
                          ? s === 'won' ? 'bg-primary text-primary-foreground'
                          : s === 'lost' ? 'bg-destructive text-destructive-foreground'
                          : 'bg-secondary text-foreground border border-border'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {s === 'open' ? 'Aberto' : s === 'won' ? 'Ganho' : 'Perdido'}
                    </button>
                  ))}
                </div>
                {newStatus === 'lost' && (
                  <select
                    value={lossReason}
                    onChange={e => setLossReason(e.target.value)}
                    className="w-full bg-secondary text-xs text-foreground rounded-lg px-2.5 py-2 border border-border outline-none focus:border-primary/50"
                  >
                    <option value="">Motivo da perda…</option>
                    {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-[11px] text-destructive cursor-pointer">
              <Checkbox checked={archive} onCheckedChange={v => setArchive(!!v)} />
              <AlertTriangle size={11} /> Arquivar oportunidade
            </label>
          </Section>

          {/* ③ Próxima atividade */}
          {!archive && (
            <Section id="next" title="③ Próxima atividade">
              <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                <Checkbox checked={skipNext} onCheckedChange={v => setSkipNext(!!v)} />
                Sem próxima ação por enquanto
              </label>
              {!skipNext && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-foreground mb-1.5 block">Tipo *</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeTypes.map(t => (
                        <button
                          key={t.code}
                          onClick={() => setNextTypeCode(t.code)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                            nextTypeCode === t.code ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-transparent'
                          }`}
                          style={nextTypeCode === t.code ? undefined : { color: t.color }}
                        >
                          {renderActivityIcon(t.icon, { size: 12 })}
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-foreground mb-1 flex items-center gap-1">
                        <CalendarDays size={11} /> Data *
                      </label>
                      <input
                        type="date"
                        value={nextDate}
                        onChange={e => setNextDate(e.target.value)}
                        className="w-full bg-secondary text-xs text-foreground rounded-lg px-2.5 py-2 border border-border outline-none focus:border-primary/50"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-foreground mb-1 flex items-center gap-1">
                        <Clock size={11} /> Hora *
                      </label>
                      <input
                        type="time"
                        value={nextTime}
                        onChange={e => setNextTime(e.target.value)}
                        className="w-full bg-secondary text-xs text-foreground rounded-lg px-2.5 py-2 border border-border outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-foreground mb-1.5 block">O que vai fazer? *</label>
                    <textarea
                      value={nextDesc}
                      onChange={e => setNextDesc(e.target.value)}
                      placeholder="Descreva brevemente…"
                      rows={2}
                      className="w-full bg-secondary text-xs text-foreground rounded-lg px-2.5 py-2 outline-none border border-border placeholder:text-muted-foreground resize-none focus:border-primary/50"
                    />
                  </div>
                </>
              )}
            </Section>
          )}

          {lastDoneActivity && (
            <p className="text-[10px] text-muted-foreground px-1">
              Última atividade: {formatDateTime(lastDoneActivity.done_at)}{lastDoneActivity.outcome_summary ? ` — ${lastDoneActivity.outcome_summary.slice(0, 60)}` : ''}
            </p>
          )}
        </div>

        <button
          onClick={validateAndSubmit}
          disabled={submitting}
          className="w-full mt-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Registrar e continuar
        </button>
      </div>
    </div>
  );
};
