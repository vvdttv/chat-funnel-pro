import { useMemo, useState } from 'react';
import {
  MessageSquare, Clock, PenLine, Mic, GitBranch, MessageCircleQuestion,
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Type, Image as ImageIcon, Video, Volume2, X,
  Sparkles, Brain, Shield, ArrowRightCircle,
} from 'lucide-react';
import type { AIWorkflow, AIWorkflowBlock, AIWorkflowBlockType, MessageType } from '@/data/mockData';
import {
  type IABehaviorRule, type StagePlaybook, type LeadBehaviorCategory,
} from '@/data/iaBehavior';
import { useIABehavior, selectBehavior, selectRule } from '@/hooks/useIABehavior';

// ========== INTENT / TONE OPTIONS ==========

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'collect_intent',          label: 'Captar intenção' },
  { value: 'collect_income',          label: 'Coletar renda (faixa)' },
  { value: 'collect_regime',          label: 'Coletar regime de trabalho' },
  { value: 'collect_fgts',            label: 'Coletar FGTS' },
  { value: 'collect_entry',           label: 'Coletar entrada' },
  { value: 'collect_composition',     label: 'Coletar composição familiar' },
  { value: 'collect_urgency',         label: 'Coletar urgência' },
  { value: 'collect_geo_preference',  label: 'Coletar preferência geográfica' },
  { value: 'send_doc_list',           label: 'Enviar lista de documentos' },
  { value: 'request_missing_doc',     label: 'Pedir documento faltante' },
  { value: 'reassure_privacy',        label: 'Tranquilizar (LGPD)' },
  { value: 'confirm_understanding',   label: 'Confirmar entendimento' },
  { value: 'summarize_audio',         label: 'Resumir áudio recebido' },
  { value: 'celebrate_approval',      label: 'Celebrar aprovação' },
  { value: 'recovery_plan',           label: 'Plano de recuperação' },
  { value: 'identity_disclosure',     label: 'Revelar identidade (sou IA)' },
  { value: 'human_handoff',           label: 'Encaminhar para humano' },
  { value: 'status_update',           label: 'Update de status' },
  { value: 'reengagement',            label: 'Reengajamento' },
  { value: 'qualification_question',  label: 'Pergunta de qualificação' },
  { value: 'custom',                  label: 'Customizado' },
];

const TONE_OPTIONS: { value: string; label: string; classes: string }[] = [
  { value: 'consultivo',  label: 'Consultivo',  classes: 'bg-primary/15 text-primary border-primary/30' },
  { value: 'objetivo',    label: 'Objetivo',    classes: 'bg-secondary text-foreground border-border' },
  { value: 'empatico',    label: 'Empático',    classes: 'bg-success/15 text-success border-success/30' },
  { value: 'urgente',     label: 'Urgente',     classes: 'bg-warning/15 text-warning border-warning/30' },
  { value: 'educativo',   label: 'Educativo',   classes: 'bg-[hsl(200,40%,25%)]/50 text-[hsl(200,60%,75%)] border-[hsl(200,40%,40%)]' },
  { value: 'acolhedor',   label: 'Acolhedor',   classes: 'bg-[hsl(330,40%,25%)]/50 text-[hsl(330,60%,75%)] border-[hsl(330,40%,40%)]' },
  { value: 'firme',       label: 'Firme',       classes: 'bg-destructive/15 text-destructive border-destructive/30' },
];

const CATEGORY_DOT: Record<LeadBehaviorCategory, string> = {
  positive:  'bg-success',
  neutral:   'bg-muted-foreground',
  evasive:   'bg-warning',
  negative:  'bg-destructive',
  objection: 'bg-[hsl(270,60%,65%)]',
};

// ========== BLOCK META ==========

interface BlockMeta {
  type: AIWorkflowBlockType;
  label: string;
  icon: typeof MessageSquare;
  color: string;
  bg: string;
  defaultConfig: Record<string, any>;
  summary: (cfg: Record<string, any>) => string;
}

const MSG_ICONS: Record<MessageType, typeof Type> = {
  text: Type,
  image: ImageIcon,
  audio: Volume2,
  video: Video,
};

const BLOCK_META: Record<AIWorkflowBlockType, BlockMeta> = {
  send_message: {
    type: 'send_message',
    label: 'Enviar mensagem',
    icon: MessageSquare,
    color: 'text-primary',
    bg: 'bg-primary/15',
    defaultConfig: { messageType: 'text' as MessageType, content: '' },
    summary: cfg => `${cfg.messageType?.toUpperCase() || 'TEXTO'} · ${cfg.content ? cfg.content.slice(0, 30) + (cfg.content.length > 30 ? '…' : '') : 'sem conteúdo'}`,
  },
  wait: {
    type: 'wait',
    label: 'Aguardar',
    icon: Clock,
    color: 'text-warning',
    bg: 'bg-warning/15',
    defaultConfig: { duration: 30, unit: 'seconds' as 'seconds' | 'minutes' | 'hours' },
    summary: cfg => `${cfg.duration || 0} ${cfg.unit === 'hours' ? 'h' : cfg.unit === 'minutes' ? 'min' : 's'}`,
  },
  typing: {
    type: 'typing',
    label: 'Mostrar "digitando…"',
    icon: PenLine,
    color: 'text-[hsl(270,60%,70%)]',
    bg: 'bg-[hsl(270,40%,25%)]/50',
    defaultConfig: { enabled: true, durationSeconds: 3 },
    summary: cfg => `${cfg.enabled ? 'On' : 'Off'} · ${cfg.durationSeconds || 0}s`,
  },
  recording: {
    type: 'recording',
    label: 'Mostrar "gravando áudio…"',
    icon: Mic,
    color: 'text-[hsl(330,60%,65%)]',
    bg: 'bg-[hsl(330,40%,25%)]/50',
    defaultConfig: { enabled: true, durationSeconds: 4 },
    summary: cfg => `${cfg.enabled ? 'On' : 'Off'} · ${cfg.durationSeconds || 0}s`,
  },
  condition: {
    type: 'condition',
    label: 'Condição',
    icon: GitBranch,
    color: 'text-foreground',
    bg: 'bg-secondary',
    defaultConfig: { expression: '' },
    summary: cfg => cfg.expression ? cfg.expression.slice(0, 40) : 'sem condição',
  },
  wait_reply: {
    type: 'wait_reply',
    label: 'Aguardar resposta do lead',
    icon: MessageCircleQuestion,
    color: 'text-primary',
    bg: 'bg-primary/15',
    defaultConfig: { timeoutMinutes: 60 },
    summary: cfg => `timeout ${cfg.timeoutMinutes || 0} min`,
  },
};

const BLOCK_TYPES: AIWorkflowBlockType[] = ['send_message', 'wait', 'typing', 'recording', 'condition', 'wait_reply'];

// ========== BLOCK EDITOR (config técnica) ==========

const BlockEditor = ({ block, onChange }: { block: AIWorkflowBlock; onChange: (b: AIWorkflowBlock) => void }) => {
  const setCfg = (patch: Record<string, any>) => onChange({ ...block, config: { ...block.config, ...patch } });

  if (block.type === 'send_message') {
    const msgType: MessageType = block.config.messageType || 'text';
    return (
      <div className="space-y-2">
        <div className="flex gap-1.5">
          {(['text', 'image', 'audio', 'video'] as MessageType[]).map(t => {
            const Icon = MSG_ICONS[t];
            const active = msgType === t;
            return (
              <button
                key={t}
                onClick={() => setCfg({ messageType: t })}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium active:scale-[0.98] ${
                  active ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-card text-muted-foreground border border-border'
                }`}
              >
                <Icon size={11} /> {t}
              </button>
            );
          })}
        </div>
        <textarea
          value={block.config.content || ''}
          onChange={e => setCfg({ content: e.target.value })}
          placeholder={msgType === 'text' ? 'Conteúdo da mensagem…' : `URL ou identificador do ${msgType}`}
          rows={2}
          className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground resize-none"
        />
      </div>
    );
  }

  if (block.type === 'wait') {
    return (
      <div className="flex gap-1.5">
        <input
          type="number"
          min={1}
          value={block.config.duration || 0}
          onChange={e => setCfg({ duration: Math.max(1, Number(e.target.value) || 1) })}
          className="flex-1 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        />
        <select
          value={block.config.unit || 'seconds'}
          onChange={e => setCfg({ unit: e.target.value })}
          className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        >
          <option value="seconds">segundos</option>
          <option value="minutes">minutos</option>
          <option value="hours">horas</option>
        </select>
      </div>
    );
  }

  if (block.type === 'typing' || block.type === 'recording') {
    return (
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={block.config.enabled !== false}
            onChange={e => setCfg({ enabled: e.target.checked })}
            className="accent-primary"
          />
          Ativar
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <input
            type="number"
            min={1}
            value={block.config.durationSeconds || 0}
            onChange={e => setCfg({ durationSeconds: Math.max(1, Number(e.target.value) || 1) })}
            className="w-14 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground text-center outline-none focus:border-primary/50"
          />
          <span className="text-[10px] text-muted-foreground">s</span>
        </div>
      </div>
    );
  }

  if (block.type === 'condition') {
    return (
      <input
        value={block.config.expression || ''}
        onChange={e => setCfg({ expression: e.target.value })}
        placeholder="Ex: lead respondeu 'sim'"
        className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
      />
    );
  }

  if (block.type === 'wait_reply') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Timeout:</span>
        <input
          type="number"
          min={1}
          value={block.config.timeoutMinutes || 0}
          onChange={e => setCfg({ timeoutMinutes: Math.max(1, Number(e.target.value) || 1) })}
          className="w-16 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground text-center outline-none focus:border-primary/50"
        />
        <span className="text-[10px] text-muted-foreground">min</span>
      </div>
    );
  }

  return null;
};

// ========== BLOCK BEHAVIOR EDITOR (Fase 3) ==========

interface BehaviorEditorProps {
  block: AIWorkflowBlock;
  onChange: (b: AIWorkflowBlock) => void;
  /** Opcional: se vier, filtra LBs/regras pelo escopo da etapa */
  stagePlaybookCode?: StagePlaybook['stageCode'];
  /** Outros blocos do mesmo workflow para o seletor de fallback */
  siblingBlocks: AIWorkflowBlock[];
}

const BlockBehaviorEditor = ({ block, onChange, stagePlaybookCode, siblingBlocks }: BehaviorEditorProps) => {
  const [behaviorPickerOpen, setBehaviorPickerOpen] = useState(false);
  const [guardrailPickerOpen, setGuardrailPickerOpen] = useState(false);
  const [behaviorSearch, setBehaviorSearch] = useState('');
  const [guardrailSearch, setGuardrailSearch] = useState('');

  const { rules, behaviors } = useIABehavior();
  const universalRules = useMemo(() => rules.filter(r => r.scope === 'universal'), [rules]);
  const stageRules = useMemo(() => rules.filter(r => r.scope !== 'universal'), [rules]);

  const reactsToBehaviorIds = block.reactsToBehaviorIds ?? [];
  const guardrailRuleIds = block.guardrailRuleIds ?? [];

  // LBs candidatos: prioriza os típicos da etapa atual, mas mostra todos com filtro de busca
  const candidateBehaviors = useMemo(() => {
    const list = behaviors.filter(b => {
      if (stagePlaybookCode) {
        const inStage = b.typicalStages.includes('*') || b.typicalStages.includes(stagePlaybookCode);
        if (!inStage && !behaviorSearch) return false;
      }
      if (behaviorSearch) {
        const q = behaviorSearch.toLowerCase();
        return b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
      }
      return true;
    });
    return list.slice(0, 50);
  }, [stagePlaybookCode, behaviorSearch, behaviors]);

  // Regras de guardrail: DONT + NOASK (universais sempre + específicas da etapa)
  const candidateGuardrails = useMemo(() => {
    const universals = universalRules.filter(r => r.kind === 'dont' || r.kind === 'noask');
    const stageSpecific = stagePlaybookCode
      ? stageRules.filter(r => (r.kind === 'dont' || r.kind === 'noask') && r.scope === stagePlaybookCode)
      : [];
    const merged: IABehaviorRule[] = [...stageSpecific, ...universals];
    if (!guardrailSearch) return merged.slice(0, 50);
    const q = guardrailSearch.toLowerCase();
    return merged.filter(r => r.text.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)).slice(0, 50);
  }, [stagePlaybookCode, guardrailSearch, universalRules, stageRules]);

  const toggleBehavior = (id: string) => {
    const has = reactsToBehaviorIds.includes(id);
    onChange({
      ...block,
      reactsToBehaviorIds: has
        ? reactsToBehaviorIds.filter(x => x !== id)
        : [...reactsToBehaviorIds, id],
    });
  };

  const toggleGuardrail = (id: string) => {
    const has = guardrailRuleIds.includes(id);
    onChange({
      ...block,
      guardrailRuleIds: has
        ? guardrailRuleIds.filter(x => x !== id)
        : [...guardrailRuleIds, id],
    });
  };

  return (
    <div className="space-y-3 mt-2 pt-2 border-t border-border">
      <div className="flex items-center gap-1.5">
        <Sparkles size={11} className="text-primary" />
        <span className="text-[10px] uppercase tracking-wide font-semibold text-primary">
          Comportamento
        </span>
      </div>

      {/* Intent + Tom */}
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1 block">Intenção</label>
          <select
            value={block.intent ?? ''}
            onChange={e => onChange({ ...block, intent: e.target.value || undefined })}
            className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/50"
          >
            <option value="">— sem intenção —</option>
            {INTENT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1 block">Tom</label>
          <div className="flex gap-1 flex-wrap">
            {TONE_OPTIONS.map(t => {
              const active = block.tone === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => onChange({ ...block, tone: active ? undefined : t.value })}
                  className={`px-1.5 py-1 rounded-md text-[9px] font-medium border active:scale-95 ${
                    active ? t.classes : 'bg-card text-muted-foreground border-border'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reage a comportamentos */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <Brain size={10} className="text-muted-foreground" />
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
              Dispara quando o lead apresentar
            </span>
          </div>
          <button
            onClick={() => setBehaviorPickerOpen(v => !v)}
            className="text-[10px] text-primary font-medium active:scale-95 flex items-center gap-0.5"
          >
            {behaviorPickerOpen ? 'Fechar' : <><Plus size={10} /> Adicionar</>}
          </button>
        </div>

        {reactsToBehaviorIds.length === 0 && !behaviorPickerOpen && (
          <p className="text-[10px] text-muted-foreground italic">
            Nenhum — bloco roda como passo padrão da etapa.
          </p>
        )}

        <div className="flex flex-wrap gap-1">
          {reactsToBehaviorIds.map(id => {
            const lb = selectBehavior(behaviors, id);
            if (!lb) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 bg-card border border-primary/30 rounded-md px-1.5 py-0.5 text-[10px] text-foreground"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[lb.category]}`} />
                <span className="font-mono text-[9px] text-muted-foreground">{lb.id}</span>
                <span className="truncate max-w-[140px]">{lb.label}</span>
                <button
                  onClick={() => toggleBehavior(id)}
                  className="text-muted-foreground active:scale-95 ml-0.5"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>

        {behaviorPickerOpen && (
          <div className="mt-2 bg-secondary/60 rounded-lg p-2 border border-border">
            <input
              value={behaviorSearch}
              onChange={e => setBehaviorSearch(e.target.value)}
              placeholder={stagePlaybookCode
                ? `Buscar (mostrando típicos de ${stagePlaybookCode})…`
                : 'Buscar comportamento…'}
              className="w-full bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50 mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {candidateBehaviors.map(lb => {
                const active = reactsToBehaviorIds.includes(lb.id);
                return (
                  <button
                    key={lb.id}
                    onClick={() => toggleBehavior(lb.id)}
                    className={`w-full text-left flex items-center gap-1.5 p-1.5 rounded-md transition-colors active:scale-[0.99] ${
                      active ? 'bg-primary/15 border border-primary/30' : 'bg-card border border-transparent'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_DOT[lb.category]}`} />
                    <span className="font-mono text-[9px] text-muted-foreground shrink-0">{lb.id}</span>
                    <span className="text-[11px] text-foreground truncate">{lb.label}</span>
                    {active && <span className="ml-auto text-[10px] text-primary shrink-0">✓</span>}
                  </button>
                );
              })}
              {candidateBehaviors.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">Nada encontrado.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Guardrails */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <Shield size={10} className="text-muted-foreground" />
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
              Regras de proteção reforçadas
            </span>
          </div>
          <button
            onClick={() => setGuardrailPickerOpen(v => !v)}
            className="text-[10px] text-primary font-medium active:scale-95 flex items-center gap-0.5"
          >
            {guardrailPickerOpen ? 'Fechar' : <><Plus size={10} /> Adicionar</>}
          </button>
        </div>

        {guardrailRuleIds.length === 0 && !guardrailPickerOpen && (
          <p className="text-[10px] text-muted-foreground italic">
            Nenhum reforço extra — as regras universais já estão sempre ativas.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {guardrailRuleIds.map(id => {
            const r = selectRule(rules, id);
            if (!r) return null;
            const isDont = r.kind === 'dont';
            return (
              <div
                key={id}
                className={`flex items-start gap-1.5 rounded-md px-1.5 py-1 border text-[10px] ${
                  isDont
                    ? 'bg-destructive/10 border-destructive/30 text-foreground'
                    : 'bg-warning/10 border-warning/30 text-foreground'
                }`}
              >
                <span className={`font-mono text-[9px] shrink-0 ${isDont ? 'text-destructive' : 'text-warning'}`}>
                  {r.id}
                </span>
                <span className="flex-1 leading-snug">{r.text}</span>
                <button
                  onClick={() => toggleGuardrail(id)}
                  className="text-muted-foreground active:scale-95 shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {guardrailPickerOpen && (
          <div className="mt-2 bg-secondary/60 rounded-lg p-2 border border-border">
            <input
              value={guardrailSearch}
              onChange={e => setGuardrailSearch(e.target.value)}
              placeholder="Buscar regra (não fazer / não perguntar)…"
              className="w-full bg-card border border-border rounded-md px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50 mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {candidateGuardrails.map(r => {
                const active = guardrailRuleIds.includes(r.id);
                const isDont = r.kind === 'dont';
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleGuardrail(r.id)}
                    className={`w-full text-left flex items-start gap-1.5 p-1.5 rounded-md active:scale-[0.99] ${
                      active ? 'bg-primary/15 border border-primary/30' : 'bg-card border border-transparent'
                    }`}
                  >
                    <span className={`font-mono text-[9px] shrink-0 mt-0.5 ${isDont ? 'text-destructive' : 'text-warning'}`}>
                      {r.id}
                    </span>
                    <span className="text-[11px] text-foreground leading-snug flex-1">{r.text}</span>
                    {active && <span className="text-[10px] text-primary shrink-0">✓</span>}
                  </button>
                );
              })}
              {candidateGuardrails.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">Nada encontrado.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resposta de reserva (fallback) */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <ArrowRightCircle size={10} className="text-muted-foreground" />
          <label className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
            Bloco de resposta de reserva
          </label>
        </div>
        <select
          value={block.fallbackBlockId ?? ''}
          onChange={e => onChange({ ...block, fallbackBlockId: e.target.value || undefined })}
          className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/50"
        >
          <option value="">— sem resposta de reserva —</option>
          {siblingBlocks
            .filter(b => b.id !== block.id)
            .map(b => {
              const meta = BLOCK_META[b.type];
              return (
                <option key={b.id} value={b.id}>
                  {meta.label} · {meta.summary(b.config).slice(0, 30)}
                </option>
              );
            })}
        </select>
      </div>
    </div>
  );
};

// ========== BLOCK CARD ==========

const BlockCard = ({
  block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
  stagePlaybookCode, siblingBlocks,
}: {
  block: AIWorkflowBlock;
  onChange: (b: AIWorkflowBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  stagePlaybookCode?: StagePlaybook['stageCode'];
  siblingBlocks: AIWorkflowBlock[];
}) => {
  const [open, setOpen] = useState(false);
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;

  // Badges-resumo do comportamento mostrados no header colapsado
  const intentLabel = block.intent ? INTENT_OPTIONS.find(o => o.value === block.intent)?.label : undefined;
  const toneOpt = block.tone ? TONE_OPTIONS.find(t => t.value === block.tone) : undefined;
  const reactCount = block.reactsToBehaviorIds?.length ?? 0;
  const guardCount = block.guardrailRuleIds?.length ?? 0;

  const hasBehaviorMeta = !!(intentLabel || toneOpt || reactCount || guardCount);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{meta.label}</p>
          <p className="text-[10px] text-muted-foreground truncate">{meta.summary(block.config)}</p>
        </div>
        <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1.5 text-muted-foreground active:scale-95 disabled:opacity-30"><ChevronUp size={14} /></button>
        <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1.5 text-muted-foreground active:scale-95 disabled:opacity-30"><ChevronDown size={14} /></button>
        <button onClick={() => setOpen(v => !v)} className="p-1.5 text-muted-foreground active:scale-95"><Pencil size={13} /></button>
        <button onClick={onDelete} className="p-1.5 text-destructive active:scale-95"><Trash2 size={13} /></button>
      </div>

      {hasBehaviorMeta && !open && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-2">
          {intentLabel && (
            <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">
              {intentLabel}
            </span>
          )}
          {toneOpt && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${toneOpt.classes}`}>
              {toneOpt.label}
            </span>
          )}
          {reactCount > 0 && (
            <span className="text-[9px] bg-secondary text-muted-foreground border border-border px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
              <Brain size={9} /> {reactCount}
            </span>
          )}
          {guardCount > 0 && (
            <span className="text-[9px] bg-secondary text-muted-foreground border border-border px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
              <Shield size={9} /> {guardCount}
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-border">
          <BlockEditor block={block} onChange={onChange} />
          <BlockBehaviorEditor
            block={block}
            onChange={onChange}
            stagePlaybookCode={stagePlaybookCode}
            siblingBlocks={siblingBlocks}
          />
        </div>
      )}
    </div>
  );
};

// ========== ADD BLOCK MENU ==========

const AddBlockMenu = ({ onAdd }: { onAdd: (type: AIWorkflowBlockType) => void }) => {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-medium active:scale-95"
      >
        <Plus size={12} /> Adicionar bloco
      </button>
    );
  }
  return (
    <div className="bg-card rounded-xl border border-border p-2">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Escolher bloco</span>
        <button onClick={() => setOpen(false)} className="text-muted-foreground active:scale-95"><X size={12} /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {BLOCK_TYPES.map(t => {
          const m = BLOCK_META[t];
          const Icon = m.icon;
          return (
            <button
              key={t}
              onClick={() => { onAdd(t); setOpen(false); }}
              className="flex items-center gap-1.5 p-2 rounded-lg bg-secondary text-left active:scale-[0.98]"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${m.bg} ${m.color}`}>
                <Icon size={12} />
              </div>
              <span className="text-[10px] font-medium text-foreground truncate">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ========== MAIN BUILDER ==========

interface AIWorkflowBuilderProps {
  workflow: AIWorkflow;
  onChange: (wf: AIWorkflow) => void;
  /** Opcional: código do playbook da etapa (E0..E4b) para escopar sugestões */
  stagePlaybookCode?: StagePlaybook['stageCode'];
}

export const AIWorkflowBuilder = ({ workflow, onChange, stagePlaybookCode }: AIWorkflowBuilderProps) => {
  const addBlock = (type: AIWorkflowBlockType) => {
    const newBlock: AIWorkflowBlock = {
      id: `blk-${Date.now()}`,
      type,
      config: { ...BLOCK_META[type].defaultConfig },
    };
    onChange({ ...workflow, blocks: [...workflow.blocks, newBlock] });
  };

  const updateBlock = (idx: number, b: AIWorkflowBlock) => {
    const blocks = [...workflow.blocks];
    blocks[idx] = b;
    onChange({ ...workflow, blocks });
  };

  const deleteBlock = (idx: number) => {
    onChange({ ...workflow, blocks: workflow.blocks.filter((_, i) => i !== idx) });
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= workflow.blocks.length) return;
    const blocks = [...workflow.blocks];
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    onChange({ ...workflow, blocks });
  };

  return (
    <div>
      {/* Header global */}
      <div className="bg-card rounded-xl p-3 mb-3 border border-border space-y-2">
        {stagePlaybookCode && (
          <div className="flex items-center gap-1.5 pb-2 border-b border-border">
            <Sparkles size={12} className="text-primary" />
            <span className="text-[10px] text-muted-foreground">
              Etapa vinculada ao playbook
            </span>
            <span className="text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded">
              {stagePlaybookCode}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground">Mostrar status de digitação ao lead</span>
          <input
            type="checkbox"
            checked={workflow.showTypingIndicator !== false}
            onChange={e => onChange({ ...workflow, showTypingIndicator: e.target.checked })}
            className="accent-primary w-4 h-4"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground">Tempo máx. de resposta da IA</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={workflow.maxResponseSeconds || 30}
              onChange={e => onChange({ ...workflow, maxResponseSeconds: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground text-center outline-none focus:border-primary/50"
            />
            <span className="text-[10px] text-muted-foreground">s</span>
          </div>
        </div>
      </div>

      {/* Workflow vertical */}
      {workflow.blocks.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-4">Nenhum bloco no fluxo. Adicione abaixo.</p>
      )}

      <div className="flex flex-col gap-0">
        {workflow.blocks.map((b, i) => (
          <div key={b.id} className="flex flex-col items-stretch">
            <BlockCard
              block={b}
              onChange={(updated) => updateBlock(i, updated)}
              onDelete={() => deleteBlock(i)}
              onMoveUp={() => moveBlock(i, -1)}
              onMoveDown={() => moveBlock(i, 1)}
              canMoveUp={i > 0}
              canMoveDown={i < workflow.blocks.length - 1}
              stagePlaybookCode={stagePlaybookCode}
              siblingBlocks={workflow.blocks}
            />
            {i < workflow.blocks.length - 1 && (
              <div className="flex justify-center py-1">
                <div className="w-px h-3 bg-border" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <AddBlockMenu onAdd={addBlock} />
      </div>
    </div>
  );
};

export default AIWorkflowBuilder;
