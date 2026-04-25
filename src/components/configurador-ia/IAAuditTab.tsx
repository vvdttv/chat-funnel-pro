/**
 * IAAuditTab — aba "Auditoria" dentro de Config IA.
 *
 * Lista decisões da IA agrupadas por deal. Cada decisão mostra os critérios
 * usados em linguagem clara e oferece "Corrigir esse comportamento" para
 * persistir um ajuste que volta como nova configuração.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Wrench, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import { useIADecisionLogs, type IADecisionLog } from '@/hooks/useIADecisionLogs';
import { CorrectBehaviorSheet, type DecisionContext } from './CorrectBehaviorSheet';

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const ctxStr = (l: IADecisionLog, key: string): string => {
  const v = l.context?.[key];
  return typeof v === 'string' ? v : '';
};

interface DecisionRowProps {
  log: IADecisionLog;
  onCorrect: (d: DecisionContext) => void;
}

const DecisionRow = ({ log, onCorrect }: DecisionRowProps) => {
  const [open, setOpen] = useState(false);
  const leadMsg = ctxStr(log, 'lead_message');
  const aiResp = ctxStr(log, 'generated_response');
  const handoff = log.outcome === 'handoff';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-3 text-left active:scale-[0.99] transition-transform"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {fmtTime(log.created_at)}
          </div>
          {handoff ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
              transferido
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              respondido
            </span>
          )}
        </div>
        {leadMsg && (
          <div className="text-sm text-foreground line-clamp-2">
            <span className="text-muted-foreground">Lead:</span> {leadMsg}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
          {log.detected_behavior_codes.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-secondary text-foreground/80">
              {log.detected_behavior_codes.length} comportamento{log.detected_behavior_codes.length > 1 ? 's' : ''}
            </span>
          )}
          {log.activated_skill_code && (
            <span className="px-1.5 py-0.5 rounded bg-secondary text-foreground/80">
              {log.activated_skill_code}
            </span>
          )}
          <div className="ml-auto">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3 bg-background/40">
          {/* Critérios em linguagem clara */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Como a IA decidiu
            </div>
            <ul className="text-xs text-foreground space-y-1 leading-relaxed">
              {log.detected_behavior_codes.length > 0 ? (
                <li>
                  <span className="text-muted-foreground">Detectou:</span>{' '}
                  {log.detected_behavior_codes.join(', ')}
                </li>
              ) : (
                <li className="text-muted-foreground">Nenhum comportamento específico detectado.</li>
              )}
              {log.activated_skill_code && (
                <li>
                  <span className="text-muted-foreground">Aplicou habilidade:</span>{' '}
                  {log.activated_skill_code}
                </li>
              )}
              {log.applied_rule_codes.length > 0 && (
                <li>
                  <span className="text-muted-foreground">Respeitou regras:</span>{' '}
                  {log.applied_rule_codes.join(', ')}
                </li>
              )}
              {log.archetype_code && (
                <li>
                  <span className="text-muted-foreground">Etapa:</span> {log.archetype_code}
                  {log.status_overlay_code && ` + ${log.status_overlay_code}`}
                </li>
              )}
              {log.context_tags.length > 0 && (
                <li>
                  <span className="text-muted-foreground">Contexto:</span>{' '}
                  {log.context_tags.join(', ')}
                </li>
              )}
            </ul>
          </div>

          {/* Resposta gerada / handoff */}
          {handoff ? (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-warning mb-1">
                <AlertTriangle size={11} /> Transferido pra humano
              </div>
              <div className="text-xs text-foreground">
                {(log.context?.handoff as { reason?: string })?.reason ?? log.action_taken}
              </div>
            </div>
          ) : aiResp ? (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-primary mb-1">
                <Sparkles size={11} /> Resposta enviada
              </div>
              <div className="text-xs text-foreground whitespace-pre-wrap">{aiResp}</div>
            </div>
          ) : null}

          {/* Ação corrigir */}
          <button
            onClick={() => onCorrect({
              leadMessage: leadMsg,
              generatedResponse: aiResp || null,
              detectedBehaviorCodes: log.detected_behavior_codes,
              activatedSkillCode: log.activated_skill_code ?? null,
              appliedRuleCodes: log.applied_rule_codes,
              archetypeCode: log.archetype_code,
              statusOverlayCode: log.status_overlay_code,
              contextTags: log.context_tags,
            })}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.98] transition-transform"
          >
            <Wrench size={12} /> Corrigir esse comportamento
          </button>
        </div>
      )}
    </div>
  );
};

interface DealGroup {
  dealId: string;
  logs: IADecisionLog[];
}

export const IAAuditTab = () => {
  const { logs, loading, error, refresh } = useIADecisionLogs({ limit: 200 });
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [correctSheetOpen, setCorrectSheetOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<DecisionContext | null>(null);

  const grouped: DealGroup[] = useMemo(() => {
    const map = new Map<string, IADecisionLog[]>();
    for (const l of logs) {
      const key = l.deal_id ?? '(sem deal)';
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([dealId, ls]) => ({ dealId, logs: ls }))
      .sort((a, b) => b.logs[0].created_at.localeCompare(a.logs[0].created_at));
  }, [logs]);

  const handleCorrect = (d: DecisionContext) => {
    setPendingDecision(d);
    setCorrectSheetOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3">
        Cada decisão da IA fica registrada aqui com os critérios que ela usou. Se algo
        soou errado, toque em "Corrigir esse comportamento" — sua correção vira uma nova
        configuração persistida.
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {logs.length} decisão{logs.length === 1 ? '' : 'ões'} • {grouped.length} card{grouped.length === 1 ? '' : 's'}
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1 text-[11px] text-muted-foreground active:scale-95"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {loading && logs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-xs">Carregando…</div>
      )}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs p-3 rounded-lg">
          {error}
        </div>
      )}
      {!loading && grouped.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground text-xs">
          Nenhuma decisão da IA registrada ainda.
        </div>
      )}

      <div className="space-y-2">
        {grouped.map(g => {
          const open = openDealId === g.dealId;
          const last = g.logs[0];
          return (
            <div key={g.dealId} className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenDealId(open ? null : g.dealId)}
                className="w-full p-3 text-left flex items-center gap-2 active:scale-[0.99]"
              >
                <MessageCircle size={14} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground font-medium truncate">
                    {g.dealId === '(sem deal)' ? 'Sem deal vinculado' : g.dealId}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {g.logs.length} decisão{g.logs.length > 1 ? 'ões' : ''} • última {fmtTime(last.created_at)}
                  </div>
                </div>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {open && (
                <div className="border-t border-border p-3 space-y-2 bg-background/40">
                  {g.logs.map(l => (
                    <DecisionRow key={l.id} log={l} onCorrect={handleCorrect} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CorrectBehaviorSheet
        open={correctSheetOpen}
        onOpenChange={setCorrectSheetOpen}
        decision={pendingDecision}
        onSaved={refresh}
      />
    </div>
  );
};
