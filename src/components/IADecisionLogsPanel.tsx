/**
 * Painel de auditoria das ia_decision_logs.
 *
 * Renderizado dentro de IndicadoresPage. Mostra estatísticas resumidas
 * (intents, outcomes, playbooks) e a timeline dos últimos eventos da IA,
 * com filtros simples por etapa/janela e botão para expandir cada decisão.
 */

import { useMemo, useState } from 'react';
import { Bot, Filter, Loader2, RefreshCw, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Layers, Tag, Activity } from 'lucide-react';
import { useIADecisionLogs, type IADecisionLog } from '@/hooks/useIADecisionLogs';

const STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas as etapas' },
  { value: 'E0', label: 'E0 — Recepção' },
  { value: 'E1', label: 'E1 — Qualificação' },
  { value: 'E2', label: 'E2 — Match' },
  { value: 'E3', label: 'E3 — Visita' },
  { value: 'E4a', label: 'E4a — Proposta' },
  { value: 'E4b', label: 'E4b — Fechamento' },
];

const WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Últimas 24h' },
  { value: 7, label: 'Últimos 7d' },
  { value: 30, label: 'Últimos 30d' },
  { value: 0, label: 'Sempre' },
];

const OUTCOME_COLORS: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/30',
  partial: 'bg-warning/15 text-warning border-warning/30',
  failure: 'bg-destructive/15 text-destructive border-destructive/30',
  handoff: 'bg-primary/15 text-primary border-primary/30',
  sem_resultado: 'bg-secondary text-muted-foreground border-border',
};

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-primary/15 text-primary border-primary/30',
  won: 'bg-success/15 text-success border-success/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffM = Math.floor((now - d.getTime()) / 60000);
  if (diffM < 1) return 'agora';
  if (diffM < 60) return `${diffM}m`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const LogRow = ({ log }: { log: IADecisionLog }) => {
  const [open, setOpen] = useState(false);
  const outcomeKey = log.outcome ?? 'sem_resultado';
  const outcomeClass = OUTCOME_COLORS[outcomeKey] ?? OUTCOME_COLORS.sem_resultado;

  return (
    <div className="bg-secondary/50 rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-3 text-left active:bg-secondary transition-colors"
      >
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-md bg-[hsl(270,40%,25%)]/50 border border-[hsl(270,40%,35%)] flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={11} className="text-[hsl(270,60%,70%)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {log.intent && (
                <span className="text-[10px] font-semibold text-foreground bg-card px-1.5 py-0.5 rounded">
                  {log.intent}
                </span>
              )}
              {log.tone && (
                <span className="text-[10px] text-muted-foreground">· {log.tone}</span>
              )}
              {log.playbook_code && (
                <span className="text-[10px] text-primary font-medium">· {log.playbook_code}</span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">{fmtTime(log.created_at)}</span>
            </div>
            <p className="text-xs text-foreground line-clamp-2">{log.action_taken || '(sem descrição)'}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${outcomeClass}`}>
                {outcomeKey}
              </span>
              {log.detected_behavior_codes.length > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  {log.detected_behavior_codes.length} comp.
                </span>
              )}
              {log.applied_rule_codes.length > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  · {log.applied_rule_codes.length} regras
                </span>
              )}
              {log.deal_id && (
                <span className="text-[9px] text-muted-foreground truncate">
                  · deal {log.deal_id.slice(0, 8)}
                </span>
              )}
              <span className="ml-auto">
                {open
                  ? <ChevronUp size={11} className="text-muted-foreground" />
                  : <ChevronDown size={11} className="text-muted-foreground" />}
              </span>
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/50">
          {log.detected_behavior_codes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground mb-1">Comportamentos detectados</p>
              <div className="flex flex-wrap gap-1">
                {log.detected_behavior_codes.map(c => (
                  <span key={c} className="text-[10px] bg-card border border-border rounded px-1.5 py-0.5 font-mono">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {log.applied_rule_codes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground mb-1">Regras aplicadas</p>
              <div className="flex flex-wrap gap-1">
                {log.applied_rule_codes.map(c => (
                  <span key={c} className="text-[10px] bg-card border border-border rounded px-1.5 py-0.5 font-mono">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {Object.keys(log.context).length > 0 && (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground mb-1">Contexto</p>
              <pre className="text-[10px] bg-card border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const IADecisionLogsPanel = () => {
  const [stage, setStage] = useState<string>('');
  const [windowDays, setWindowDays] = useState<number>(7);
  const { logs, stats, loading, error, refresh } = useIADecisionLogs({
    playbookCode: stage || undefined,
    sinceDays: windowDays || undefined,
    limit: 80,
  });

  const topIntents = useMemo(() => stats.byIntent.slice(0, 4), [stats.byIntent]);

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={12} className="text-muted-foreground" />
        <select
          value={stage}
          onChange={e => setStage(e.target.value)}
          className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
        >
          {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={windowDays}
          onChange={e => setWindowDays(Number(e.target.value))}
          className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
        >
          {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={refresh}
          className="ml-auto p-1.5 rounded-md bg-secondary border border-border active:bg-card"
          title="Atualizar"
        >
          {loading
            ? <Loader2 size={11} className="animate-spin text-muted-foreground" />
            : <RefreshCw size={11} className="text-muted-foreground" />}
        </button>
      </div>

      {/* Cabeçalho de stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
          <div className="flex items-center gap-1 text-[9px] uppercase text-muted-foreground mb-1">
            <Sparkles size={10} /> Decisões
          </div>
          <p className="text-base font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
          <p className="text-[9px] uppercase text-muted-foreground mb-1">Intent top</p>
          <p className="text-xs font-semibold text-foreground truncate">
            {topIntents[0]?.[0] ?? '—'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {topIntents[0] ? `${topIntents[0][1]} eventos` : 'sem dados'}
          </p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
          <p className="text-[9px] uppercase text-muted-foreground mb-1">Resultados</p>
          {stats.byOutcome.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <div className="space-y-0.5">
              {stats.byOutcome.slice(0, 2).map(([o, n]) => (
                <p key={o} className="text-[10px] text-foreground truncate">
                  <span className="font-semibold">{n}</span> <span className="text-muted-foreground">{o}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Distribuição por playbook */}
      {stats.byPlaybook.length > 0 && (
        <div className="bg-secondary/50 rounded-lg p-3 border border-border/50">
          <p className="text-[10px] uppercase text-muted-foreground mb-2">Decisões por etapa</p>
          <div className="space-y-1.5">
            {stats.byPlaybook.map(([code, n]) => {
              const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
              return (
                <div key={code}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-foreground font-medium">{code}</span>
                    <span className="text-muted-foreground">{n}</span>
                  </div>
                  <div className="h-1 bg-card rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <p className="text-[10px] uppercase text-muted-foreground mb-2">Timeline</p>
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
            <Loader2 size={12} className="animate-spin mr-1.5" /> Carregando…
          </div>
        ) : error ? (
          <div className="flex items-center gap-1.5 text-destructive text-xs p-3 bg-destructive/10 rounded-lg border border-destructive/30">
            <AlertTriangle size={12} /> {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-xs">
            Nenhuma decisão da IA registrada nesse período.
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map(l => <LogRow key={l.id} log={l} />)}
          </div>
        )}
      </div>
    </div>
  );
};
