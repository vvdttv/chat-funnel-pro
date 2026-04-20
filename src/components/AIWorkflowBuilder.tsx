import { useState } from 'react';
import {
  MessageSquare, Clock, PenLine, Mic, GitBranch, MessageCircleQuestion,
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Type, Image as ImageIcon, Video, Volume2, X,
} from 'lucide-react';
import type { AIWorkflow, AIWorkflowBlock, AIWorkflowBlockType, MessageType } from '@/data/mockData';

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

// ========== BLOCK EDITOR ==========

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

// ========== BLOCK CARD ==========

const BlockCard = ({ block, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  block: AIWorkflowBlock;
  onChange: (b: AIWorkflowBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;
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
      {open && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-border">
          <BlockEditor block={block} onChange={onChange} />
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
}

export const AIWorkflowBuilder = ({ workflow, onChange }: AIWorkflowBuilderProps) => {
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
