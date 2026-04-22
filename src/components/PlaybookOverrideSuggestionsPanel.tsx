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
  Target, Tag, Brain, Plus, Eye, ArrowRight, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
          return (
            <li
              key={sug.id}
              className="bg-card border border-border rounded-lg p-2.5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
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

// Re-export para compat caso outros componentes importem o ícone aqui.
export { AlertTriangle };
