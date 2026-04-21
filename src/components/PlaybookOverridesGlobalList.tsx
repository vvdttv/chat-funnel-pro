/**
 * Sprint 12 — Listagem global de overrides composicionais ativos.
 *
 * Visão consolidada de TODOS os `playbook_overrides` da organização, com
 * filtros (escopo / layer / funil) e ações de desativação. Cada item exibe:
 *   - badge do scopeType + scopeId resolvido (nome do funil/etapa quando possível)
 *   - layer (stage / overlay)
 *   - resumo do payload (campos preenchidos)
 *   - botão para desativar (soft delete: is_active=false)
 *
 * Filosofia: ferramenta de auditoria. O editor por etapa
 * (`PlaybookOverrideEditor`) cuida da edição fina; aqui o admin **vê e poda**.
 */

import { useMemo, useState } from 'react';
import { Layers, Trash2, Loader2, Filter, GitBranch, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePlaybookOverrides } from '@/hooks/usePlaybookOverrides';
import { useFunnels } from '@/hooks/useFunnels';
import type { PlaybookOverride } from '@/lib/playbookComposer';

type ScopeFilter = 'all' | PlaybookOverride['scopeType'];
type LayerFilter = 'all' | PlaybookOverride['layer'];

const SCOPE_LABEL: Record<PlaybookOverride['scopeType'], string> = {
  org: 'Organização',
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

const summarisePayload = (p: PlaybookOverride['payload']): string[] => {
  const chips: string[] = [];
  if (p.goal) chips.push('goal');
  if (p.identity?.persona) chips.push('persona');
  if (p.identity?.tone) chips.push('tom');
  if (p.identity?.mission) chips.push('missão');
  if (p.identity?.identityNotes) chips.push('notas');
  if (p.successCriteria?.length) chips.push(`✓×${p.successCriteria.length}`);
  if (p.failureCriteria?.length) chips.push(`✗×${p.failureCriteria.length}`);
  if (p.expectedBehaviorIds?.length) chips.push(`LB×${p.expectedBehaviorIds.length}`);
  if (p.rulesAdd?.length) chips.push(`+regra×${p.rulesAdd.length}`);
  if (p.rulesRemove?.length) chips.push(`−regra×${p.rulesRemove.length}`);
  return chips;
};

const resolveScopeName = (
  override: PlaybookOverride,
  funnels: ReturnType<typeof useFunnels>['funnels'],
): { funnel?: string; stage?: string; raw: string } => {
  if (override.scopeType === 'org') return { raw: override.scopeId };
  if (override.scopeType === 'funnel') {
    return { funnel: funnels.find(f => f.id === override.scopeId)?.name, raw: override.scopeId };
  }
  // stage: scopeId = "funnelId::stageId"
  const [funnelId, stageId] = override.scopeId.split('::');
  const f = funnels.find(x => x.id === funnelId);
  const s = f?.stages.find(x => x.id === stageId);
  return { funnel: f?.name, stage: s?.name, raw: override.scopeId };
};

export const PlaybookOverridesGlobalList = () => {
  const { toast } = useToast();
  const { items, loading, error, deactivate, refresh } = usePlaybookOverrides();
  const { funnels } = useFunnels();
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all');
  const [funnelFilter, setFunnelFilter] = useState<string>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return items
      .filter(it => it.isActive)
      .filter(it => scopeFilter === 'all' || it.scopeType === scopeFilter)
      .filter(it => layerFilter === 'all' || it.layer === layerFilter)
      .filter(it => {
        if (funnelFilter === 'all') return true;
        if (it.scopeType === 'funnel') return it.scopeId === funnelFilter;
        if (it.scopeType === 'stage') return it.scopeId.split('::')[0] === funnelFilter;
        return false;
      });
  }, [items, scopeFilter, layerFilter, funnelFilter]);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await deactivate(id);
      toast({ title: 'Override desativado', description: 'Volta ao playbook do arquétipo.' });
    } catch (e) {
      toast({
        title: 'Erro ao desativar',
        description: e instanceof Error ? e.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Overrides composicionais ativos
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {visible.length} {visible.length === 1 ? 'item' : 'itens'}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Auditoria global de todas as personalizações que sobrescrevem o playbook
        base do arquétipo. Use para revisar consistência entre funis e remover
        regras esquecidas.
      </p>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <Filter size={11} className="text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Filtros
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
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
        </div>
      </div>

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
            Nenhum override ativo com esses filtros.
          </p>
          <button
            onClick={() => { setScopeFilter('all'); setLayerFilter('all'); setFunnelFilter('all'); }}
            className="text-[10px] text-primary mt-1.5 underline"
          >
            limpar filtros
          </button>
        </div>
      )}

      {/* Lista */}
      <ul className="space-y-2">
        {visible.map(ov => {
          const scope = resolveScopeName(ov, funnels);
          const chips = summarisePayload(ov.payload);
          const removing = removingId === ov.id;
          return (
            <li
              key={ov.id}
              className="bg-card border border-border rounded-lg p-2.5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${SCOPE_TONE[ov.scopeType]}`}>
                    {SCOPE_LABEL[ov.scopeType]}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${LAYER_TONE[ov.layer]}`}>
                    {ov.layer}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-foreground min-w-0">
                    <GitBranch size={10} className="text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {scope.funnel ?? '—'}
                      {scope.stage && (
                        <span className="text-muted-foreground"> › {scope.stage}</span>
                      )}
                      {!scope.funnel && !scope.stage && (
                        <span className="text-muted-foreground italic font-mono">{scope.raw}</span>
                      )}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(ov.id)}
                  disabled={removing}
                  className="h-7 px-1.5 text-destructive hover:text-destructive shrink-0"
                  title="Desativar override"
                >
                  {removing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </Button>
              </div>

              {chips.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {chips.map(c => (
                    <span
                      key={c}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border font-mono"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">payload vazio</p>
              )}

              {ov.payload.goal && (
                <p className="text-[10px] text-foreground bg-background border border-border rounded p-1.5 leading-snug">
                  <span className="text-muted-foreground">goal:</span> {ov.payload.goal}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {!loading && visible.length > 0 && (
        <button
          onClick={refresh}
          className="text-[10px] text-muted-foreground underline w-full text-center"
        >
          atualizar lista
        </button>
      )}
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
