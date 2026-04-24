/**
 * Sprint 16 — Lista global de versionamento de overrides + comparação arbitrária.
 *
 * Visão consolidada de TODOS os snapshots (`playbook_override_snapshots`) da
 * organização, em todos os escopos (`org`, `funnel`, `stage`) e layers
 * (`stage`, `overlay`). Permite ao admin auditar a evolução das regras
 * composicionais ao longo do tempo, filtrando por:
 *   - escopo (org/funnel/stage)
 *   - layer (stage/overlay)
 *   - funil (resolve nome via useFunnels)
 *   - autor (resolvido via useOrgMembers; só admin vê outros)
 *   - data (de/até)
 *   - ação (upsert/deactivate/rollback)
 *
 * Inclui modo de comparação: o admin marca DOIS snapshots quaisquer (mesmo de
 * escopos diferentes) e o componente renderiza um diff lado-a-lado usando
 * `buildPayloadDiff`. Isso permite responder perguntas como "o que mudou
 * entre a versão de ontem do Funil A e a atual do Funil B?".
 *
 * Filosofia: ferramenta de auditoria/comparação. Não edita, não desativa —
 * apenas observa e contrasta. Para rollback, o admin abre o editor da etapa
 * (PlaybookOverrideEditor) que já tem essa ação no Sprint 15.
 */

import { useMemo, useState } from 'react';
import {
  History, Filter, Loader2, AlertTriangle, GitBranch, GitCompare, X,
  ChevronDown, ChevronRight, User, Calendar, Layers, Download, Undo2,
  FileText, FileJson,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePlaybookOverrideSnapshots, type OverrideSnapshot } from '@/hooks/usePlaybookOverrideSnapshots';
import { usePlaybookOverrides } from '@/hooks/usePlaybookOverrides';
import { useFunnels } from '@/hooks/useFunnels';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { buildPayloadDiff, summarizeDiff, type DiffEntry } from '@/lib/playbookOverrideDiff';
import {
  groupSnapshotsByBatch, buildRollbackPlan, buildRollbackNote,
  type RollbackPlan,
} from '@/lib/playbookSnapshotRollback';
import {
  exportSnapshotsCSV, exportSnapshotsJSON, summarizeAuditPeriod,
  type AuditPeriodSummary,
} from '@/lib/playbookOverrideAuditExport';
import type { PlaybookOverride } from '@/lib/playbookComposer';

type ScopeFilter = 'all' | PlaybookOverride['scopeType'];
type LayerFilter = 'all' | PlaybookOverride['layer'];
type ActionFilter = 'all' | OverrideSnapshot['action'];

const SCOPE_LABEL: Record<PlaybookOverride['scopeType'], string> = {
  org: 'Org',
  funnel: 'Funil',
  stage: 'Etapa',
};

const SCOPE_TONE: Record<PlaybookOverride['scopeType'], string> = {
  org: 'bg-warning/15 text-warning border-warning/30',
  funnel: 'bg-primary/15 text-primary border-primary/30',
  stage: 'bg-secondary text-foreground border-border',
};

const LAYER_TONE: Record<PlaybookOverride['layer'], string> = {
  stage: 'bg-[hsl(200,40%,25%)]/40 text-[hsl(200,60%,75%)] border-[hsl(200,40%,40%)]',
  overlay: 'bg-[hsl(280,40%,25%)]/40 text-[hsl(280,60%,75%)] border-[hsl(280,40%,40%)]',
};

const ACTION_META: Record<OverrideSnapshot['action'], { label: string; cls: string }> = {
  upsert: { label: 'salvo', cls: 'bg-primary/15 text-primary border-primary/30' },
  deactivate: { label: 'removido', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  rollback: { label: 'rollback', cls: 'bg-warning/15 text-warning border-warning/30' },
};

const DIFF_KIND_CLS: Record<DiffEntry['kind'], string> = {
  added: 'bg-success/10 text-success border-success/30',
  removed: 'bg-destructive/10 text-destructive border-destructive/30',
  changed: 'bg-warning/10 text-warning border-warning/30',
};

const DIFF_KIND_SYMBOL: Record<DiffEntry['kind'], string> = {
  added: '+', removed: '−', changed: '~',
};

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

const renderValue = (v: unknown): string => {
  if (v === null || v === undefined) return '∅';
  if (Array.isArray(v)) return v.length === 0 ? '[]' : v.join(' • ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

interface ResolvedScope {
  funnel?: string;
  stage?: string;
  raw: string;
}

const resolveScope = (
  scopeType: PlaybookOverride['scopeType'],
  scopeId: string,
  funnels: ReturnType<typeof useFunnels>['funnels'],
): ResolvedScope => {
  if (scopeType === 'org') return { raw: 'organização' };
  if (scopeType === 'funnel') {
    return { funnel: funnels.find(f => f.id === scopeId)?.name, raw: scopeId };
  }
  const [funnelId, stageId] = scopeId.split('::');
  const f = funnels.find(x => x.id === funnelId);
  const s = f?.stages.find(x => x.id === stageId);
  return { funnel: f?.name, stage: s?.name, raw: scopeId };
};

export const PlaybookOverrideSnapshotsBrowser = () => {
  // Snapshots: pegamos tudo (sem filtro server-side) e filtramos client-side
  // para permitir filtros cruzados (autor, data, ação) sem N round-trips.
  const { items, loading, error, refresh, recordSnapshot } = usePlaybookOverrideSnapshots({ limit: 200 });
  const { funnels } = useFunnels();
  const { members } = useOrgMembers();
  const { upsert, deactivate, refresh: refreshOverrides } = usePlaybookOverrides();
  const { toast } = useToast();

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all');
  const [funnelFilter, setFunnelFilter] = useState<string>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [expanded, setExpanded] = useState<string | null>(null);
  // Comparação: A e B (ids dos snapshots selecionados, na ordem em que foram clicados)
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  // Sprint 21+22 — agrupamento por lote, resumo, rollback
  const [groupByBatch, setGroupByBatch] = useState<boolean>(false);
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [expandedBatch, setExpandedBatch] = useState<Set<string>>(new Set());
  const [rollbackPlan, setRollbackPlan] = useState<RollbackPlan | null>(null);
  const [rollbackRunning, setRollbackRunning] = useState(false);
  const [rollbackProgress, setRollbackProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach(mem => m.set(mem.user_id, mem.display_name || mem.username));
    return m;
  }, [members]);

  const visible = useMemo(() => {
    return items.filter(s => {
      if (scopeFilter !== 'all' && s.scopeType !== scopeFilter) return false;
      if (layerFilter !== 'all' && s.layer !== layerFilter) return false;
      if (actionFilter !== 'all' && s.action !== actionFilter) return false;
      if (authorFilter !== 'all') {
        if (authorFilter === '__none__' && s.createdBy) return false;
        if (authorFilter !== '__none__' && s.createdBy !== authorFilter) return false;
      }
      if (funnelFilter !== 'all') {
        if (s.scopeType === 'org') return false;
        if (s.scopeType === 'funnel' && s.scopeId !== funnelFilter) return false;
        if (s.scopeType === 'stage' && s.scopeId.split('::')[0] !== funnelFilter) return false;
      }
      if (dateFrom) {
        const ts = new Date(s.createdAt).getTime();
        const fromTs = new Date(dateFrom + 'T00:00:00').getTime();
        if (ts < fromTs) return false;
      }
      if (dateTo) {
        const ts = new Date(s.createdAt).getTime();
        const toTs = new Date(dateTo + 'T23:59:59').getTime();
        if (ts > toTs) return false;
      }
      return true;
    });
  }, [items, scopeFilter, layerFilter, funnelFilter, authorFilter, actionFilter, dateFrom, dateTo]);

  const snapA = useMemo(() => items.find(s => s.id === compareA) ?? null, [items, compareA]);
  const snapB = useMemo(() => items.find(s => s.id === compareB) ?? null, [items, compareB]);
  const compareDiff = useMemo<DiffEntry[]>(() => {
    if (!snapA || !snapB) return [];
    return buildPayloadDiff(snapA.payload, snapB.payload);
  }, [snapA, snapB]);

  const toggleCompare = (id: string) => {
    if (compareA === id) { setCompareA(null); return; }
    if (compareB === id) { setCompareB(null); return; }
    if (!compareA) { setCompareA(id); return; }
    if (!compareB) { setCompareB(id); return; }
    // ambos preenchidos — substitui o B (mais recente vira o "novo")
    setCompareB(id);
  };

  const clearFilters = () => {
    setScopeFilter('all'); setLayerFilter('all'); setFunnelFilter('all');
    setAuthorFilter('all'); setActionFilter('all'); setDateFrom(''); setDateTo('');
  };

  const clearCompare = () => { setCompareA(null); setCompareB(null); };

  // Sprint 22 — resumo agregado dos snapshots VISÍVEIS
  const summary = useMemo<AuditPeriodSummary>(
    () => summarizeAuditPeriod(visible, memberMap),
    [visible, memberMap],
  );

  // Sprint 21 — agrupamento por lote (sobre os visíveis)
  const batchGroups = useMemo(() => groupSnapshotsByBatch(visible), [visible]);

  const toggleBatchOpen = (id: string) => {
    setExpandedBatch(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openRollback = (batchId: string) => {
    setRollbackPlan(buildRollbackPlan(items, batchId));
  };

  const closeRollback = () => {
    if (rollbackRunning) return;
    setRollbackPlan(null);
  };

  const runRollback = async () => {
    if (!rollbackPlan) return;
    setRollbackRunning(true);
    setRollbackProgress({ done: 0, total: rollbackPlan.items.length });
    let failures = 0;
    try {
      for (let i = 0; i < rollbackPlan.items.length; i++) {
        const it = rollbackPlan.items[i];
        try {
          let overrideId = '';
          if (it.action === 'rollback') {
            overrideId = await upsert({
              scopeType: it.scopeType,
              scopeId: it.scopeId,
              layer: it.layer,
              payload: it.targetPayload,
            });
          } else if (it.batchSnapshot.overrideId) {
            await deactivate(it.batchSnapshot.overrideId);
            overrideId = it.batchSnapshot.overrideId;
          }
          await recordSnapshot({
            overrideId: overrideId || it.batchSnapshot.overrideId,
            scopeType: it.scopeType,
            scopeId: it.scopeId,
            layer: it.layer,
            payload: it.targetPayload,
            isActive: it.targetIsActive,
            action: 'rollback',
            note: buildRollbackNote(rollbackPlan.batchId, it),
          });
        } catch (e) {
          console.error('[rollback] item falhou', it.key, e);
          failures += 1;
        }
        setRollbackProgress({ done: i + 1, total: rollbackPlan.items.length });
      }
      await refreshOverrides();
      await refresh();
      if (failures === 0) {
        toast({
          title: 'Lote revertido',
          description: `${rollbackPlan.items.length} escopo(s) restaurados (${rollbackPlan.batchId}).`,
        });
      } else {
        toast({
          title: 'Rollback parcial',
          description: `${failures} de ${rollbackPlan.items.length} reversões falharam.`,
          variant: 'destructive',
        });
      }
      setRollbackPlan(null);
    } finally {
      setRollbackRunning(false);
    }
  };

  const handleExportCSV = () => exportSnapshotsCSV(visible, memberMap);
  const handleExportJSON = () => exportSnapshotsJSON(visible);


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Histórico global de overrides
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {visible.length} de {items.length}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Linha do tempo de TODAS as versões salvas, em todos os escopos
        (org / funil / etapa) e layers. Marque dois snapshots para comparar
        payloads lado a lado, mesmo entre escopos diferentes.
      </p>

      {/* Sprint 21+22 — toolbar de ações */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm" variant="outline"
          onClick={() => setGroupByBatch(v => !v)}
          className="h-7 text-[10px] gap-1"
        >
          <Layers size={11} /> {groupByBatch ? 'Lista plana' : `Agrupar por lote (${batchGroups.size})`}
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={() => setShowSummary(v => !v)}
          className="h-7 text-[10px] gap-1"
        >
          <FileText size={11} /> {showSummary ? 'Ocultar resumo' : 'Resumo do período'}
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={handleExportCSV}
          disabled={visible.length === 0}
          className="h-7 text-[10px] gap-1"
        ><Download size={11} /> CSV</Button>
        <Button
          size="sm" variant="outline"
          onClick={handleExportJSON}
          disabled={visible.length === 0}
          className="h-7 text-[10px] gap-1"
        ><FileJson size={11} /> JSON</Button>
      </div>

      {showSummary && (
        <div className="bg-card border border-border rounded-lg p-2.5 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Resumo · {summary.total} snapshot(s) · {summary.batchCount} lote(s)
          </p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <SummaryBlock label="Por escopo" rows={summary.byScope.map(([k, n]) => [k, n])} />
            <SummaryBlock label="Por ação" rows={summary.byAction.map(([k, n]) => [k, n])} />
            <SummaryBlock label="Por layer" rows={summary.byLayer.map(([k, n]) => [k, n])} />
            <SummaryBlock label="Por autor (top)" rows={summary.byAuthor.slice(0, 5).map(([k, n]) => [k, n])} />
          </div>
        </div>
      )}

      {groupByBatch && batchGroups.size > 0 && (
        <ul className="space-y-1.5">
          {Array.from(batchGroups.entries()).map(([batchId, snaps]) => {
            const isOpenB = expandedBatch.has(batchId);
            const newest = snaps.reduce((acc, s) =>
              new Date(s.createdAt).getTime() > new Date(acc.createdAt).getTime() ? s : acc, snaps[0]);
            const distinctScopes = new Set(snaps.map(s => `${s.scopeType}::${s.scopeId}::${s.layer}`)).size;
            return (
              <li key={batchId} className="bg-card border border-primary/30 rounded-md overflow-hidden">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    onClick={() => toggleBatchOpen(batchId)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left active:opacity-70"
                  >
                    {isOpenB
                      ? <ChevronDown size={11} className="text-muted-foreground shrink-0" />
                      : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
                    <Layers size={11} className="text-primary shrink-0" />
                    <span className="text-[11px] font-mono text-foreground truncate">{batchId}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      · {distinctScopes} escopo(s) · {formatDate(newest.createdAt)}
                    </span>
                  </button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => openRollback(batchId)}
                    className="h-6 text-[10px] gap-1 px-1.5"
                  >
                    <Undo2 size={10} /> Reverter lote
                  </Button>
                </div>
                {isOpenB && (
                  <ul className="border-t border-border divide-y divide-border">
                    {snaps.map(s => {
                      const sc = resolveScope(s.scopeType, s.scopeId, funnels);
                      return (
                        <li key={s.id} className="px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-2">
                          <span className={`px-1 rounded border text-[9px] ${SCOPE_TONE[s.scopeType]}`}>
                            {SCOPE_LABEL[s.scopeType]}
                          </span>
                          <span className="text-foreground truncate flex-1">
                            {sc.funnel ?? sc.raw}{sc.stage && ` › ${sc.stage}`}
                          </span>
                          <span className="font-mono shrink-0">{ACTION_META[s.action].label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Filter size={11} className="text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Filtros
            </span>
          </div>
          <button
            onClick={clearFilters}
            className="text-[10px] text-muted-foreground underline active:opacity-70"
          >
            limpar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <FilterPills<ScopeFilter>
            label="Escopo"
            value={scopeFilter}
            onChange={setScopeFilter}
            options={[
              { v: 'all', l: 'Todos' },
              { v: 'org', l: 'Org' },
              { v: 'funnel', l: 'Funil' },
              { v: 'stage', l: 'Etapa' },
            ]}
          />
          <FilterPills<LayerFilter>
            label="Layer"
            value={layerFilter}
            onChange={setLayerFilter}
            options={[
              { v: 'all', l: 'Todos' },
              { v: 'stage', l: 'Stage' },
              { v: 'overlay', l: 'Overlay' },
            ]}
          />
          <FilterPills<ActionFilter>
            label="Ação"
            value={actionFilter}
            onChange={setActionFilter}
            options={[
              { v: 'all', l: 'Todas' },
              { v: 'upsert', l: 'Salvo' },
              { v: 'deactivate', l: 'Removido' },
              { v: 'rollback', l: 'Rollback' },
            ]}
          />

          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
              Funil
            </label>
            <select
              value={funnelFilter}
              onChange={e => setFunnelFilter(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Todos</option>
              {funnels.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
              Autor
            </label>
            <select
              value={authorFilter}
              onChange={e => setAuthorFilter(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Todos</option>
              <option value="__none__">(sem autor)</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.username}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
                De
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-7 text-[11px]"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
                Até
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-7 text-[11px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Painel de comparação ativo */}
      {(snapA || snapB) && (
        <CompareBanner
          snapA={snapA}
          snapB={snapB}
          diff={compareDiff}
          funnels={funnels}
          memberMap={memberMap}
          onClear={clearCompare}
          onSwap={() => { const a = compareA; setCompareA(compareB); setCompareB(a); }}
        />
      )}

      {/* Estados */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-1.5">
          <Loader2 size={12} className="animate-spin" /> carregando…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1.5 bg-destructive/10 border border-destructive/30 rounded-md p-2">
          <AlertTriangle size={12} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-lg p-6 text-center">
          <p className="text-[11px] text-muted-foreground">
            Nenhum snapshot com esses filtros.
          </p>
        </div>
      )}

      {/* Lista */}
      <ul className="space-y-1.5">
        {visible.map(snap => {
          const scope = resolveScope(snap.scopeType, snap.scopeId, funnels);
          const author = snap.createdBy ? memberMap.get(snap.createdBy) ?? snap.createdBy.slice(0, 8) : '(sistema)';
          const isOpen = expanded === snap.id;
          const isA = compareA === snap.id;
          const isB = compareB === snap.id;
          const meta = ACTION_META[snap.action];
          return (
            <li
              key={snap.id}
              className={`bg-card border rounded-md overflow-hidden ${
                isA ? 'border-primary/60 ring-1 ring-primary/30' :
                isB ? 'border-warning/60 ring-1 ring-warning/30' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  onClick={() => setExpanded(isOpen ? null : snap.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left active:opacity-70"
                  aria-expanded={isOpen}
                >
                  {isOpen
                    ? <ChevronDown size={11} className="text-muted-foreground shrink-0" />
                    : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide shrink-0 ${SCOPE_TONE[snap.scopeType]}`}>
                    {SCOPE_LABEL[snap.scopeType]}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide shrink-0 ${LAYER_TONE[snap.layer]}`}>
                    {snap.layer}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide shrink-0 ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-foreground truncate flex items-center gap-1 min-w-0">
                    <GitBranch size={9} className="text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {scope.funnel ?? scope.raw}
                      {scope.stage && <span className="text-muted-foreground"> › {scope.stage}</span>}
                    </span>
                  </span>
                </button>
                <div className="flex flex-col items-end text-[9px] text-muted-foreground shrink-0 gap-0">
                  <span className="flex items-center gap-1"><Calendar size={8} />{formatDate(snap.createdAt)}</span>
                  <span className="flex items-center gap-1"><User size={8} />{author}</span>
                </div>
                <button
                  onClick={() => toggleCompare(snap.id)}
                  className={`text-[9px] px-1.5 py-1 rounded border font-medium uppercase active:scale-95 shrink-0 inline-flex items-center gap-1 ${
                    isA ? 'bg-primary/15 text-primary border-primary/40' :
                    isB ? 'bg-warning/15 text-warning border-warning/40' :
                    'bg-secondary text-muted-foreground border-border'
                  }`}
                  title={isA ? 'Versão A — clique para remover' : isB ? 'Versão B — clique para remover' : 'Marcar para comparar'}
                >
                  <GitCompare size={9} />
                  {isA ? 'A' : isB ? 'B' : ''}
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-border p-2 bg-card/50 space-y-1">
                  {snap.payload.goal && (
                    <p className="text-[10px] text-foreground">
                      <span className="text-muted-foreground">objetivo:</span> {snap.payload.goal}
                    </p>
                  )}
                  {snap.payload.identity?.persona && (
                    <p className="text-[10px] text-foreground">
                      <span className="text-muted-foreground">persona:</span> {snap.payload.identity.persona}
                    </p>
                  )}
                  {snap.payload.identity?.tone && (
                    <p className="text-[10px] text-foreground">
                      <span className="text-muted-foreground">tom de voz:</span> {snap.payload.identity.tone}
                    </p>
                  )}
                  {(snap.payload.successCriteria?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-success">
                      ✓ {snap.payload.successCriteria!.join(' • ')}
                    </p>
                  )}
                  {(snap.payload.failureCriteria?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-destructive">
                      ✗ {snap.payload.failureCriteria!.join(' • ')}
                    </p>
                  )}
                  {(snap.payload.expectedBehaviorIds?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-foreground font-mono">
                      LB: {snap.payload.expectedBehaviorIds!.join(', ')}
                    </p>
                  )}
                  {snap.note && (
                    <p className="text-[10px] text-muted-foreground italic">nota: {snap.note}</p>
                  )}
                  {!snap.isActive && (
                    <p className="text-[9px] text-warning">versão salva enquanto o ajuste estava INATIVO</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!loading && (
        <button
          onClick={refresh}
          className="text-[10px] text-muted-foreground underline w-full text-center"
        >
          atualizar lista
        </button>
      )}

      <RollbackPlanDialog
        plan={rollbackPlan}
        funnels={funnels}
        running={rollbackRunning}
        progress={rollbackProgress}
        onClose={closeRollback}
        onConfirm={runRollback}
      />
    </div>
  );
};

// ----------------------------------------------------------------------------
// Banner de comparação A vs B
// ----------------------------------------------------------------------------

const CompareBanner = ({
  snapA, snapB, diff, funnels, memberMap, onClear, onSwap,
}: {
  snapA: OverrideSnapshot | null;
  snapB: OverrideSnapshot | null;
  diff: DiffEntry[];
  funnels: ReturnType<typeof useFunnels>['funnels'];
  memberMap: Map<string, string>;
  onClear: () => void;
  onSwap: () => void;
}) => {
  return (
    <div className="bg-card border border-primary/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitCompare size={13} className="text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            Comparação A → B
          </span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onSwap} className="h-7 px-2 text-[10px]" disabled={!snapA || !snapB}>
            inverter
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-[10px]">
            <X size={11} className="mr-0.5" /> limpar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SnapHeader label="A (antes)" snap={snapA} funnels={funnels} memberMap={memberMap} tone="primary" />
        <SnapHeader label="B (depois)" snap={snapB} funnels={funnels} memberMap={memberMap} tone="warning" />
      </div>

      {!snapA || !snapB ? (
        <p className="text-[11px] text-muted-foreground italic text-center py-2">
          Marque dois snapshots na lista abaixo para ver o diff.
        </p>
      ) : diff.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic text-center py-2">
          Nenhuma diferença entre os payloads.
        </p>
      ) : (
        <div className="bg-background border border-border rounded-md p-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground">{summarizeDiff(diff)}</p>
          {diff.map((entry, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] px-1 rounded border font-mono font-bold ${DIFF_KIND_CLS[entry.kind]}`}>
                  {DIFF_KIND_SYMBOL[entry.kind]}
                </span>
                <span className="text-[10px] font-mono text-foreground">{entry.path}</span>
              </div>
              {entry.arrayDelta ? (
                <div className="ml-4 space-y-0.5">
                  {entry.arrayDelta.added.map((it, j) => (
                    <p key={`a${j}`} className="text-[10px] text-success leading-snug">+ {it}</p>
                  ))}
                  {entry.arrayDelta.removed.map((it, j) => (
                    <p key={`r${j}`} className="text-[10px] text-destructive leading-snug line-through">− {it}</p>
                  ))}
                </div>
              ) : (
                <div className="ml-4 space-y-0.5">
                  {entry.kind !== 'added' && (
                    <p className="text-[10px] text-destructive leading-snug line-through">
                      − {renderValue(entry.before)}
                    </p>
                  )}
                  {entry.kind !== 'removed' && (
                    <p className="text-[10px] text-success leading-snug">
                      + {renderValue(entry.after)}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SnapHeader = ({
  label, snap, funnels, memberMap, tone,
}: {
  label: string;
  snap: OverrideSnapshot | null;
  funnels: ReturnType<typeof useFunnels>['funnels'];
  memberMap: Map<string, string>;
  tone: 'primary' | 'warning';
}) => {
  const cls = tone === 'primary'
    ? 'border-primary/40 bg-primary/5'
    : 'border-warning/40 bg-warning/5';
  if (!snap) {
    return (
      <div className={`border rounded-md p-2 ${cls}`}>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-[11px] text-muted-foreground italic mt-1">não selecionado</p>
      </div>
    );
  }
  const scope = resolveScope(snap.scopeType, snap.scopeId, funnels);
  const author = snap.createdBy ? memberMap.get(snap.createdBy) ?? snap.createdBy.slice(0, 8) : '(sistema)';
  return (
    <div className={`border rounded-md p-2 ${cls}`}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-[11px] text-foreground mt-0.5 truncate">
        {scope.funnel ?? scope.raw}
        {scope.stage && <span className="text-muted-foreground"> › {scope.stage}</span>}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {SCOPE_LABEL[snap.scopeType]} · {snap.layer} · {ACTION_META[snap.action].label}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {formatDate(snap.createdAt)} — {author}
      </p>
    </div>
  );
};

// ----------------------------------------------------------------------------

function FilterPills<T extends string>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { v: T; l: string }[];
}) {
  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
        {label}
      </label>
      <div className="flex flex-wrap gap-1">
        {options.map(o => {
          const active = value === o.v;
          return (
            <button
              key={o.v}
              onClick={() => onChange(o.v)}
              className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase ${
                active
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-secondary text-muted-foreground border-border'
              }`}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryBlock({
  label,
  rows,
}: {
  label: string;
  rows: Array<[string, number]>;
}) {
  return (
    <div className="bg-secondary/40 rounded p-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </p>
      {rows.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">—</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map(([k, n]) => (
            <li key={k} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-foreground truncate">{k}</span>
              <span className="text-muted-foreground font-mono shrink-0">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sprint 21 — Dialog de confirmação de rollback de lote
// ----------------------------------------------------------------------------

function RollbackPlanDialog({
  plan,
  funnels,
  running,
  progress,
  onClose,
  onConfirm,
}: {
  plan: RollbackPlan | null;
  funnels: ReturnType<typeof useFunnels>['funnels'];
  running: boolean;
  progress: { done: number; total: number };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = !!plan;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-1.5">
            <Undo2 size={13} className="text-primary" />
            Reverter lote
            {plan && <span className="font-mono text-[11px] text-muted-foreground">{plan.batchId}</span>}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {plan && (
              <>
                {plan.items.length} escopo(s) serão restaurados ao estado anterior ao lote.
                {plan.dirtyCount > 0 && (
                  <span className="block mt-1 text-warning">
                    ⚠ {plan.dirtyCount} escopo(s) tiveram alterações posteriores que serão sobrescritas.
                  </span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <ul className="max-h-[40vh] overflow-y-auto space-y-1 -mx-1 px-1">
            {plan.items.map(it => {
              const sc = resolveScope(it.scopeType, it.scopeId, funnels);
              const label = sc.stage
                ? `${sc.funnel ?? '?'} › ${sc.stage}`
                : sc.funnel ?? sc.raw ?? it.scopeId;
              return (
                <li
                  key={it.key}
                  className="bg-secondary/40 border border-border rounded px-2 py-1.5 flex items-center gap-2"
                >
                  <span className="text-[11px] text-foreground flex-1 min-w-0 truncate">{label}</span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px">
                    {it.layer}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-wider border rounded px-1 py-px font-semibold ${
                      it.action === 'rollback'
                        ? 'text-primary border-primary/30 bg-primary/10'
                        : 'text-warning border-warning/30 bg-warning/10'
                    }`}
                  >
                    {it.action === 'rollback' ? 'restaurar' : 'desativar'}
                  </span>
                  {it.dirty && (
                    <AlertTriangle size={11} className="text-warning shrink-0" aria-label="mudança posterior" />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {running && (
          <div className="space-y-1">
            <div className="h-1.5 bg-secondary rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {progress.done} / {progress.total}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            disabled={running}
            className="h-8 text-[11px]"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onConfirm}
            disabled={running || !plan || plan.items.length === 0}
            className="h-8 text-[11px] gap-1"
          >
            {running ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
            Reverter lote
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
