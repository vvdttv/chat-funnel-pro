/**
 * Sprint 11 — Editor de overrides composicionais com preview ao vivo.
 *
 * Permite ao admin sobrescrever camadas do `EffectivePlaybook` para uma etapa
 * específica (`scopeType='stage'`) sem perder a base do arquétipo. Suporta
 * dois layers:
 *  - 'stage'   → afeta o playbook quando deal está aberto (open)
 *  - 'overlay' → afeta apenas quando deal está em won/lost
 *
 * Preview ao vivo: chama `composeEffectivePlaybook` no client com o catálogo
 * já carregado pelo `usePlaybookRuntime`, substituindo o override existente
 * (mesmo scope+layer) pelo rascunho atual. Mostra ao lado:
 *  - persona/tom/missão final
 *  - critérios efetivos
 *  - LBs ativos
 *  - lista de overrides aplicados (proveniência)
 *
 * Filosofia: o admin enxerga IMEDIATAMENTE o efeito da regra antes de salvar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Save, Loader2, Plus, X, Trash2, Eye, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { usePlaybookRuntime } from '@/hooks/usePlaybookRuntime';
import { usePlaybookOverrides } from '@/hooks/usePlaybookOverrides';
import { useIABehavior } from '@/hooks/useIABehavior';
import {
  composeEffectivePlaybook, type PlaybookOverride, type StageIdentity,
} from '@/lib/playbookComposer';

interface Props {
  funnelId: string;
  stageId: string;
  stageName: string;
}

type LayerKey = 'stage' | 'overlay';
type PreviewStatus = 'open' | 'won' | 'lost';

interface DraftPayload {
  goal: string;
  identity: Required<StageIdentity>;
  successCriteria: string[];
  failureCriteria: string[];
  expectedBehaviorIds: string[];
}

const EMPTY_DRAFT: DraftPayload = {
  goal: '',
  identity: { persona: '', tone: '', mission: '', identityNotes: '' },
  successCriteria: [],
  failureCriteria: [],
  expectedBehaviorIds: [],
};

const payloadToDraft = (p: PlaybookOverride['payload'] | undefined): DraftPayload => ({
  goal: p?.goal ?? '',
  identity: {
    persona: p?.identity?.persona ?? '',
    tone: p?.identity?.tone ?? '',
    mission: p?.identity?.mission ?? '',
    identityNotes: p?.identity?.identityNotes ?? '',
  },
  successCriteria: p?.successCriteria ?? [],
  failureCriteria: p?.failureCriteria ?? [],
  expectedBehaviorIds: p?.expectedBehaviorIds ?? [],
});

const draftToPayload = (d: DraftPayload): PlaybookOverride['payload'] => {
  const payload: PlaybookOverride['payload'] = {};
  if (d.goal.trim()) payload.goal = d.goal.trim();
  const idTrim: StageIdentity = {};
  if (d.identity.persona.trim()) idTrim.persona = d.identity.persona.trim();
  if (d.identity.tone.trim()) idTrim.tone = d.identity.tone.trim();
  if (d.identity.mission.trim()) idTrim.mission = d.identity.mission.trim();
  if (d.identity.identityNotes.trim()) idTrim.identityNotes = d.identity.identityNotes.trim();
  if (Object.keys(idTrim).length) payload.identity = idTrim;
  if (d.successCriteria.length) payload.successCriteria = d.successCriteria;
  if (d.failureCriteria.length) payload.failureCriteria = d.failureCriteria;
  if (d.expectedBehaviorIds.length) payload.expectedBehaviorIds = d.expectedBehaviorIds;
  return payload;
};

export const PlaybookOverrideEditor = ({ funnelId, stageId, stageName }: Props) => {
  const { toast } = useToast();
  const stageScopeId = `${funnelId}::${stageId}`;
  const { items: overrides, loading: loadingOv, upsert, deactivate, refresh } =
    usePlaybookOverrides({ scopeType: 'stage', scopeId: stageScopeId });
  const runtime = usePlaybookRuntime();
  const { behaviors } = useIABehavior();

  const [layer, setLayer] = useState<LayerKey>('stage');
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('open');
  const [draft, setDraft] = useState<DraftPayload>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  // Carrega rascunho do override existente para o layer ativo
  const currentOverride = useMemo(
    () => overrides.find(o => o.layer === layer && o.isActive),
    [overrides, layer],
  );

  useEffect(() => {
    setDraft(payloadToDraft(currentOverride?.payload));
  }, [currentOverride, layer]);

  // Preview composicional: substitui override do mesmo scope+layer pelo rascunho
  const preview = useMemo(() => {
    if (runtime.loading || !runtime.snapshot) return null;
    const draftOverride: PlaybookOverride = {
      scopeType: 'stage',
      scopeId: stageScopeId,
      layer,
      payload: draftToPayload(draft),
    };
    // Em overlay, deal precisa estar won/lost para o overlay ser aplicado.
    const previewStatusForCompose: PreviewStatus =
      layer === 'overlay' && previewStatus === 'open' ? 'won' : previewStatus;
    const snap = runtime.snapshot;
    const funnelContextTags = snap.funnelContextTagsById[funnelId] ?? [];
    const patchedOverrides = [
      ...snap.overrides.filter(
        o => !(o.scopeType === 'stage' && o.scopeId === stageScopeId && o.layer === layer),
      ),
      draftOverride,
    ];
    return composeEffectivePlaybook({
      funnelId, stageId, dealStatus: previewStatusForCompose, funnelContextTags,
      archetypes: snap.archetypes,
      statusArchetypes: snap.statusArchetypes,
      physicalStages: snap.physicalStages,
      catalogPlaybooks: snap.catalogPlaybooks,
      overrides: patchedOverrides,
      rules: snap.rules,
      behaviors: snap.behaviors,
      ladders: snap.ladders,
      triggers: snap.triggers,
    });
  }, [runtime.loading, runtime.snapshot, funnelId, stageId, stageScopeId, layer, draft, previewStatus]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = draftToPayload(draft);
      if (Object.keys(payload).length === 0) {
        toast({
          title: 'Override vazio',
          description: 'Preencha pelo menos um campo antes de salvar.',
          variant: 'destructive',
        });
        return;
      }
      await upsert({ scopeType: 'stage', scopeId: stageScopeId, layer, payload });
      await refresh();
      await runtime.refresh();
      toast({
        title: 'Override salvo',
        description: `Camada "${layer}" desta etapa atualizada.`,
      });
    } catch (e) {
      toast({
        title: 'Erro ao salvar',
        description: e instanceof Error ? e.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [draft, layer, stageScopeId, upsert, refresh, runtime, toast]);

  const handleRemove = useCallback(async () => {
    if (!currentOverride) return;
    setSaving(true);
    try {
      await deactivate(currentOverride.id);
      await runtime.refresh();
      toast({
        title: 'Override removido',
        description: 'Volta a usar o playbook do arquétipo.',
      });
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      toast({
        title: 'Erro ao remover',
        description: e instanceof Error ? e.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [currentOverride, deactivate, runtime, toast]);

  return (
    <div className="space-y-3">
      {/* Header + seletor de layer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Layers size={14} className="text-primary" />
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Overrides composicionais
          </h3>
        </div>
        <div className="flex gap-1">
          {(['stage', 'overlay'] as LayerKey[]).map(l => {
            const active = layer === l;
            return (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={`text-[10px] px-2 py-1 rounded-md border font-medium uppercase tracking-wide transition-colors ${
                  active
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {l === 'stage' ? 'Etapa (open)' : 'Overlay (won/lost)'}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        {layer === 'stage'
          ? `Sobrescreve o playbook desta etapa quando o deal está em andamento (open). A camada "${stageName}" entra após o arquétipo e antes do overlay de status.`
          : `Sobrescreve a camada de overlay quando o deal vira won ou lost. Útil para ajustar tom de pós-venda ou linguagem de recuperação por etapa.`}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Coluna 1 — editor */}
        <div className="space-y-3 bg-card border border-border rounded-lg p-3">
          <DraftField label="Objetivo (goal)">
            <textarea
              value={draft.goal}
              onChange={e => setDraft(d => ({ ...d, goal: e.target.value }))}
              rows={2}
              maxLength={300}
              placeholder="Ex: Garantir contraproposta dentro do teto de 8%"
              className="w-full bg-background border border-input rounded-md px-2 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </DraftField>

          <div className="grid grid-cols-2 gap-2">
            <DraftField label="Persona">
              <Input
                value={draft.identity.persona}
                onChange={e => setDraft(d => ({ ...d, identity: { ...d.identity, persona: e.target.value } }))}
                className="h-8 text-[11px]"
                maxLength={80}
                placeholder="Ex: Negociador sênior"
              />
            </DraftField>
            <DraftField label="Tom">
              <Input
                value={draft.identity.tone}
                onChange={e => setDraft(d => ({ ...d, identity: { ...d.identity, tone: e.target.value } }))}
                className="h-8 text-[11px]"
                maxLength={80}
                placeholder="Ex: Firme mas empático"
              />
            </DraftField>
          </div>

          <DraftField label="Missão">
            <Input
              value={draft.identity.mission}
              onChange={e => setDraft(d => ({ ...d, identity: { ...d.identity, mission: e.target.value } }))}
              className="h-8 text-[11px]"
              maxLength={120}
              placeholder="Ex: Aproximar valor justo em 3 mensagens"
            />
          </DraftField>

          <DraftField label="Notas internas (não vão ao lead)">
            <Input
              value={draft.identity.identityNotes}
              onChange={e => setDraft(d => ({ ...d, identity: { ...d.identity, identityNotes: e.target.value } }))}
              className="h-8 text-[11px]"
              maxLength={120}
              placeholder="Ex: limite de 5% sem aprovação"
            />
          </DraftField>

          <ListEditor
            label="Critérios de sucesso"
            tone="success"
            items={draft.successCriteria}
            onChange={v => setDraft(d => ({ ...d, successCriteria: v }))}
            placeholder="Ex: Proposta aceita em D+2"
          />
          <ListEditor
            label="Critérios de falha"
            tone="destructive"
            items={draft.failureCriteria}
            onChange={v => setDraft(d => ({ ...d, failureCriteria: v }))}
            placeholder="Ex: Lead recusou 2 contrapropostas"
          />

          <BehaviorPicker
            selected={draft.expectedBehaviorIds}
            onChange={v => setDraft(d => ({ ...d, expectedBehaviorIds: v }))}
            allBehaviors={behaviors.map(b => ({ id: b.id, label: b.label }))}
          />

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || loadingOv} className="flex-1 h-9">
              {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
              Salvar override
            </Button>
            {currentOverride && (
              <Button
                variant="outline"
                onClick={handleRemove}
                disabled={saving}
                className="h-9"
                title="Desativa o override (volta ao arquétipo)"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Coluna 2 — preview ao vivo */}
        <div className="space-y-2 bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Eye size={13} className="text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Preview ao vivo
              </span>
            </div>
            <div className="flex gap-1">
              {(['open', 'won', 'lost'] as PreviewStatus[]).map(s => {
                const disabled = layer === 'overlay' && s === 'open';
                const active = previewStatus === s && !disabled;
                return (
                  <button
                    key={s}
                    onClick={() => !disabled && setPreviewStatus(s)}
                    disabled={disabled}
                    className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase ${
                      active
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : disabled
                          ? 'bg-muted/30 text-muted-foreground/40 border-transparent cursor-not-allowed'
                          : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {runtime.loading || !preview ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-1.5">
              <Loader2 size={12} className="animate-spin" /> compondo…
            </div>
          ) : (
            <div className="space-y-2">
              <PreviewBlock label="Identidade efetiva">
                <div className="text-[11px] text-foreground space-y-0.5">
                  <p><strong>Persona:</strong> {preview.identity.persona}</p>
                  <p><strong>Tom:</strong> {preview.identity.tone}</p>
                  <p><strong>Missão:</strong> {preview.identity.mission}</p>
                  {preview.identity.identityNotes && (
                    <p className="text-muted-foreground italic">notas: {preview.identity.identityNotes}</p>
                  )}
                </div>
              </PreviewBlock>

              <PreviewBlock label="Objetivo">
                <p className="text-[11px] text-foreground">
                  {preview.goal || <span className="text-muted-foreground italic">(não definido)</span>}
                </p>
              </PreviewBlock>

              <div className="grid grid-cols-2 gap-2">
                <PreviewBlock label={`Sucesso (${preview.successCriteria.length})`}>
                  <ul className="text-[10px] space-y-0.5">
                    {preview.successCriteria.length === 0 && <li className="text-muted-foreground italic">—</li>}
                    {preview.successCriteria.slice(0, 4).map((s, i) => (
                      <li key={i} className="text-success">✓ {s}</li>
                    ))}
                  </ul>
                </PreviewBlock>
                <PreviewBlock label={`Falha (${preview.failureCriteria.length})`}>
                  <ul className="text-[10px] space-y-0.5">
                    {preview.failureCriteria.length === 0 && <li className="text-muted-foreground italic">—</li>}
                    {preview.failureCriteria.slice(0, 4).map((s, i) => (
                      <li key={i} className="text-destructive">✗ {s}</li>
                    ))}
                  </ul>
                </PreviewBlock>
              </div>

              <PreviewBlock label={`LBs ativos (${preview.expectedBehaviors.length})`}>
                <div className="flex flex-wrap gap-1">
                  {preview.expectedBehaviors.length === 0 && (
                    <span className="text-[10px] text-muted-foreground italic">nenhum</span>
                  )}
                  {preview.expectedBehaviors.slice(0, 8).map(b => (
                    <span
                      key={b.id}
                      className="text-[9px] px-1.5 py-0.5 rounded border bg-secondary text-foreground border-border"
                      title={b.label}
                    >
                      {b.id}
                    </span>
                  ))}
                  {preview.expectedBehaviors.length > 8 && (
                    <span className="text-[9px] text-muted-foreground">+{preview.expectedBehaviors.length - 8}</span>
                  )}
                </div>
              </PreviewBlock>

              <PreviewBlock label="Proveniência">
                <div className="space-y-1 text-[10px]">
                  <div className="flex items-center gap-1">
                    <GitBranch size={10} className="text-muted-foreground" />
                    <span className="text-muted-foreground">arquétipo:</span>
                    <span className="text-foreground font-mono">{preview.provenance.archetypeCode ?? '—'}</span>
                  </div>
                  {preview.provenance.statusOverlayCode && (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">overlay:</span>
                      <span className="text-foreground font-mono">{preview.provenance.statusOverlayCode}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground">overrides:</span>
                    {preview.provenance.overrideIds.length === 0 ? (
                      <span className="text-muted-foreground italic">nenhum</span>
                    ) : (
                      preview.provenance.overrideIds.map(id => {
                        const isDraft = id === `stage:${stageScopeId}:${layer}`;
                        return (
                          <span
                            key={id}
                            className={`px-1.5 py-0.5 rounded border font-mono ${
                              isDraft
                                ? 'bg-warning/15 text-warning border-warning/30'
                                : 'bg-secondary text-foreground border-border'
                            }`}
                            title={isDraft ? 'rascunho não salvo' : undefined}
                          >
                            {id}{isDraft ? ' (rascunho)' : ''}
                          </span>
                        );
                      })
                    )}
                  </div>
                  {preview.provenance.contextTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">tags:</span>
                      {preview.provenance.contextTags.map(t => (
                        <span key={t} className="text-foreground">#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </PreviewBlock>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Subcomponentes
// ----------------------------------------------------------------------------

const DraftField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
      {label}
    </label>
    {children}
  </div>
);

const PreviewBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="bg-background border border-border rounded-md p-2">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
      {label}
    </p>
    {children}
  </div>
);

const ListEditor = ({
  label, items, onChange, tone, placeholder,
}: {
  label: string;
  items: string[];
  onChange: (xs: string[]) => void;
  tone: 'success' | 'destructive';
  placeholder: string;
}) => {
  const [draft, setDraft] = useState('');
  const symbol = tone === 'success' ? '✓' : '✗';
  const cls = tone === 'success' ? 'text-success' : 'text-destructive';
  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
        {label} ({items.length})
      </label>
      <ul className="space-y-1 mb-1">
        {items.map((it, i) => (
          <li key={i} className="bg-background border border-border rounded p-1.5 flex items-start gap-1.5">
            <span className={`text-[11px] ${cls} shrink-0`}>{symbol}</span>
            <span className="flex-1 text-[11px] text-foreground leading-snug">{it}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-muted-foreground active:scale-95 shrink-0"
              aria-label="Remover"
            >
              <X size={11} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && draft.trim()) {
              onChange([...items, draft.trim()]); setDraft('');
            }
          }}
          placeholder={placeholder}
          className="h-7 text-[11px] flex-1"
        />
        <Button
          size="sm"
          onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}
          className="h-7 px-2"
        >
          <Plus size={11} />
        </Button>
      </div>
    </div>
  );
};

const BehaviorPicker = ({
  selected, onChange, allBehaviors,
}: {
  selected: string[];
  onChange: (xs: string[]) => void;
  allBehaviors: { id: string; label: string }[];
}) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => allBehaviors.filter(b => {
      if (!search) return true;
      const q = search.toLowerCase();
      return b.id.toLowerCase().includes(q) || b.label.toLowerCase().includes(q);
    }),
    [allBehaviors, search],
  );
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };
  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
        Comportamentos esperados ({selected.length})
      </label>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar LB..."
        className="h-7 text-[11px] mb-1"
      />
      <div className="max-h-32 overflow-y-auto space-y-0.5 border border-border rounded p-1 bg-background">
        {filtered.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic text-center py-2">Nenhum resultado</p>
        )}
        {filtered.slice(0, 30).map(b => {
          const active = selected.includes(b.id);
          return (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              className={`w-full text-left p-1 rounded border text-[10px] transition-colors ${
                active
                  ? 'bg-primary/10 border-primary/30 text-foreground'
                  : 'bg-card border-border text-muted-foreground'
              }`}
            >
              <span className="font-mono font-bold">{b.id}</span>
              <span className="ml-1.5">{b.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
