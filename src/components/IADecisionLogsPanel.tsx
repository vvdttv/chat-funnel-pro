/**
 * Painel de auditoria das ia_decision_logs (Sprint 13).
 *
 * Renderizado dentro de IndicadoresPage. Mostra estatísticas resumidas
 * + correlações composicionais (funil × etapa, status, arquétipo, overlay,
 * context tags) e a timeline dos últimos eventos da IA, com filtros
 * avançados (busca textual, funil, etapa, status, arquétipo, overlay,
 * context tag, outcome, janela de tempo) e botão para expandir cada decisão.
 */

import { useMemo, useState } from 'react';
import {
  Bot, Filter, Loader2, RefreshCw, ChevronDown, ChevronUp, Sparkles,
  AlertTriangle, Layers, Tag, Activity, Search, X, Workflow, Target,
} from 'lucide-react';
import { useIADecisionLogs, type IADecisionLog } from '@/hooks/useIADecisionLogs';
import { useFunnels } from '@/hooks/useFunnels';

const WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Últimas 24h' },
  { value: 7, label: 'Últimos 7d' },
  { value: 30, label: 'Últimos 30d' },
  { value: 0, label: 'Sempre' },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'open', label: 'Abertos' },
  { value: 'won', label: 'Ganhos' },
  { value: 'lost', label: 'Perdidos' },
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

const LogRow = ({
  log,
  funnelName,
  stageName,
}: {
  log: IADecisionLog;
  funnelName?: string;
  stageName?: string;
}) => {
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
              {log.deal_status && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[log.deal_status] ?? STATUS_BADGE.open}`}>
                  {log.deal_status}
                </span>
              )}
              {(funnelName || stageName) && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground flex items-center gap-1">
                  <Workflow size={9} />
                  {funnelName ?? log.funnel_id ?? '—'}
                  {stageName && <span className="text-foreground/80">/ {stageName}</span>}
                </span>
              )}
              {log.archetype_code && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-[hsl(270,40%,35%)] text-[hsl(270,60%,75%)] bg-[hsl(270,40%,20%)]/40 flex items-center gap-1">
                  <Layers size={9} />{log.archetype_code}
                </span>
              )}
              {log.status_overlay_code && (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-warning/30 text-warning bg-warning/10">
                  overlay: {log.status_overlay_code}
                </span>
              )}
              {log.detected_behavior_codes.length > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  · {log.detected_behavior_codes.length} comp.
                </span>
              )}
              {log.applied_rule_codes.length > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  · {log.applied_rule_codes.length} regras
                </span>
              )}
              {log.applied_override_ids.length > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  · {log.applied_override_ids.length} ovr
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
          {/* Proveniência composicional */}
          {(log.archetype_code || log.status_overlay_code || log.context_tags.length > 0 || log.applied_override_ids.length > 0) && (
            <div className="bg-card border border-border rounded-md p-2 space-y-1.5">
              <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                <Layers size={10} /> Proveniência composicional
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div>
                  <span className="text-muted-foreground">arquétipo:</span>{' '}
                  <span className="text-foreground font-mono">{log.archetype_code ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">overlay:</span>{' '}
                  <span className="text-foreground font-mono">{log.status_overlay_code ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">funil:</span>{' '}
                  <span className="text-foreground font-mono">{funnelName ?? log.funnel_id ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">etapa:</span>{' '}
                  <span className="text-foreground font-mono">{stageName ?? log.stage_id ?? '—'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">status do deal:</span>{' '}
                  <span className="text-foreground font-mono">{log.deal_status ?? '—'}</span>
                </div>
              </div>
              {log.context_tags.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase text-muted-foreground mt-1.5 mb-0.5 flex items-center gap-1">
                    <Tag size={9} /> context tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {log.context_tags.map(t => (
                      <span key={t} className="text-[9px] bg-secondary border border-border rounded px-1.5 py-0.5 font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {log.applied_override_ids.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase text-muted-foreground mt-1.5 mb-0.5 flex items-center gap-1">
                    <Activity size={9} /> overrides aplicados
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {log.applied_override_ids.map(id => (
                      <span key={id} className="text-[9px] bg-secondary border border-border rounded px-1.5 py-0.5 font-mono">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
  const { funnels } = useFunnels();
  const [funnelId, setFunnelId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [dealStatus, setDealStatus] = useState<string>('');
  const [archetypeCode, setArchetypeCode] = useState<string>('');
  const [overlayCode, setOverlayCode] = useState<string>('');
  const [outcome, setOutcome] = useState<string>('');
  const [contextTag, setContextTag] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [windowDays, setWindowDays] = useState<number>(7);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const { logs, stats, loading, error, refresh } = useIADecisionLogs({
    funnelId: funnelId || undefined,
    stageId: stageId || undefined,
    dealStatus: (dealStatus || undefined) as 'open' | 'won' | 'lost' | undefined,
    archetypeCode: archetypeCode || undefined,
    statusOverlayCode: overlayCode || undefined,
    outcome: outcome || undefined,
    contextTag: contextTag || undefined,
    search: search || undefined,
    sinceDays: windowDays || undefined,
    limit: 120,
  });

  // Resolução nome funil/etapa
  const funnelById = useMemo(() => {
    const m = new Map<string, { name: string; stages: Map<string, string> }>();
    for (const f of funnels) {
      const stages = new Map<string, string>();
      for (const s of f.stages || []) stages.set(s.id, s.name);
      m.set(f.id, { name: f.name, stages });
    }
    return m;
  }, [funnels]);

  const selectedFunnel = funnelId ? funnelById.get(funnelId) : null;
  const stageOptions = useMemo(() => {
    if (!selectedFunnel) return [] as Array<{ id: string; name: string }>;
    return Array.from(selectedFunnel.stages.entries()).map(([id, name]) => ({ id, name }));
  }, [selectedFunnel]);

  const topIntents = useMemo(() => stats.byIntent.slice(0, 4), [stats.byIntent]);
  const activeFilters = [funnelId, stageId, dealStatus, archetypeCode, overlayCode, outcome, contextTag, search]
    .filter(Boolean).length;

  const clearFilters = () => {
    setFunnelId(''); setStageId(''); setDealStatus(''); setArchetypeCode('');
    setOverlayCode(''); setOutcome(''); setContextTag(''); setSearch('');
  };

  return (
    <div className="space-y-3">
      {/* Busca textual */}
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar em ação, intent, tone, playbook ou deal id…"
          className="w-full text-[11px] bg-secondary border border-border rounded-md pl-7 pr-7 py-1.5 text-foreground placeholder:text-muted-foreground"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground active:text-foreground"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Filtros principais */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={12} className="text-muted-foreground" />
        <select
          value={funnelId}
          onChange={e => { setFunnelId(e.target.value); setStageId(''); }}
          className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
        >
          <option value="">Todos os funis</option>
          {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select
          value={stageId}
          onChange={e => setStageId(e.target.value)}
          disabled={!funnelId}
          className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground disabled:opacity-50"
        >
          <option value="">Todas as etapas</option>
          {stageOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={dealStatus}
          onChange={e => setDealStatus(e.target.value)}
          className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={windowDays}
          onChange={e => setWindowDays(Number(e.target.value))}
          className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
        >
          {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => setShowAdvanced(s => !s)}
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
            showAdvanced
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-secondary border-border text-muted-foreground active:bg-card'
          }`}
        >
          Avançado{activeFilters > 0 && ` · ${activeFilters}`}
        </button>
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

      {/* Filtros avançados */}
      {showAdvanced && (
        <div className="bg-secondary/40 border border-border/60 rounded-lg p-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase text-muted-foreground">Arquétipo</label>
              <select
                value={archetypeCode}
                onChange={e => setArchetypeCode(e.target.value)}
                className="w-full mt-0.5 text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="">Todos</option>
                {stats.byArchetype.map(([code, n]) => (
                  <option key={code} value={code}>{code} ({n})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase text-muted-foreground">Overlay de status</label>
              <select
                value={overlayCode}
                onChange={e => setOverlayCode(e.target.value)}
                className="w-full mt-0.5 text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="">Todos</option>
                {stats.byOverlay.map(([code, n]) => (
                  <option key={code} value={code}>{code} ({n})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase text-muted-foreground">Outcome</label>
              <select
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                className="w-full mt-0.5 text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="">Todos</option>
                {stats.byOutcome.map(([code, n]) => (
                  <option key={code} value={code}>{code} ({n})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase text-muted-foreground">Context tag</label>
              <select
                value={contextTag}
                onChange={e => setContextTag(e.target.value)}
                className="w-full mt-0.5 text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="">Todas</option>
                {stats.byContextTag.map(([code, n]) => (
                  <option key={code} value={code}>{code} ({n})</option>
                ))}
              </select>
            </div>
          </div>
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="w-full text-[10px] py-1 rounded-md bg-card border border-border text-muted-foreground active:text-foreground"
            >
              Limpar {activeFilters} filtro(s)
            </button>
          )}
        </div>
      )}

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

      {/* Distribuição por status */}
      {stats.byStatus.length > 0 && (
        <div className="bg-secondary/50 rounded-lg p-3 border border-border/50">
          <p className="text-[10px] uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Target size={10} /> Por status do deal
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {stats.byStatus.map(([s, n]) => {
              const pct = stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
              return (
                <button
                  key={s}
                  onClick={() => setDealStatus(dealStatus === s ? '' : s)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    dealStatus === s
                      ? STATUS_BADGE[s] ?? STATUS_BADGE.open
                      : 'bg-card border-border text-foreground active:bg-secondary'
                  }`}
                >
                  {s} <span className="text-muted-foreground">· {n} ({pct}%)</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Correlação Funil × Etapa */}
      {stats.funnelStageMatrix.size > 0 && (
        <div className="bg-secondary/50 rounded-lg p-3 border border-border/50">
          <p className="text-[10px] uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Workflow size={10} /> Correlação funil × etapa
          </p>
          <div className="space-y-2">
            {Array.from(stats.funnelStageMatrix.entries()).map(([fid, stagesMap]) => {
              const fInfo = funnelById.get(fid);
              const total = Array.from(stagesMap.values()).reduce((a, b) => a + b, 0);
              return (
                <div key={fid}>
                  <button
                    onClick={() => { setFunnelId(funnelId === fid ? '' : fid); setStageId(''); }}
                    className="text-[11px] font-medium text-foreground active:text-primary mb-1"
                  >
                    {fInfo?.name ?? fid} <span className="text-muted-foreground">· {total}</span>
                  </button>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from(stagesMap.entries()).sort((a, b) => b[1] - a[1]).map(([sid, n]) => {
                      const sName = fInfo?.stages.get(sid) ?? sid;
                      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                      const active = funnelId === fid && stageId === sid;
                      return (
                        <button
                          key={sid}
                          onClick={() => {
                            setFunnelId(fid);
                            setStageId(stageId === sid && funnelId === fid ? '' : sid);
                          }}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                            active
                              ? 'bg-primary/20 border-primary/40 text-primary'
                              : 'bg-card border-border text-muted-foreground active:text-foreground'
                          }`}
                        >
                          {sName} · {n} ({pct}%)
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top arquétipos / overlays */}
      {(stats.byArchetype.length > 0 || stats.byOverlay.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {stats.byArchetype.length > 0 && (
            <div className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
              <p className="text-[10px] uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
                <Layers size={10} /> Arquétipos
              </p>
              <div className="space-y-1">
                {stats.byArchetype.slice(0, 4).map(([code, n]) => (
                  <button
                    key={code}
                    onClick={() => setArchetypeCode(archetypeCode === code ? '' : code)}
                    className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded border ${
                      archetypeCode === code
                        ? 'bg-[hsl(270,40%,25%)]/40 border-[hsl(270,40%,40%)] text-[hsl(270,60%,80%)]'
                        : 'bg-card border-border text-foreground'
                    }`}
                  >
                    <span className="font-mono">{code}</span>{' '}
                    <span className="text-muted-foreground">· {n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {stats.byOverlay.length > 0 && (
            <div className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
              <p className="text-[10px] uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
                <Activity size={10} /> Overlays
              </p>
              <div className="space-y-1">
                {stats.byOverlay.slice(0, 4).map(([code, n]) => (
                  <button
                    key={code}
                    onClick={() => setOverlayCode(overlayCode === code ? '' : code)}
                    className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded border ${
                      overlayCode === code
                        ? 'bg-warning/15 border-warning/40 text-warning'
                        : 'bg-card border-border text-foreground'
                    }`}
                  >
                    <span className="font-mono">{code}</span>{' '}
                    <span className="text-muted-foreground">· {n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top context tags */}
      {stats.byContextTag.length > 0 && (
        <div className="bg-secondary/50 rounded-lg p-2.5 border border-border/50">
          <p className="text-[10px] uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
            <Tag size={10} /> Context tags mais frequentes
          </p>
          <div className="flex flex-wrap gap-1">
            {stats.byContextTag.slice(0, 12).map(([t, n]) => (
              <button
                key={t}
                onClick={() => setContextTag(contextTag === t ? '' : t)}
                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                  contextTag === t
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-card border-border text-foreground active:bg-secondary'
                }`}
              >
                {t} <span className="text-muted-foreground">· {n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Distribuição por playbook */}
      {stats.byPlaybook.length > 0 && (
        <div className="bg-secondary/50 rounded-lg p-3 border border-border/50">
          <p className="text-[10px] uppercase text-muted-foreground mb-2">Decisões por playbook</p>
          <div className="space-y-1.5">
            {stats.byPlaybook.slice(0, 6).map(([code, n]) => {
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
        <p className="text-[10px] uppercase text-muted-foreground mb-2">
          Timeline {logs.length > 0 && <span className="text-foreground">· {logs.length}</span>}
        </p>
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
            Nenhuma decisão da IA encontrada com esses filtros.
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map(l => {
              const fInfo = l.funnel_id ? funnelById.get(l.funnel_id) : null;
              const sName = fInfo && l.stage_id ? fInfo.stages.get(l.stage_id) : undefined;
              return (
                <LogRow
                  key={l.id}
                  log={l}
                  funnelName={fInfo?.name}
                  stageName={sName}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
