/**
 * PlaybookFourColumnEditor — Sprint 4 / Mudança A
 *
 * Editor compositivo de playbook em 4 colunas verticais (mobile-first via tabs,
 * desktop em grid 4-col):
 *   1. Identidade        → quem a IA é nesta etapa (tom, missão, persona)
 *   2. Critérios sucesso → o que define avançar
 *   3. Critérios falha   → o que define perder/arquivar
 *   4. Comportamentos    → LB-xxx esperados nesta etapa
 *
 * Inclui um **sandbox** de preview que renderiza como a IA reagiria a uma
 * mensagem fictícia do lead, dado o playbook atual + arquétipo de status.
 *
 * Persiste alterações em `funnel_stages.purpose` (identidade resumida) e em
 * `playbook_overrides` (scope = 'stage') quando o usuário salva.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  User, Check, X, Brain, Plus, Play, Loader2, Save, Sparkles, Search,
  Layers, ChevronDown, ChevronUp,
  FolderOpen, Trash2, GitCompare, Download,
} from 'lucide-react';
import type { FunnelStage } from '@/data/mockData';
import { useArchetypes } from '@/hooks/useArchetypes';
import { useIABehavior } from '@/hooks/useIABehavior';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { LeadBehaviorCategory } from '@/data/iaBehavior';
import { PlaybookOverrideEditor } from '@/components/PlaybookOverrideEditor';
import { useSandboxScenarios } from '@/hooks/useSandboxScenarios';
import { buildPayloadDiff, summarizeDiff } from '@/lib/playbookOverrideDiff';
import type { PlaybookOverride } from '@/lib/playbookComposer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnelId: string;
  stage: FunnelStage;
  onUpdate: (s: FunnelStage) => void;
}

interface Identity {
  persona: string;       // "Consultor especialista em alto padrão"
  tone: string;          // "Cordial, técnico, sem pressão"
  mission: string;       // "Conduzir o lead até..."
}

type ColKey = 'identity' | 'success' | 'failure' | 'behaviors';

const COLUMNS: { key: ColKey; label: string; icon: typeof User; color: string }[] = [
  { key: 'identity',  label: 'Identidade',     icon: User,   color: 'text-primary' },
  { key: 'success',   label: 'Sucesso',        icon: Check,  color: 'text-success' },
  { key: 'failure',   label: 'Falha',          icon: X,      color: 'text-destructive' },
  { key: 'behaviors', label: 'Comportamentos', icon: Brain,  color: 'text-warning' },
];

const CATEGORY_META: Record<LeadBehaviorCategory, { label: string; cls: string }> = {
  positive:  { label: 'Positivo',  cls: 'bg-success/15 text-success border-success/30' },
  neutral:   { label: 'Neutro',    cls: 'bg-muted text-muted-foreground border-border' },
  evasive:   { label: 'Evasivo',   cls: 'bg-warning/15 text-warning border-warning/30' },
  negative:  { label: 'Negativo',  cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  objection: { label: 'Objeção',   cls: 'bg-[hsl(270,40%,25%)]/50 text-[hsl(270,60%,75%)] border-[hsl(270,40%,40%)]' },
};

export const PlaybookFourColumnEditor = ({
  open, onOpenChange, funnelId, stage, onUpdate,
}: Props) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { stageArchetypes, loading: loadingArchetypes } = useArchetypes();
  const { behaviors, playbooks } = useIABehavior();

  // Coluna ativa em mobile (em desktop todas aparecem via grid)
  const [activeCol, setActiveCol] = useState<ColKey>('identity');
  const [saving, setSaving] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [funnelStageRow, setFunnelStageRow] = useState<{
    id: string;
    purpose: string;
    stage_archetype_id: string | null;
  } | null>(null);

  // Estado editável
  const [identity, setIdentity] = useState<Identity>({
    persona: '', tone: '', mission: '',
  });
  const [successCriteria, setSuccessCriteria] = useState<string[]>([]);
  const [failureCriteria, setFailureCriteria] = useState<string[]>([]);
  const [expectedBehaviorIds, setExpectedBehaviorIds] = useState<string[]>([]);
  const [archetypeId, setArchetypeId] = useState<string>('');

  // Carrega funnel_stages row + override existente
  useEffect(() => {
    if (!open || !funnelId || !stage.id || !profile?.organization_id) return;
    let cancelled = false;
    (async () => {
      const { data: fs } = await supabase
        .from('funnel_stages')
        .select('id, purpose, stage_archetype_id')
        .eq('funnel_id', funnelId)
        .eq('stage_id', stage.id)
        .maybeSingle();
      if (cancelled) return;
      if (fs) {
        setFunnelStageRow(fs as never);
        setArchetypeId((fs as { stage_archetype_id: string | null }).stage_archetype_id ?? '');
        // Identidade serializada no purpose como JSON ou texto livre
        const raw = (fs as { purpose: string }).purpose || '';
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setIdentity({
              persona: parsed.persona ?? '',
              tone: parsed.tone ?? '',
              mission: parsed.mission ?? '',
            });
          } else {
            setIdentity({ persona: '', tone: '', mission: raw });
          }
        } catch {
          setIdentity({ persona: '', tone: '', mission: raw });
        }
      } else {
        setFunnelStageRow(null);
        setArchetypeId('');
      }

      // Carrega override de etapa, se existir
      const { data: ov } = await supabase
        .from('playbook_overrides')
        .select('payload')
        .eq('scope_type', 'stage')
        .eq('scope_id', stage.id)
        .eq('layer', 'stage')
        .maybeSingle();
      if (cancelled) return;
      const payload = (ov?.payload as Record<string, unknown> | null) ?? {};
      setSuccessCriteria((payload.successCriteria as string[]) ?? stage.playbookOverride?.successCriteria ?? []);
      setFailureCriteria((payload.failureCriteria as string[]) ?? stage.playbookOverride?.failureCriteria ?? []);
      setExpectedBehaviorIds(
        (payload.expectedBehaviorIds as string[])
          ?? stage.playbookOverride?.expectedBehaviorIds
          ?? [],
      );
    })();
    return () => { cancelled = true; };
  }, [open, funnelId, stage.id, profile?.organization_id, stage.playbookOverride]);

  const archetype = useMemo(
    () => stageArchetypes.find(a => a.id === archetypeId),
    [stageArchetypes, archetypeId],
  );

  // Seed do playbook a partir do código vinculado ao arquétipo
  const seed = useMemo(() => {
    if (!archetype?.default_playbook_code) return undefined;
    return playbooks.find(p => p.stageCode === archetype.default_playbook_code);
  }, [archetype, playbooks]);

  // Quando muda arquétipo e ainda não há overrides, sugere defaults da seed
  useEffect(() => {
    if (!seed) return;
    if (successCriteria.length === 0) setSuccessCriteria(seed.successCriteria ?? []);
    if (failureCriteria.length === 0) setFailureCriteria(seed.failureCriteria ?? []);
    if (expectedBehaviorIds.length === 0) setExpectedBehaviorIds(seed.expectedBehaviorIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetypeId]);

  const handleSave = async () => {
    if (!profile?.organization_id) return;
    setSaving(true);
    try {
      const purposeJson = JSON.stringify(identity);

      // Upsert de funnel_stages (purpose + arquétipo)
      if (funnelStageRow) {
        await supabase
          .from('funnel_stages')
          .update({
            purpose: purposeJson,
            stage_archetype_id: archetypeId || null,
          })
          .eq('id', funnelStageRow.id);
      } else {
        const { data: inserted } = await supabase
          .from('funnel_stages')
          .insert({
            funnel_id: funnelId,
            stage_id: stage.id,
            organization_id: profile.organization_id,
            stage_archetype_id: archetypeId || null,
            position: 0,
            purpose: purposeJson,
            context_tags: [] as unknown as never,
          })
          .select('id, purpose, stage_archetype_id')
          .maybeSingle();
        if (inserted) setFunnelStageRow(inserted as never);
      }

      // Upsert de playbook_overrides (scope = 'stage')
      const payload = { successCriteria, failureCriteria, expectedBehaviorIds };
      const { data: existing } = await supabase
        .from('playbook_overrides')
        .select('id')
        .eq('scope_type', 'stage')
        .eq('scope_id', stage.id)
        .eq('layer', 'stage')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('playbook_overrides')
          .update({ payload: payload as unknown as never, is_active: true })
          .eq('id', (existing as { id: string }).id);
      } else {
        await supabase
          .from('playbook_overrides')
          .insert({
            organization_id: profile.organization_id,
            scope_type: 'stage',
            scope_id: stage.id,
            layer: 'stage',
            payload: payload as unknown as never,
            is_active: true,
          });
      }

      // Sincroniza no objeto FunnelStage local (override em memória + playbookCode)
      const playbookCodeFromArchetype = archetype?.default_playbook_code as FunnelStage['playbookCode'] | undefined;
      onUpdate({
        ...stage,
        playbookCode: playbookCodeFromArchetype ?? stage.playbookCode,
        playbookOverride: {
          ...(stage.playbookOverride ?? {}),
          successCriteria,
          failureCriteria,
          expectedBehaviorIds,
        },
      });

      toast({ title: 'Playbook salvo', description: 'Mudanças aplicadas a esta etapa.' });
      onOpenChange(false);
    } catch (err) {
      console.error('[PlaybookFourColumnEditor] save error', err);
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] p-0 flex flex-col bg-background">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Editor de playbook · 4 colunas
            </span>
          </div>
          <SheetTitle className="text-base text-left truncate">{stage.name}</SheetTitle>

          {/* Seletor de arquétipo */}
          <div className="mt-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">
              Arquétipo de etapa
            </label>
            {loadingArchetypes ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> carregando…
              </div>
            ) : (
              <select
                value={archetypeId}
                onChange={e => setArchetypeId(e.target.value)}
                className="w-full bg-card border border-input rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— sem arquétipo —</option>
                {stageArchetypes.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tabs de colunas (mobile) */}
          <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-none md:hidden">
            {COLUMNS.map(c => {
              const Icon = c.icon;
              const active = activeCol === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setActiveCol(c.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors active:scale-95 ${
                    active
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-secondary text-muted-foreground border border-transparent'
                  }`}
                >
                  <Icon size={11} className={active ? c.color : ''} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        {/* Colunas — mobile single, desktop grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="md:grid md:grid-cols-4 md:gap-3">
            <div className={activeCol !== 'identity' ? 'hidden md:block' : ''}>
              <ColHeader col="identity" />
              <IdentityColumn value={identity} onChange={setIdentity} />
            </div>
            <div className={activeCol !== 'success' ? 'hidden md:block' : ''}>
              <ColHeader col="success" />
              <CriteriaColumn
                items={successCriteria}
                onChange={setSuccessCriteria}
                tone="success"
                placeholder="Ex: lead aceitou agendamento"
              />
            </div>
            <div className={activeCol !== 'failure' ? 'hidden md:block' : ''}>
              <ColHeader col="failure" />
              <CriteriaColumn
                items={failureCriteria}
                onChange={setFailureCriteria}
                tone="destructive"
                placeholder="Ex: lead pediu para não contatar"
              />
            </div>
            <div className={activeCol !== 'behaviors' ? 'hidden md:block' : ''}>
              <ColHeader col="behaviors" />
              <BehaviorsColumn
                selected={expectedBehaviorIds}
                onToggle={(id) => {
                  setExpectedBehaviorIds(prev =>
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
                  );
                }}
              />
            </div>
          </div>

          {/* Sandbox de preview (sempre visível abaixo) */}
          <div className="mt-4">
            <SandboxPreview
              identity={identity}
              successCriteria={successCriteria}
              failureCriteria={failureCriteria}
              expectedBehaviorIds={expectedBehaviorIds}
              stageName={stage.name}
              archetypeCode={archetype?.code}
            />
          </div>

          {/* Sprint 11 — Overrides composicionais (avançado, colapsável) */}
          <div className="mt-4 border border-border rounded-xl bg-card/40">
            <button
              onClick={() => setOverridesOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 active:scale-[0.99]"
            >
              <span className="flex items-center gap-1.5">
                <Layers size={13} className="text-primary" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                  Overrides composicionais
                </span>
                <span className="text-[10px] text-muted-foreground">(avançado)</span>
              </span>
              {overridesOpen
                ? <ChevronUp size={14} className="text-muted-foreground" />
                : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {overridesOpen && (
              <div className="border-t border-border p-3">
                <PlaybookOverrideEditor
                  funnelId={funnelId}
                  stageId={stage.id}
                  stageName={stage.name}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer com Salvar */}
        <div className="border-t border-border p-3 flex gap-2 shrink-0 bg-background">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar playbook
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ============================================================================
// Colunas
// ============================================================================

const ColHeader = ({ col }: { col: ColKey }) => {
  const meta = COLUMNS.find(c => c.key === col)!;
  const Icon = meta.icon;
  return (
    <div className="hidden md:flex items-center gap-1.5 mb-2 sticky top-0 bg-background py-1 z-10">
      <Icon size={12} className={meta.color} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {meta.label}
      </span>
    </div>
  );
};

const IdentityColumn = ({
  value, onChange,
}: { value: Identity; onChange: (v: Identity) => void }) => (
  <div className="space-y-3">
    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 block">
        Persona
      </label>
      <Input
        value={value.persona}
        onChange={e => onChange({ ...value, persona: e.target.value })}
        placeholder="Ex: Consultor sênior de alto padrão"
        className="h-9 text-xs"
        maxLength={80}
      />
    </div>
    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 block">
        Tom de voz
      </label>
      <Input
        value={value.tone}
        onChange={e => onChange({ ...value, tone: e.target.value })}
        placeholder="Ex: Cordial, técnico, sem pressão"
        className="h-9 text-xs"
        maxLength={80}
      />
    </div>
    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 block">
        Missão nesta etapa
      </label>
      <textarea
        value={value.mission}
        onChange={e => onChange({ ...value, mission: e.target.value })}
        placeholder="O que a IA precisa conseguir aqui?"
        rows={4}
        maxLength={300}
        className="w-full bg-card border border-input rounded-md px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      <p className="text-[10px] text-muted-foreground mt-0.5">{value.mission.length}/300</p>
    </div>
  </div>
);

const CriteriaColumn = ({
  items, onChange, tone, placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  tone: 'success' | 'destructive';
  placeholder: string;
}) => {
  const [draft, setDraft] = useState('');
  const toneCls = tone === 'success' ? 'text-success' : 'text-destructive';
  const symbol = tone === 'success' ? '✓' : '✗';

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {items.length === 0 && (
          <li className="text-[10px] text-muted-foreground italic px-1">
            Nenhum critério ainda
          </li>
        )}
        {items.map((it, i) => (
          <li key={i} className="bg-card border border-border rounded-md p-2 flex items-start gap-1.5">
            <span className={`shrink-0 mt-0.5 text-xs ${toneCls}`}>{symbol}</span>
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
          className="h-8 text-[11px] flex-1"
        />
        <Button
          size="sm"
          onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}
          className="h-8 px-2"
        >
          <Plus size={12} />
        </Button>
      </div>
    </div>
  );
};

const BehaviorsColumn = ({
  selected, onToggle,
}: { selected: string[]; onToggle: (id: string) => void }) => {
  const { behaviors } = useIABehavior();
  const [search, setSearch] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  const filtered = useMemo(() => {
    return behaviors.filter(b => {
      if (showOnlyActive && !selected.includes(b.id)) return false;
      if (search) {
        const q = search.toLowerCase();
        return b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [behaviors, search, showOnlyActive, selected]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar LB..."
            className="h-7 text-[11px] pl-7"
          />
        </div>
        <button
          onClick={() => setShowOnlyActive(v => !v)}
          className={`px-2 rounded-md text-[10px] font-medium border ${
            showOnlyActive ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
          }`}
        >
          {selected.length}
        </button>
      </div>
      <ul className="space-y-1 max-h-[260px] md:max-h-none overflow-y-auto">
        {filtered.map(b => {
          const active = selected.includes(b.id);
          const cat = CATEGORY_META[b.category];
          return (
            <li key={b.id}>
              <button
                onClick={() => onToggle(b.id)}
                className={`w-full text-left p-1.5 rounded-md border active:scale-[0.99] transition-colors ${
                  active ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground shrink-0">{b.id}</span>
                  <span className={`text-[8px] px-1 py-0.5 rounded border ${cat.cls} shrink-0`}>
                    {cat.label}
                  </span>
                  {active && <Check size={10} className="text-primary ml-auto shrink-0" />}
                </div>
                <p className="text-[11px] text-foreground leading-tight line-clamp-2">{b.label}</p>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="text-[10px] text-muted-foreground italic text-center py-3">
            Nenhum resultado
          </li>
        )}
      </ul>
    </div>
  );
};

// ============================================================================
// Sandbox de preview
// ============================================================================

const SAMPLE_MESSAGES = [
  { id: 's1', label: 'Lead pede preço',     text: 'Quanto custa esse imóvel?' },
  { id: 's2', label: 'Lead some',           text: '...' },
  { id: 's3', label: 'Lead aceita visita',  text: 'Pode ser amanhã às 14h?' },
  { id: 's4', label: 'Lead objeta valor',   text: 'Tá muito caro pra mim' },
];

const SandboxPreview = ({
  identity, successCriteria, failureCriteria, expectedBehaviorIds,
  stageName, archetypeCode,
}: {
  identity: Identity;
  successCriteria: string[];
  failureCriteria: string[];
  expectedBehaviorIds: string[];
  stageName: string;
  archetypeCode?: string;
}) => {
  const { behaviors } = useIABehavior();
  const [sample, setSample] = useState<typeof SAMPLE_MESSAGES[number]>(SAMPLE_MESSAGES[0]);

  // Heurística simples para o sandbox: encontra o LB selecionado mais próximo
  const matched = useMemo(() => {
    const candidates = behaviors.filter(b => expectedBehaviorIds.includes(b.id));
    const text = sample.text.toLowerCase();
    const found = candidates.find(b =>
      b.detectionHints?.some((h: string) => text.includes(h.toLowerCase()))
      || b.label.toLowerCase().split(' ').some(w => w.length > 3 && text.includes(w))
    );
    return found ?? candidates[0];
  }, [behaviors, expectedBehaviorIds, sample]);

  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Play size={12} className="text-primary" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Sandbox · simular reação da IA
        </span>
      </div>

      <div className="flex gap-1 mb-2 flex-wrap">
        {SAMPLE_MESSAGES.map(s => (
          <button
            key={s.id}
            onClick={() => setSample(s)}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              sample.id === s.id
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="bg-secondary rounded-lg p-2 text-[11px]">
          <span className="text-[9px] text-muted-foreground uppercase">Lead diz:</span>
          <p className="text-foreground mt-0.5">"{sample.text}"</p>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 text-[11px]">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles size={10} className="text-primary" />
            <span className="text-[9px] text-primary uppercase font-semibold">IA reage:</span>
          </div>
          {expectedBehaviorIds.length === 0 ? (
            <p className="text-muted-foreground italic">
              Selecione comportamentos para que a IA saiba como reagir.
            </p>
          ) : matched ? (
            <>
              <p className="text-[9px] text-muted-foreground mb-1">
                Detectou: <strong className="text-foreground">{matched.id} · {matched.label}</strong>
              </p>
              <p className="text-foreground leading-snug">{matched.defaultReaction}</p>
              {matched.nextStep && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  → próximo passo: {matched.nextStep}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground italic">
              Nenhum LB casou com esta mensagem — a IA pediria contexto.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="bg-success/10 border border-success/20 rounded-md p-1.5">
            <p className="text-success font-semibold mb-0.5">{successCriteria.length} ✓ sucesso</p>
            <p className="text-muted-foreground line-clamp-2">
              {successCriteria[0] ?? '—'}
            </p>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-1.5">
            <p className="text-destructive font-semibold mb-0.5">{failureCriteria.length} ✗ falha</p>
            <p className="text-muted-foreground line-clamp-2">
              {failureCriteria[0] ?? '—'}
            </p>
          </div>
        </div>

        {(identity.persona || identity.tone) && (
          <div className="text-[10px] text-muted-foreground italic border-t border-border pt-1.5">
            Falando como <strong className="text-foreground not-italic">{identity.persona || '—'}</strong>
            {identity.tone && <> · tom <strong className="text-foreground not-italic">{identity.tone}</strong></>}
            {archetypeCode && <> · arq. <strong className="text-foreground not-italic">{archetypeCode}</strong></>}
          </div>
        )}
      </div>
    </div>
  );
};
