/**
 * Sprint 18 — Painel de auto-sugestões de overrides.
 *
 * Lê os logs recentes da IA (`useIADecisionLogs`) e o catálogo de overrides
 * existentes (`usePlaybookOverrides`). Roda `analyzeDecisionLogs` no client
 * (heurística pura, ms a calcular) e mostra cada sugestão como um card com:
 *
 *   - badge de severidade
 *   - escopo resolvido (funil/etapa) usando `useFunnels`
 *   - chips de evidência (sample, failureRate, label)
 *   - explicação humana (rationale)
 *   - prévia do payload sugerido
 *   - botão "Aplicar" → faz upsert + snapshot (action='upsert', note='auto-sugestão')
 *
 * O upsert mescla o payload sugerido sobre o existente via
 * `mergeSuggestionPayload` para nunca pisotear customização anterior.
 *
 * Filosofia: o painel é READ-ONLY até o admin clicar. Sugestão sem ação não
 * altera nada — é só insight. Após aplicar, o admin pode abrir o editor da
 * etapa para refinar à mão.
 */

import { useMemo, useState } from 'react';
import {
  Sparkles, Loader2, AlertTriangle, Check, RefreshCw, Lightbulb,
  Target, Tag, Brain, Plus, Eye, ArrowRight, Layers, TrendingDown, TrendingUp, Minus, Activity, Undo2, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useFunnels } from '@/hooks/useFunnels';
import { useIADecisionLogs } from '@/hooks/useIADecisionLogs';
import { usePlaybookOverrides } from '@/hooks/usePlaybookOverrides';
import { usePlaybookOverrideSnapshots } from '@/hooks/usePlaybookOverrideSnapshots';
import { usePlaybookRuntime } from '@/hooks/usePlaybookRuntime';
import {
  analyzeDecisionLogs,
  mergeSuggestionPayload,
  type OverrideSuggestion,
  type AnalyzeOptions,
} from '@/lib/playbookOverrideSuggestions';
import {
  buildSuggestionPreview, buildEffectiveDiff,
  type SuggestionPreview, type EffectiveFieldDiff,
} from '@/lib/playbookSuggestionPreview';
import {
  buildBatchPlan, buildBatchNote, generateBatchId,
  type BatchPlan,
} from '@/lib/playbookSuggestionBatch';
import {
  evaluateRecentSuggestionEffectiveness,
  type EffectivenessResult,
} from '@/lib/playbookSuggestionEffectiveness';
import { buildRollbackPlan } from '@/lib/playbookSnapshotRollback';
import type { PlaybookOverride } from '@/lib/playbookComposer';

const WINDOW_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

const SEVERITY_META: Record<OverrideSuggestion['severity'], { tone: string; label: string }> = {
  critical: { tone: 'bg-destructive/15 text-destructive border-destructive/30', label: 'Crítico' },
  warning: { tone: 'bg-warning/15 text-warning border-warning/30', label: 'Atenção' },
  info: { tone: 'bg-primary/15 text-primary border-primary/30', label: 'Insight' },
};

const KIND_META: Record<OverrideSuggestion['kind'], { icon: LucideIcon; label: string }> = {
  lb_problematic: { icon: Brain, label: 'LB problemático' },
  stage_chronic_loss: { icon: Target, label: 'Etapa crônica' },
  context_tag_toxic: { icon: Tag, label: 'Tag tóxica' },
};

const SCOPE_LABEL: Record<PlaybookOverride['scopeType'], string> = {
  org: 'Organização', funnel: 'Funil', stage: 'Etapa',
};

interface ResolvedScope { funnel?: string; stage?: string; raw: string; }

const resolveScope = (
  scope: OverrideSuggestion['scope'],
  funnels: ReturnType<typeof useFunnels>['funnels'],
): ResolvedScope => {
  if (scope.type === 'org') return { raw: scope.id };
  if (scope.type === 'funnel') {
    return { funnel: funnels.find(f => f.id === scope.id)?.name, raw: scope.id };
  }
  const [funnelId, stageId] = scope.id.split('::');
  const f = funnels.find(x => x.id === funnelId);
  const s = f?.stages.find(x => x.id === stageId);
  return { funnel: f?.name, stage: s?.name, raw: scope.id };
};

export const PlaybookOverrideSuggestionsPanel = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { funnels } = useFunnels();
  const orgId = profile?.organization_id ?? '';
  const [windowDays, setWindowDays] = useState<number>(30);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<OverrideSuggestion | null>(null);
  const [opts] = useState<AnalyzeOptions>({});
  // Sprint 20 — seleção em lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPlan, setBatchPlan] = useState<BatchPlan | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const { logs, loading: loadingLogs, refresh: refreshLogs } = useIADecisionLogs({
    sinceDays: windowDays,
    limit: 1000,
  });
  const { items: overrides, upsert, refresh: refreshOverrides } = usePlaybookOverrides();
  const { recordSnapshot } = usePlaybookOverrideSnapshots({ limit: 1 });
  const runtime = usePlaybookRuntime();

  const suggestions = useMemo(
    () => analyzeDecisionLogs(logs, opts),
    [logs, opts],
  );

  // Substitui o placeholder 'org' pelo orgId real no scope das sugestões de tag tóxica.
  const resolvedSuggestions = useMemo(() => {
    return suggestions.map(s =>
      s.scope.type === 'org' && s.scope.id === 'org'
        ? { ...s, scope: { ...s.scope, id: orgId } }
        : s,
    );
  }, [suggestions, orgId]);

  const selectableSuggestions = useMemo(
    () => resolvedSuggestions.filter(s => !appliedIds.has(s.id)),
    [resolvedSuggestions, appliedIds],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(selectableSuggestions.map(s => s.id)));
  };

  const selectCritical = () => {
    setSelectedIds(new Set(
      selectableSuggestions.filter(s => s.severity === 'critical').map(s => s.id),
    ));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openBatchDialog = () => {
    const chosen = resolvedSuggestions.filter(s => selectedIds.has(s.id));
    if (chosen.length === 0) return;
    const plan = buildBatchPlan({
      suggestions: chosen,
      existingOverrides: overrides,
      batchId: generateBatchId(),
    });
    setBatchPlan(plan);
  };

  const closeBatchDialog = () => {
    if (batchRunning) return;
    setBatchPlan(null);
  };

  const runBatch = async () => {
    if (!batchPlan || !orgId) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: batchPlan.items.length });
    const newApplied = new Set(appliedIds);
    let failures = 0;
    try {
      for (let i = 0; i < batchPlan.items.length; i++) {
        const item = batchPlan.items[i];
        try {
          const overrideId = await upsert({
            scopeType: item.scopeType,
            scopeId: item.scopeId,
            layer: item.layer,
            payload: item.mergedPayload,
          });
          await recordSnapshot({
            overrideId: overrideId || null,
            scopeType: item.scopeType,
            scopeId: item.scopeId,
            layer: item.layer,
            payload: item.mergedPayload,
            isActive: true,
            action: 'upsert',
            note: buildBatchNote(batchPlan.batchId, item, batchPlan.totalWrites),
          });
          for (const s of item.suggestions) newApplied.add(s.id);
        } catch (e) {
          console.error('[batch] item falhou', item.key, e);
          failures += 1;
        }
        setBatchProgress({ done: i + 1, total: batchPlan.items.length });
      }
      await refreshOverrides();
      await runtime.refresh();
      setAppliedIds(newApplied);
      clearSelection();
      if (failures === 0) {
        toast({
          title: 'Lote aplicado',
          description: `${batchPlan.totalSuggestions} sugestões consolidadas em ${batchPlan.totalWrites} gravação(ões). Histórico marcado com ${batchPlan.batchId}.`,
        });
      } else {
        toast({
          title: 'Lote aplicado com falhas',
          description: `${failures} de ${batchPlan.totalWrites} gravações falharam. Veja o console.`,
          variant: 'destructive',
        });
      }
      setBatchPlan(null);
    } finally {
      setBatchRunning(false);
    }
  };

  const handleApply = async (sug: OverrideSuggestion) => {
    if (!orgId) {
      toast({ title: 'Sem organização', variant: 'destructive' });
      return;
    }
    setApplyingId(sug.id);
    try {
      const existing = overrides.find(
        o => o.scopeType === sug.scope.type
          && o.scopeId === sug.scope.id
          && o.layer === sug.layer
          && o.isActive,
      );
      const merged = mergeSuggestionPayload(existing?.payload, sug.payload);
      const overrideId = await upsert({
        scopeType: sug.scope.type,
        scopeId: sug.scope.id,
        layer: sug.layer,
        payload: merged,
      });
      await recordSnapshot({
        overrideId: overrideId || null,
        scopeType: sug.scope.type,
        scopeId: sug.scope.id,
        layer: sug.layer,
        payload: merged,
        isActive: true,
        action: 'upsert',
        note: `auto-sugestão (${sug.kind}) — ${sug.title}`,
      });
      await refreshOverrides();
      await runtime.refresh();
      setAppliedIds(prev => new Set(prev).add(sug.id));
      toast({
        title: 'Sugestão aplicada',
        description: `Override ${SCOPE_LABEL[sug.scope.type].toLowerCase()} atualizado. Refine no editor da etapa se quiser.`,
      });
    } catch (e) {
      toast({
        title: 'Erro ao aplicar sugestão',
        description: e instanceof Error ? e.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Auto-sugestões de overrides
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {WINDOW_OPTIONS.map(w => {
            const active = windowDays === w.value;
            return (
              <button
                key={w.value}
                onClick={() => setWindowDays(w.value)}
                className={`text-[10px] px-2 py-1 rounded border font-medium uppercase tracking-wide ${
                  active
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {w.label}
              </button>
            );
          })}
          <button
            onClick={refreshLogs}
            disabled={loadingLogs}
            className="text-muted-foreground active:scale-95 disabled:opacity-50 p-1"
            title="Reanalisar logs"
            aria-label="Atualizar"
          >
            {loadingLogs
              ? <Loader2 size={12} className="animate-spin" />
              : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        A IA cruzou os <strong>{logs.length}</strong> logs de decisão dos últimos {windowDays} dias e
        encontrou <strong>{resolvedSuggestions.length}</strong> {resolvedSuggestions.length === 1 ? 'padrão recomendado' : 'padrões recomendados'} para virar override.
        Aplicar apenas mescla com o existente — nunca apaga customizações.
      </p>

      {/* Sprint 20 — barra de seleção em lote */}
      {!loadingLogs && selectableSuggestions.length > 0 && (
        <div className="bg-secondary/40 border border-border rounded-lg p-2 flex items-center justify-between gap-2 flex-wrap sticky top-0 z-10">
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <Layers size={12} className="text-primary" />
            <span className="font-medium text-foreground">
              {selectedIds.size}/{selectableSuggestions.length} selecionada(s)
            </span>
            <button
              onClick={selectAll}
              className="text-[10px] underline text-muted-foreground hover:text-foreground"
            >Todas</button>
            <button
              onClick={selectCritical}
              className="text-[10px] underline text-destructive hover:opacity-80"
            >Só críticas</button>
            {selectedIds.size > 0 && (
              <button
                onClick={clearSelection}
                className="text-[10px] underline text-muted-foreground hover:text-foreground"
              >Limpar</button>
            )}
          </div>
          <Button
            size="sm"
            onClick={openBatchDialog}
            disabled={selectedIds.size === 0}
            className="h-7 text-[10px] gap-1"
          >
            <Layers size={11} /> Aplicar {selectedIds.size > 0 ? `${selectedIds.size}` : ''} em lote
          </Button>
        </div>
      )}

      {loadingLogs && (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-1.5">
          <Loader2 size={12} className="animate-spin" /> analisando padrões…
        </div>
      )}

      {!loadingLogs && resolvedSuggestions.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-lg p-6 text-center space-y-1">
          <Lightbulb size={18} className="mx-auto text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">
            Nenhum padrão consistente nessa janela. Tente aumentar o intervalo
            ou aguardar mais decisões registradas.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {resolvedSuggestions.map(sug => {
          const meta = SEVERITY_META[sug.severity];
          const KindIcon = KIND_META[sug.kind].icon;
          const scopeRes = resolveScope(sug.scope, funnels);
          const applied = appliedIds.has(sug.id);
          const applying = applyingId === sug.id;
          const selected = selectedIds.has(sug.id);
          return (
            <li
              key={sug.id}
              className={`bg-card border rounded-lg p-2.5 space-y-2 transition-colors ${
                selected ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  {!applied && (
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleSelect(sug.id)}
                      aria-label="Selecionar para lote"
                      className="h-3.5 w-3.5"
                    />
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border bg-secondary text-muted-foreground border-border font-medium uppercase tracking-wide inline-flex items-center gap-1">
                    <KindIcon size={9} /> {KIND_META[sug.kind].label}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border bg-secondary text-foreground border-border font-medium uppercase tracking-wide">
                    {SCOPE_LABEL[sug.scope.type]}
                  </span>
                </div>
                {applied ? (
                  <span className="text-[10px] px-2 py-1 rounded border bg-success/15 text-success border-success/30 font-semibold inline-flex items-center gap-1">
                    <Check size={10} /> Aplicada
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewing(sug)}
                      disabled={applying || runtime.loading || !runtime.snapshot}
                      className="h-7 text-[10px] gap-1"
                      aria-label="Pré-visualizar efeito"
                    >
                      <Eye size={11} /> Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApply(sug)}
                      disabled={applying}
                      className="h-7 text-[10px] gap-1"
                    >
                      {applying
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Plus size={11} />}
                      Aplicar
                    </Button>
                  </div>
                )}
              </div>

              <p className="text-[12px] text-foreground font-medium leading-snug">
                {sug.title}
              </p>

              <div className="text-[10px] text-muted-foreground leading-snug">
                <span className="text-muted-foreground/80">Escopo: </span>
                {scopeRes.funnel ?? scopeRes.raw}
                {scopeRes.stage && (
                  <span className="text-muted-foreground"> › {scopeRes.stage}</span>
                )}
                {sug.scope.type === 'org' && (
                  <span className="text-muted-foreground italic"> (organização inteira)</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                <Chip>n = {sug.evidence.sample}</Chip>
                <Chip tone="destructive">
                  falha {(sug.evidence.failureRate * 100).toFixed(0)}%
                </Chip>
                <Chip tone="success">
                  sucesso {(sug.evidence.successRate * 100).toFixed(0)}%
                </Chip>
                {sug.evidence.label && <Chip tone="primary">{sug.evidence.label}</Chip>}
              </div>

              <p className="text-[10px] text-foreground bg-background border border-border rounded p-2 leading-snug">
                {sug.rationale}
              </p>

              <PayloadPreview payload={sug.payload} />
            </li>
          );
        })}
      </ul>

      {!loadingLogs && (
        <p className="text-[10px] text-muted-foreground italic">
          Heurísticas: {WINDOW_INFO}
        </p>
      )}

      <SuggestionPreviewDialog
        suggestion={previewing}
        snapshot={runtime.snapshot}
        onClose={() => setPreviewing(null)}
        onApply={async (sug) => { await handleApply(sug); setPreviewing(null); }}
        applyingId={applyingId}
        appliedIds={appliedIds}
      />

      <BatchPlanDialog
        plan={batchPlan}
        running={batchRunning}
        progress={batchProgress}
        funnels={funnels}
        onClose={closeBatchDialog}
        onConfirm={runBatch}
      />
    </div>
  );
};

const WINDOW_INFO = 'LB problemático ≥ 60% falha & n ≥ 5 · etapa crônica ≥ 50% & n ≥ 8 · tag tóxica ≥ 55% & n ≥ 10.';

const Chip = ({
  children, tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'destructive' | 'primary';
}) => {
  const cls = {
    neutral: 'bg-secondary text-muted-foreground border-border',
    success: 'bg-success/10 text-success border-success/30',
    destructive: 'bg-destructive/10 text-destructive border-destructive/30',
    primary: 'bg-primary/10 text-primary border-primary/30',
  }[tone];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${cls}`}>
      {children}
    </span>
  );
};

const PayloadPreview = ({ payload }: { payload: PlaybookOverride['payload'] }) => {
  const rows: Array<[string, string]> = [];
  if (payload.goal) rows.push(['goal', payload.goal]);
  if (payload.identity?.persona) rows.push(['persona', payload.identity.persona]);
  if (payload.identity?.tone) rows.push(['tom', payload.identity.tone]);
  if (payload.identity?.mission) rows.push(['missão', payload.identity.mission]);
  if (payload.identity?.identityNotes) rows.push(['notas', payload.identity.identityNotes]);
  if (payload.successCriteria?.length) rows.push(['sucesso', payload.successCriteria.join(' · ')]);
  if (payload.failureCriteria?.length) rows.push(['falha', payload.failureCriteria.join(' · ')]);
  if (payload.expectedBehaviorIds?.length) rows.push(['LBs', payload.expectedBehaviorIds.join(', ')]);
  if (rows.length === 0) return null;
  return (
    <div className="border border-dashed border-border rounded p-1.5 bg-background space-y-0.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
        Payload sugerido
      </p>
      {rows.map(([k, v]) => (
        <p key={k} className="text-[10px] text-foreground leading-snug">
          <span className="text-muted-foreground font-mono">{k}:</span> {v}
        </p>
      ))}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Sprint 19 — Dialog de preview composicional antes de aplicar.
// ----------------------------------------------------------------------------

interface SuggestionPreviewDialogProps {
  suggestion: OverrideSuggestion | null;
  snapshot: ReturnType<typeof usePlaybookRuntime>['snapshot'];
  onClose: () => void;
  onApply: (s: OverrideSuggestion) => Promise<void>;
  applyingId: string | null;
  appliedIds: Set<string>;
}

const FIELD_LABELS: Record<EffectiveFieldDiff['field'], string> = {
  'identity.persona': 'Persona',
  'identity.tone': 'Tom',
  'identity.mission': 'Missão',
  'identity.identityNotes': 'Notas',
  goal: 'Objetivo',
  successCriteria: 'Critérios de sucesso',
  failureCriteria: 'Critérios de falha',
  expectedBehaviors: 'LBs ativos',
};

const renderValue = (v: string | string[]): string => {
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '—';
  return v?.trim() ? v : '—';
};

const SuggestionPreviewDialog = ({
  suggestion, snapshot, onClose, onApply, applyingId, appliedIds,
}: SuggestionPreviewDialogProps) => {
  const open = !!suggestion;
  const preview: SuggestionPreview | null = useMemo(() => {
    if (!suggestion || !snapshot) return null;
    return buildSuggestionPreview({ suggestion, snapshot });
  }, [suggestion, snapshot]);

  const effectiveDiff: EffectiveFieldDiff[] = useMemo(
    () => preview ? buildEffectiveDiff(preview.before, preview.after) : [],
    [preview],
  );
  const changedFields = effectiveDiff.filter(d => d.changed);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Eye size={14} className="text-primary" />
            Preview composicional
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {suggestion?.title}
          </DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Carregando runtime…
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="bg-secondary/40 border border-border rounded p-2 text-[11px] space-y-1">
              <p>
                <strong>{preview.affectedCount}</strong>{' '}
                {preview.affectedCount === 1 ? 'etapa será afetada' : 'etapas serão afetadas'}
                {preview.representative && preview.affectedCount > 1 && (
                  <> · prévia mostrada na etapa <code className="font-mono">{preview.representative.stageId}</code></>
                )}
              </p>
              <p className="text-muted-foreground">
                {changedFields.length === 0
                  ? 'Nenhum campo composto muda visivelmente — a sugestão apenas reforça notas internas.'
                  : `${changedFields.length} campo(s) do playbook efetivo serão alterados.`}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Diff do override
              </p>
              {preview.payloadDiff.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Override permanece idêntico (já cobre tudo o que a sugestão propunha).
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {preview.payloadDiff.map(d => (
                    <li key={d.path} className="text-[10px] flex items-center gap-1">
                      <span className={`px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide ${
                        d.kind === 'added' ? 'bg-success/15 text-success border-success/30'
                        : d.kind === 'removed' ? 'bg-destructive/15 text-destructive border-destructive/30'
                        : 'bg-warning/15 text-warning border-warning/30'
                      }`}>{d.kind}</span>
                      <span className="font-mono text-foreground">{d.path}</span>
                      {d.arrayDelta && (
                        <span className="text-muted-foreground">
                          (+{d.arrayDelta.added.length} / −{d.arrayDelta.removed.length})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Playbook efetivo — antes vs. depois
              </p>
              {preview.before && preview.after ? (
                <div className="border border-border rounded divide-y divide-border">
                  {effectiveDiff.map(d => (
                    <div key={d.field} className="grid grid-cols-[120px_1fr_1fr] gap-2 p-2 text-[10px] items-start">
                      <div className="text-muted-foreground font-medium flex items-center gap-1">
                        {d.changed && <ArrowRight size={9} className="text-primary" />}
                        {FIELD_LABELS[d.field]}
                      </div>
                      <div className={`leading-snug ${d.changed ? 'text-muted-foreground line-through opacity-70' : 'text-foreground'}`}>
                        {renderValue(d.before)}
                      </div>
                      <div className={`leading-snug ${d.changed ? 'text-foreground font-medium' : 'text-foreground'}`}>
                        {renderValue(d.after)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  Snapshot incompleto — sem etapa representativa para compor.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onClose}>
                Cancelar
              </Button>
              {suggestion && !appliedIds.has(suggestion.id) && (
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  disabled={applyingId === suggestion.id}
                  onClick={() => onApply(suggestion)}
                >
                  {applyingId === suggestion.id
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Plus size={11} />}
                  Aplicar agora
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ----------------------------------------------------------------------------
// Sprint 20 — Dialog de confirmação do lote.
// ----------------------------------------------------------------------------

interface BatchPlanDialogProps {
  plan: BatchPlan | null;
  running: boolean;
  progress: { done: number; total: number };
  funnels: ReturnType<typeof useFunnels>['funnels'];
  onClose: () => void;
  onConfirm: () => void;
}

const BatchPlanDialog = ({
  plan, running, progress, funnels, onClose, onConfirm,
}: BatchPlanDialogProps) => {
  const open = !!plan;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Layers size={14} className="text-primary" /> Aplicar lote de sugestões
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {plan && (
              <>
                {plan.totalSuggestions} sugestão(ões) selecionada(s) →{' '}
                <strong>{plan.totalWrites}</strong> gravação(ões) distintas
                {plan.totalSuggestions !== plan.totalWrites && (
                  <> (sugestões do mesmo escopo serão fundidas em um único override)</>
                )}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <div className="space-y-3">
            <div className="bg-secondary/40 border border-border rounded p-2 text-[10px] font-mono text-muted-foreground">
              ID do lote: <span className="text-foreground">{plan.batchId}</span>
              <p className="text-[10px] mt-1 font-sans not-italic">
                Cada snapshot do histórico levará esse ID — assim você pode
                reverter o lote inteiro depois localizando-o no browser de snapshots.
              </p>
            </div>

            <ul className="border border-border rounded divide-y divide-border max-h-[40vh] overflow-y-auto">
              {plan.items.map(item => {
                const f = funnels.find(fn => fn.id === item.scopeId.split('::')[0]);
                const stageId = item.scopeType === 'stage' ? item.scopeId.split('::')[1] : undefined;
                const stageName = stageId ? f?.stages.find(s => s.id === stageId)?.name : undefined;
                return (
                  <li key={item.key} className="p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-secondary text-foreground border-border font-medium uppercase tracking-wide">
                          {SCOPE_LABEL[item.scopeType]}
                        </span>
                        <span className="text-[10px] text-foreground font-medium">
                          {item.scopeType === 'org'
                            ? 'Organização'
                            : item.scopeType === 'funnel'
                              ? (f?.name ?? item.scopeId)
                              : `${f?.name ?? item.scopeId.split('::')[0]} › ${stageName ?? stageId}`}
                        </span>
                      </div>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {item.suggestions.length}× sugestão{item.suggestions.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {item.summaryTitle}
                    </p>
                    {item.existingPayload && Object.keys(item.existingPayload).length > 0 && (
                      <p className="text-[9px] text-muted-foreground italic">
                        ↳ override existente será preservado e mesclado com a sugestão.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {running && (
              <div className="bg-primary/5 border border-primary/30 rounded p-2 text-[11px] text-primary flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Aplicando {progress.done}/{progress.total}…
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline" size="sm" className="h-7 text-[11px]"
                onClick={onClose} disabled={running}
              >Cancelar</Button>
              <Button
                size="sm" className="h-7 text-[11px] gap-1"
                onClick={onConfirm} disabled={running || plan.items.length === 0}
              >
                {running
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Layers size={11} />}
                Aplicar lote
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Re-export para compat caso outros componentes importem o ícone aqui.
export { AlertTriangle };
