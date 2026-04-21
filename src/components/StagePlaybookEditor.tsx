/**
 * Editor de Playbook por etapa — Fase 2 da camada comportamental da IA.
 *
 * Sheet bottom (mobile-first 411px) com 6 seções colapsáveis:
 *  1. Objetivo
 *  2. Comportamentos do lead (LB)
 *  3. A IA deve / não deve (DO/DONT) — universais herdados + específicos
 *  4. Perguntas (ASK / NOASK) — universais herdados + específicos
 *  5. Follow-up (escolha da escada + preview)
 *  6. Encaminhamento (advance / archive / handoff)
 *
 * Edita SEM persistir em backend nesta fase: aplica o `playbookOverride` no
 * objeto FunnelStage via callback `onUpdate`. Persistência real virá na Fase 4.
 */

import { createContext, useContext, useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Search, Target, Brain, Check, X, HelpCircle, Ban,
  Clock, ArrowRight, Plus, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import type { FunnelStage } from '@/data/mockData';
import {
  IA_UNIVERSAL_RULES as SEED_RULES,
  LEAD_BEHAVIORS as SEED_BEHAVIORS,
  STAGE_PLAYBOOKS as SEED_PLAYBOOKS,
  STAGE_SPECIFIC_RULES as SEED_STAGE_RULES,
  FOLLOWUP_LADDERS as SEED_LADDERS,
  HANDOFF_TRIGGERS as SEED_TRIGGERS,
  type IABehaviorRule, type IARuleKind, type LeadBehaviorCategory,
  type StagePlaybook, type LeadBehavior, type FollowUpLadder, type HandoffTrigger,
} from '@/data/iaBehavior';
import { useIABehavior } from '@/hooks/useIABehavior';

// Context interno para distribuir os datasets carregados via hook para os
// subcomponentes sem precisar refatorar suas assinaturas.
interface IADatasets {
  universalRules: IABehaviorRule[];
  stageRules: IABehaviorRule[];
  behaviors: LeadBehavior[];
  playbooks: StagePlaybook[];
  ladders: FollowUpLadder[];
  triggers: HandoffTrigger[];
}
const IADatasetsCtx = createContext<IADatasets>({
  universalRules: SEED_RULES,
  stageRules: SEED_STAGE_RULES,
  behaviors: SEED_BEHAVIORS,
  playbooks: SEED_PLAYBOOKS,
  ladders: SEED_LADDERS,
  triggers: SEED_TRIGGERS,
});
const useIADatasets = () => useContext(IADatasetsCtx);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: FunnelStage;
  onUpdate: (s: FunnelStage) => void;
}

type SectionKey = 'goal' | 'behaviors' | 'rules' | 'asks' | 'followup' | 'handoff';

const SECTIONS: { key: SectionKey; label: string; icon: typeof Target }[] = [
  { key: 'goal',      label: 'Objetivo',         icon: Target },
  { key: 'behaviors', label: 'Comportamentos',   icon: Brain },
  { key: 'rules',     label: 'A IA deve/não deve', icon: Check },
  { key: 'asks',      label: 'Perguntas',        icon: HelpCircle },
  { key: 'followup',  label: 'Follow-up',        icon: Clock },
  { key: 'handoff',   label: 'Encaminhamento',   icon: ArrowRight },
];

const CATEGORY_META: Record<LeadBehaviorCategory, { label: string; classes: string }> = {
  positive:  { label: 'Positivo',  classes: 'bg-success/15 text-success border-success/30' },
  neutral:   { label: 'Neutro',    classes: 'bg-muted text-muted-foreground border-border' },
  evasive:   { label: 'Evasivo',   classes: 'bg-warning/15 text-warning border-warning/30' },
  negative:  { label: 'Negativo',  classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  objection: { label: 'Objeção',   classes: 'bg-[hsl(270,40%,25%)]/50 text-[hsl(270,60%,75%)] border-[hsl(270,40%,40%)]' },
};

const PRIORITY_CLASSES: Record<string, string> = {
  P0: 'bg-destructive/15 text-destructive border-destructive/30',
  P1: 'bg-warning/15 text-warning border-warning/30',
  P2: 'bg-primary/15 text-primary border-primary/30',
  P3: 'bg-muted text-muted-foreground border-border',
};

export const StagePlaybookEditor = ({ open, onOpenChange, stage, onUpdate }: Props) => {
  const [activeSection, setActiveSection] = useState<SectionKey>('goal');

  // Resolve playbook seed a partir do code (ou primeiro encaixe pelo nome)
  const playbookCode = stage.playbookCode;
  const seed: StagePlaybook | undefined = useMemo(
    () => playbookCode ? STAGE_PLAYBOOKS.find(p => p.stageCode === playbookCode) : undefined,
    [playbookCode],
  );

  const override = stage.playbookOverride ?? {};

  // Valores efetivos (override > seed > defaults)
  const goal = override.goal ?? seed?.goal ?? '';
  const successCriteria = override.successCriteria ?? seed?.successCriteria ?? [];
  const failureCriteria = override.failureCriteria ?? seed?.failureCriteria ?? [];
  const expectedBehaviorIds = override.expectedBehaviorIds ?? seed?.expectedBehaviorIds ?? [];
  const stageRuleIds = override.stageRuleIds ?? seed?.stageRuleIds ?? [];
  const handoffTriggerIds = override.handoffTriggerIds ?? seed?.handoffTriggerIds ?? [];
  const advanceTriggers = override.advanceTriggers ?? seed?.advanceTriggers ?? [];
  const archiveTriggers = override.archiveTriggers ?? seed?.archiveTriggers ?? [];
  const followUpLadderId = override.followUpLadderId ?? seed?.followUpLadderId ?? 'ladder-media';

  const patch = (changes: Partial<NonNullable<FunnelStage['playbookOverride']>>) => {
    onUpdate({ ...stage, playbookOverride: { ...override, ...changes } });
  };

  const setPlaybookCode = (code: FunnelStage['playbookCode']) => {
    onUpdate({ ...stage, playbookCode: code });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col bg-background">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Comportamento da IA nesta etapa
            </span>
          </div>
          <SheetTitle className="text-base text-left truncate">{stage.name}</SheetTitle>
        </SheetHeader>

        {/* Seletor de playbook (apenas se ainda não vinculado) */}
        {!playbookCode && (
          <PlaybookPicker onPick={setPlaybookCode} />
        )}

        {playbookCode && (
          <>
            {/* Tabs scrolláveis */}
            <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-border shrink-0 scrollbar-none">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                const active = activeSection === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors active:scale-95 ${
                      active
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'bg-secondary text-muted-foreground border border-transparent'
                    }`}
                  >
                    <Icon size={12} />
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {activeSection === 'goal' && (
                <GoalSection
                  goal={goal}
                  successCriteria={successCriteria}
                  failureCriteria={failureCriteria}
                  playbookCode={playbookCode}
                  onChangePlaybookCode={setPlaybookCode}
                  onChange={patch}
                />
              )}

              {activeSection === 'behaviors' && (
                <BehaviorsSection
                  expectedBehaviorIds={expectedBehaviorIds}
                  reactionOverrides={override.behaviorReactionOverrides ?? {}}
                  onToggle={(id) => {
                    const has = expectedBehaviorIds.includes(id);
                    patch({ expectedBehaviorIds: has
                      ? expectedBehaviorIds.filter(x => x !== id)
                      : [...expectedBehaviorIds, id] });
                  }}
                  onReactionEdit={(id, text) => {
                    const next = { ...(override.behaviorReactionOverrides ?? {}) };
                    if (text) next[id] = text; else delete next[id];
                    patch({ behaviorReactionOverrides: next });
                  }}
                />
              )}

              {activeSection === 'rules' && (
                <RulesSection
                  kinds={['do', 'dont']}
                  scope={playbookCode}
                  activeIds={stageRuleIds}
                  onToggle={(id) => {
                    const has = stageRuleIds.includes(id);
                    patch({ stageRuleIds: has
                      ? stageRuleIds.filter(x => x !== id)
                      : [...stageRuleIds, id] });
                  }}
                />
              )}

              {activeSection === 'asks' && (
                <RulesSection
                  kinds={['ask', 'noask']}
                  scope={playbookCode}
                  activeIds={stageRuleIds}
                  onToggle={(id) => {
                    const has = stageRuleIds.includes(id);
                    patch({ stageRuleIds: has
                      ? stageRuleIds.filter(x => x !== id)
                      : [...stageRuleIds, id] });
                  }}
                />
              )}

              {activeSection === 'followup' && (
                <FollowUpSection
                  selectedLadderId={followUpLadderId}
                  onSelect={(id) => patch({ followUpLadderId: id })}
                />
              )}

              {activeSection === 'handoff' && (
                <HandoffSection
                  stage={playbookCode}
                  activeTriggerIds={handoffTriggerIds}
                  advanceTriggers={advanceTriggers}
                  archiveTriggers={archiveTriggers}
                  onToggleTrigger={(id) => {
                    const has = handoffTriggerIds.includes(id);
                    patch({ handoffTriggerIds: has
                      ? handoffTriggerIds.filter(x => x !== id)
                      : [...handoffTriggerIds, id] });
                  }}
                  onChangeAdvance={(arr) => patch({ advanceTriggers: arr })}
                  onChangeArchive={(arr) => patch({ archiveTriggers: arr })}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ============================================================================
// Seletor inicial de playbook
// ============================================================================

const PlaybookPicker = ({ onPick }: { onPick: (code: FunnelStage['playbookCode']) => void }) => (
  <div className="p-4 space-y-3">
    <p className="text-xs text-muted-foreground">
      Vincule esta etapa a um playbook comportamental da IA. O conteúdo padrão
      pode ser editado depois sem afetar outras etapas.
    </p>
    <div className="space-y-2">
      {STAGE_PLAYBOOKS.map(pb => (
        <button
          key={pb.stageCode}
          onClick={() => onPick(pb.stageCode)}
          className="w-full text-left bg-card border border-border rounded-xl p-3 active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded">
              {pb.stageCode}
            </span>
            <span className="text-xs text-muted-foreground">
              {pb.expectedBehaviorIds.length} comportamentos · {pb.stageRuleIds.length} regras
            </span>
          </div>
          <p className="text-xs text-foreground leading-snug line-clamp-2">{pb.goal}</p>
        </button>
      ))}
    </div>
  </div>
);

// ============================================================================
// Aba 1 — Objetivo
// ============================================================================

const GoalSection = ({
  goal, successCriteria, failureCriteria, playbookCode,
  onChangePlaybookCode, onChange,
}: {
  goal: string;
  successCriteria: string[];
  failureCriteria: string[];
  playbookCode: FunnelStage['playbookCode'];
  onChangePlaybookCode: (c: FunnelStage['playbookCode']) => void;
  onChange: (changes: Partial<NonNullable<FunnelStage['playbookOverride']>>) => void;
}) => (
  <div className="space-y-4">
    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 block">
        Playbook vinculado
      </label>
      <div className="flex gap-1.5 flex-wrap">
        {STAGE_PLAYBOOKS.map(pb => (
          <button
            key={pb.stageCode}
            onClick={() => onChangePlaybookCode(pb.stageCode)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border active:scale-95 ${
              playbookCode === pb.stageCode
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            {pb.stageCode}
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 block">
        Objetivo da IA nesta etapa
      </label>
      <textarea
        value={goal}
        onChange={e => onChange({ goal: e.target.value })}
        rows={4}
        className="w-full bg-card border border-border rounded-lg p-2.5 text-xs text-foreground outline-none focus:border-primary/50 resize-none"
        placeholder="O que a IA precisa conseguir aqui?"
      />
    </div>

    <CriteriaList
      label="Critérios de sucesso"
      items={successCriteria}
      onChange={(items) => onChange({ successCriteria: items })}
      tone="success"
    />

    <CriteriaList
      label="Critérios de falha"
      items={failureCriteria}
      onChange={(items) => onChange({ failureCriteria: items })}
      tone="destructive"
    />
  </div>
);

const CriteriaList = ({
  label, items, onChange, tone,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  tone: 'success' | 'destructive';
}) => {
  const [draft, setDraft] = useState('');
  const toneCls = tone === 'success' ? 'text-success' : 'text-destructive';

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 block">
        {label}
      </label>
      <ul className="space-y-1.5 mb-2">
        {items.map((it, i) => (
          <li key={i} className="bg-card border border-border rounded-lg p-2 flex items-start gap-2">
            <span className={`shrink-0 mt-0.5 ${toneCls}`}>{tone === 'success' ? '✓' : '✗'}</span>
            <span className="flex-1 text-xs text-foreground leading-snug">{it}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-muted-foreground active:scale-95 shrink-0"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Adicionar critério..."
          className="flex-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        />
        <button
          onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}
          className="bg-primary text-primary-foreground rounded-lg px-2.5 active:scale-95"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Aba 2 — Comportamentos do lead
// ============================================================================

const BehaviorsSection = ({
  expectedBehaviorIds, reactionOverrides, onToggle, onReactionEdit,
}: {
  expectedBehaviorIds: string[];
  reactionOverrides: Record<string, string>;
  onToggle: (id: string) => void;
  onReactionEdit: (id: string, text: string) => void;
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LeadBehaviorCategory | 'all' | 'active'>('active');

  const filtered = useMemo(() => {
    return LEAD_BEHAVIORS.filter(b => {
      if (filter === 'active' && !expectedBehaviorIds.includes(b.id)) return false;
      if (filter !== 'all' && filter !== 'active' && b.category !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, filter, expectedBehaviorIds]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar comportamento..."
          className="w-full bg-card border border-border rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        />
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-3 px-3">
        {(['active', 'all', 'positive', 'neutral', 'evasive', 'negative', 'objection'] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap border active:scale-95 ${
              filter === k
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-secondary text-muted-foreground border-transparent'
            }`}
          >
            {k === 'active' ? `Ativos (${expectedBehaviorIds.length})` :
             k === 'all' ? 'Todos' : CATEGORY_META[k as LeadBehaviorCategory].label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {filtered.map(b => (
          <BehaviorRow
            key={b.id}
            behavior={b}
            active={expectedBehaviorIds.includes(b.id)}
            reactionOverride={reactionOverrides[b.id]}
            onToggle={() => onToggle(b.id)}
            onReactionEdit={(text) => onReactionEdit(b.id, text)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum comportamento encontrado.</p>
        )}
      </div>
    </div>
  );
};

const BehaviorRow = ({
  behavior, active, reactionOverride, onToggle, onReactionEdit,
}: {
  behavior: LeadBehavior;
  active: boolean;
  reactionOverride?: string;
  onToggle: () => void;
  onReactionEdit: (text: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(reactionOverride ?? behavior.defaultReaction);
  const cat = CATEGORY_META[behavior.category];

  return (
    <div className={`rounded-lg border transition-colors ${
      active ? 'bg-card border-primary/40' : 'bg-secondary border-border opacity-70'
    }`}>
      <div className="flex items-start gap-2 p-2.5">
        <button
          onClick={onToggle}
          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center active:scale-90 ${
            active ? 'bg-primary border-primary' : 'bg-card border-border'
          }`}
        >
          {active && <Check size={12} className="text-primary-foreground" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[9px] font-mono text-muted-foreground">{behavior.id}</span>
            <span className={`text-[9px] px-1 py-px rounded border ${cat.classes}`}>{cat.label}</span>
          </div>
          <p className="text-xs text-foreground leading-snug">{behavior.label}</p>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-muted-foreground active:scale-95"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-border pt-2">
          <div>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Sinais</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{behavior.detectionHints.join(' · ')}</p>
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
              Reação da IA {reactionOverride && <span className="text-primary normal-case">(personalizada)</span>}
            </span>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim() && draft.trim() !== behavior.defaultReaction) onReactionEdit(draft.trim());
                else if (!draft.trim() || draft.trim() === behavior.defaultReaction) onReactionEdit('');
              }}
              rows={3}
              className="w-full mt-1 bg-card border border-border rounded p-2 text-[11px] text-foreground outline-none focus:border-primary/50 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Abas 3 e 4 — Regras DO/DONT/ASK/NOASK
// ============================================================================

const KIND_META: Record<IARuleKind, { label: string; icon: typeof Check; classes: string }> = {
  do:    { label: 'A IA deve',     icon: Check,     classes: 'text-success' },
  dont:  { label: 'A IA não deve', icon: X,         classes: 'text-destructive' },
  ask:   { label: 'Deve perguntar',  icon: HelpCircle, classes: 'text-primary' },
  noask: { label: 'Não deve perguntar', icon: Ban,   classes: 'text-warning' },
};

const RulesSection = ({
  kinds, scope, activeIds, onToggle,
}: {
  kinds: IARuleKind[];
  scope: NonNullable<FunnelStage['playbookCode']>;
  activeIds: string[];
  onToggle: (id: string) => void;
}) => {
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    return kinds.map(k => {
      const universals = IA_UNIVERSAL_RULES.filter(r => r.kind === k);
      const specifics = STAGE_SPECIFIC_RULES.filter(r => r.kind === k && r.scope === scope);
      const filterFn = (r: IABehaviorRule) =>
        !search || r.text.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase());
      return {
        kind: k,
        universals: universals.filter(filterFn),
        specifics: specifics.filter(filterFn),
      };
    });
  }, [kinds, scope, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar regra..."
          className="w-full bg-card border border-border rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        />
      </div>

      {groups.map(g => {
        const meta = KIND_META[g.kind];
        const Icon = meta.icon;
        return (
          <div key={g.kind} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Icon size={12} className={meta.classes} />
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.classes}`}>
                {meta.label}
              </span>
            </div>

            {/* Específicas da etapa */}
            {g.specifics.length > 0 && (
              <>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                  Específicas desta etapa
                </span>
                {g.specifics.map(r => (
                  <RuleRow
                    key={r.id}
                    rule={r}
                    active={activeIds.includes(r.id)}
                    onToggle={() => onToggle(r.id)}
                  />
                ))}
              </>
            )}

            {/* Universais (somente leitura) */}
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide pt-1 block">
              Universais (sempre ativas)
            </span>
            {g.universals.map(r => (
              <RuleRow key={r.id} rule={r} active readonly />
            ))}
          </div>
        );
      })}
    </div>
  );
};

const RuleRow = ({
  rule, active, readonly, onToggle,
}: {
  rule: IABehaviorRule;
  active: boolean;
  readonly?: boolean;
  onToggle?: () => void;
}) => (
  <div className={`flex items-start gap-2 p-2 rounded-lg border ${
    readonly
      ? 'bg-secondary/40 border-border opacity-80'
      : active
        ? 'bg-card border-primary/40'
        : 'bg-secondary border-border opacity-70'
  }`}>
    <button
      onClick={onToggle}
      disabled={readonly}
      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center mt-0.5 ${
        readonly ? 'bg-muted border-border cursor-not-allowed' :
        active ? 'bg-primary border-primary active:scale-90' : 'bg-card border-border active:scale-90'
      }`}
    >
      {active && <Check size={10} className="text-primary-foreground" />}
    </button>
    <div className="flex-1 min-w-0">
      <span className="text-[9px] font-mono text-muted-foreground">{rule.id}</span>
      <p className="text-[11px] text-foreground leading-snug mt-0.5">{rule.text}</p>
      {rule.meta && (
        <p className="text-[10px] text-muted-foreground mt-0.5 italic">{rule.meta}</p>
      )}
    </div>
  </div>
);

// ============================================================================
// Aba 5 — Follow-up
// ============================================================================

const FollowUpSection = ({
  selectedLadderId, onSelect,
}: {
  selectedLadderId: string;
  onSelect: (id: string) => void;
}) => (
  <div className="space-y-3">
    <p className="text-[11px] text-muted-foreground">
      Escada de mensagens automáticas quando o lead silencia nesta etapa.
    </p>
    {FOLLOWUP_LADDERS.map(l => {
      const active = l.id === selectedLadderId;
      return (
        <button
          key={l.id}
          onClick={() => onSelect(l.id)}
          className={`w-full text-left rounded-xl border p-3 transition-colors active:scale-[0.99] ${
            active ? 'bg-card border-primary/50' : 'bg-secondary border-border'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-foreground">{l.name}</span>
            {active && (
              <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">
                ATIVA
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">{l.description}</p>
          <ul className="space-y-1">
            {l.steps.map((s, i) => (
              <li key={i} className="text-[10px] bg-background/50 rounded px-2 py-1">
                <span className="text-primary font-bold">+{formatHours(s.afterHours)}</span>
                <span className="text-muted-foreground"> · {s.tone}</span>
                <p className="text-foreground/80 mt-0.5">{s.sampleMessage}</p>
              </li>
            ))}
          </ul>
        </button>
      );
    })}
  </div>
);

const formatHours = (h: number): string => {
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const m = Math.round(d / 30);
  return `${m}m`;
};

// ============================================================================
// Aba 6 — Encaminhamento
// ============================================================================

const HandoffSection = ({
  stage, activeTriggerIds, advanceTriggers, archiveTriggers,
  onToggleTrigger, onChangeAdvance, onChangeArchive,
}: {
  stage: NonNullable<FunnelStage['playbookCode']>;
  activeTriggerIds: string[];
  advanceTriggers: string[];
  archiveTriggers: string[];
  onToggleTrigger: (id: string) => void;
  onChangeAdvance: (arr: string[]) => void;
  onChangeArchive: (arr: string[]) => void;
}) => {
  const relevantTriggers = useMemo(() =>
    HANDOFF_TRIGGERS.filter(t => t.stage === '*' || t.stage === stage),
    [stage]
  );

  return (
    <div className="space-y-4">
      <div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 block">
          Gatilhos de avanço para próxima etapa
        </span>
        <CriteriaListInline items={advanceTriggers} onChange={onChangeAdvance} tone="primary" />
      </div>

      <div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 block">
          Gatilhos de arquivamento
        </span>
        <CriteriaListInline items={archiveTriggers} onChange={onChangeArchive} tone="muted" />
      </div>

      <div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 block">
          Handoff para corretor humano
        </span>
        <p className="text-[10px] text-muted-foreground mb-2">
          Quando a IA detectar uma destas condições, transfere o atendimento.
        </p>
        <div className="space-y-1.5">
          {relevantTriggers.map(t => {
            const active = activeTriggerIds.includes(t.id);
            return (
              <div key={t.id} className={`rounded-lg border p-2 ${
                active ? 'bg-card border-primary/40' : 'bg-secondary border-border opacity-70'
              }`}>
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => onToggleTrigger(t.id)}
                    className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center mt-0.5 ${
                      active ? 'bg-primary border-primary' : 'bg-card border-border'
                    } active:scale-90`}
                  >
                    {active && <Check size={10} className="text-primary-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[9px] px-1 py-px rounded font-bold border ${PRIORITY_CLASSES[t.priority]}`}>
                        {t.priority}
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground">{t.id}</span>
                    </div>
                    <p className="text-[11px] text-foreground leading-snug font-medium">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.condition}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CriteriaListInline = ({
  items, onChange, tone,
}: {
  items: string[];
  onChange: (arr: string[]) => void;
  tone: 'primary' | 'muted';
}) => {
  const [draft, setDraft] = useState('');
  const dotCls = tone === 'primary' ? 'text-primary' : 'text-muted-foreground';

  return (
    <>
      <ul className="space-y-1.5 mb-2">
        {items.map((it, i) => (
          <li key={i} className="bg-card border border-border rounded-lg p-2 flex items-start gap-2">
            <span className={`shrink-0 mt-0.5 ${dotCls}`}>→</span>
            <span className="flex-1 text-[11px] text-foreground leading-snug">{it}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-muted-foreground active:scale-95 shrink-0"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Adicionar gatilho..."
          className="flex-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        />
        <button
          onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}
          className="bg-primary text-primary-foreground rounded-lg px-2.5 active:scale-95"
        >
          <Plus size={14} />
        </button>
      </div>
    </>
  );
};
