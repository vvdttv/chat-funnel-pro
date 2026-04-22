/**
 * Sprint 17 — Editor de overrides em escopo `funnel` ou `org`.
 *
 * Wrapper sobre `PlaybookOverrideEditor` que adiciona um seletor de escopo
 * (Org da equipe vs cada funil disponível). Vive no painel "Fluxos IA" da
 * ConfigPage e é a contraparte do editor por etapa que está embutido no
 * `PlaybookFourColumnEditor`.
 *
 * Filosofia: dois jeitos de chegar ao mesmo motor — pela etapa (granular)
 * ou pela visão macro (cascata). O alerta de impacto fica a cargo do editor
 * subjacente, garantindo consistência visual.
 */

import { useMemo, useState } from 'react';
import { GitBranch, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFunnels } from '@/hooks/useFunnels';
import { PlaybookOverrideEditor } from '@/components/PlaybookOverrideEditor';

type ScopeKey = 'org' | `funnel:${string}`;

export const PlaybookOverrideMultiScopeEditor = () => {
  const { profile } = useAuth();
  const { funnels } = useFunnels();
  const orgId = profile?.organization_id ?? '';
  const [scopeKey, setScopeKey] = useState<ScopeKey>('org');

  const scope = useMemo(() => {
    if (scopeKey === 'org') {
      return { type: 'org' as const, id: orgId, label: 'organização' };
    }
    const funnelId = scopeKey.slice('funnel:'.length);
    const funnel = funnels.find(f => f.id === funnelId);
    return { type: 'funnel' as const, id: funnelId, label: funnel?.name ?? funnelId };
  }, [scopeKey, orgId, funnels]);

  // Para o preview composicional precisamos passar uma etapa de exemplo. O
  // editor já usa fallback automático quando o escopo não é stage; mesmo
  // assim mandamos a primeira etapa do primeiro funil como pista.
  const exampleStage = useMemo(() => {
    const first = funnels[0];
    const stage = first?.stages?.[0];
    return {
      funnelId: first?.id ?? '',
      stageId: stage?.id ?? '',
      stageName: stage?.name ?? '—',
    };
  }, [funnels]);

  if (!orgId) {
    return (
      <p className="text-[11px] text-muted-foreground italic">
        Carregando organização…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Building2 size={14} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Overrides em escopo macro
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Edite overrides aplicados a um funil inteiro ou à organização toda.
        O alerta de cascata mostra exatamente quantas etapas serão impactadas
        antes de salvar.
      </p>

      {/* Seletor de escopo */}
      <div className="bg-card border border-border rounded-lg p-2 space-y-2">
        <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold block">
          Escopo do override
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setScopeKey('org')}
            className={`text-[10px] px-2 py-1 rounded-md border font-medium uppercase tracking-wide inline-flex items-center gap-1 transition-colors ${
              scopeKey === 'org'
                ? 'bg-warning/15 text-warning border-warning/30'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            <Building2 size={10} />
            Organização
          </button>
          {funnels.map(f => {
            const k: ScopeKey = `funnel:${f.id}`;
            const active = scopeKey === k;
            return (
              <button
                key={f.id}
                onClick={() => setScopeKey(k)}
                className={`text-[10px] px-2 py-1 rounded-md border font-medium uppercase tracking-wide inline-flex items-center gap-1 transition-colors ${
                  active
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                <GitBranch size={10} />
                {f.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor reaproveitado em modo multi-escopo */}
      <PlaybookOverrideEditor
        funnelId={exampleStage.funnelId}
        stageId={exampleStage.stageId}
        stageName={exampleStage.stageName}
        scope={scope}
      />
    </div>
  );
};
