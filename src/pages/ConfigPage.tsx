import { useState } from 'react';
import { properties, funnels as initialFunnels, waNumbers, aiFlows, formatCurrency, Property, AIFlow, Funnel, FunnelStage, Touchpoint, customFields as initialFields, CustomField, FieldType, FieldObject, FIELD_TYPE_LABELS, FIELD_OBJECT_LABELS } from '@/data/mockData';
import { Building2, Smartphone, Bot, Plus, Copy, ExternalLink, ChevronRight, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Pencil, Trash2, GripVertical, X, User, Zap, Phone, Mail, MessageSquare, Clock, Database, Lock, Check, List } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SettingsTab = 'funis' | 'imoveis' | 'numeros' | 'fluxos' | 'campos';

const tabs: { id: SettingsTab; label: string; icon: typeof Building2 }[] = [
  { id: 'funis', label: 'Funis', icon: Zap },
  { id: 'campos', label: 'Campos', icon: Database },
  { id: 'imoveis', label: 'Imóveis', icon: Building2 },
  { id: 'numeros', label: 'Números WA', icon: Smartphone },
  { id: 'fluxos', label: 'Fluxos IA', icon: Bot },
];

const CHANNEL_OPTIONS: { value: Touchpoint['channel']; label: string; icon: typeof Phone }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'ligação', label: 'Ligação', icon: Phone },
  { value: 'sms', label: 'SMS', icon: MessageSquare },
];

// ========== TOUCHPOINT EDITOR ==========

const TouchpointCard = ({ tp, onUpdate, onDelete }: { tp: Touchpoint; onUpdate: (tp: Touchpoint) => void; onDelete: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tp);

  const ChannelIcon = CHANNEL_OPTIONS.find(c => c.value === tp.channel)?.icon || MessageSquare;

  if (editing) {
    return (
      <div className="bg-secondary rounded-xl p-3 mb-2 border border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-foreground">Editar Ponto de Contato</span>
          <button onClick={() => setEditing(false)} className="text-muted-foreground active:scale-95"><X size={14} /></button>
        </div>
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <button
              onClick={() => setDraft(d => ({ ...d, type: 'agent' }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                draft.type === 'agent' ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-card text-muted-foreground'
              }`}
            >
              <User size={12} className="inline mr-1" /> Corretor
            </button>
            <button
              onClick={() => setDraft(d => ({ ...d, type: 'ai' }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                draft.type === 'ai' ? 'bg-[hsl(270,40%,25%)]/50 text-[hsl(270,60%,70%)] border border-[hsl(270,40%,35%)]' : 'bg-card text-muted-foreground'
              }`}
            >
              <Bot size={12} className="inline mr-1" /> IA
            </button>
          </div>
          <input
            value={draft.action}
            onChange={e => setDraft(d => ({ ...d, action: e.target.value }))}
            placeholder="Ação (ex: Enviar proposta)"
            className="w-full bg-card rounded-lg px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground border border-border focus:border-primary/50"
          />
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="Descrição da ação"
            className="w-full bg-card rounded-lg px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground border border-border focus:border-primary/50"
          />
          <div className="flex gap-2">
            <Select value={draft.channel} onValueChange={(v) => setDraft(d => ({ ...d, channel: v as Touchpoint['channel'] }))}>
              <SelectTrigger className="flex-1 h-8 text-xs bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map(ch => (
                  <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-2">
              <Clock size={12} className="text-muted-foreground" />
              <input
                type="number"
                min={0}
                value={draft.delayHours}
                onChange={e => setDraft(d => ({ ...d, delayHours: Number(e.target.value) }))}
                className="w-12 bg-transparent text-sm text-foreground outline-none text-center"
              />
              <span className="text-[10px] text-muted-foreground">h</span>
            </div>
          </div>
          <button
            onClick={() => { onUpdate(draft); setEditing(false); }}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.98] transition-transform"
          >
            Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-secondary rounded-xl p-3 mb-2 active:scale-[0.98] transition-transform">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
        tp.type === 'ai' ? 'bg-[hsl(270,40%,25%)]/50 text-[hsl(270,60%,70%)]' : 'bg-primary/15 text-primary'
      }`}>
        {tp.type === 'ai' ? <Bot size={14} /> : <User size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{tp.action}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <ChannelIcon size={10} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{tp.channel}</span>
          {tp.delayHours > 0 && (
            <span className="text-[10px] text-muted-foreground">· após {tp.delayHours}h</span>
          )}
        </div>
      </div>
      <button onClick={() => setEditing(true)} className="p-2.5 -m-1 text-muted-foreground active:scale-95"><Pencil size={16} /></button>
      <button onClick={onDelete} className="p-2.5 -m-1 text-destructive active:scale-95"><Trash2 size={16} /></button>
    </div>
  );
};

// ========== STAGE EDITOR ==========

const StageEditor = ({ stage, onUpdate, onDelete }: { stage: FunnelStage; onUpdate: (s: FunnelStage) => void; onDelete: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(stage.name);

  const addTouchpoint = () => {
    const newTp: Touchpoint = {
      id: `tp-${Date.now()}`,
      type: 'agent',
      action: '',
      description: '',
      delayHours: 0,
      channel: 'whatsapp',
    };
    onUpdate({ ...stage, touchpoints: [...stage.touchpoints, newTp] });
  };

  const updateTouchpoint = (idx: number, tp: Touchpoint) => {
    const tps = [...stage.touchpoints];
    tps[idx] = tp;
    onUpdate({ ...stage, touchpoints: tps });
  };

  const deleteTouchpoint = (idx: number) => {
    onUpdate({ ...stage, touchpoints: stage.touchpoints.filter((_, i) => i !== idx) });
  };

  return (
    <div className="bg-card rounded-xl mb-2 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <GripVertical size={16} className="text-muted-foreground shrink-0" />
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={() => { onUpdate({ ...stage, name: draftName }); setEditingName(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onUpdate({ ...stage, name: draftName }); setEditingName(false); } }}
            className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none border-b border-primary/50"
          />
        ) : (
          <button onClick={() => setEditingName(true)} className="flex-1 text-left text-sm font-semibold text-foreground truncate">
            {stage.name}
          </button>
        )}
        <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium shrink-0">{stage.probability}%</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{stage.touchpoints.length} pts</span>
        <button onClick={() => setExpanded(v => !v)} className="p-2.5 -m-1 text-muted-foreground active:scale-95">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <button onClick={onDelete} className="p-2.5 -m-1 text-destructive active:scale-95"><Trash2 size={16} /></button>
      </div>

      {expanded && (
        <div className="px-3 pb-3">
          {/* Probability slider */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-muted-foreground">Probabilidade:</span>
            <input
              type="range" min={0} max={100} step={5}
              value={stage.probability}
              onChange={e => onUpdate({ ...stage, probability: Number(e.target.value) })}
              className="flex-1 accent-[hsl(var(--primary))]"
            />
            <span className="text-xs font-bold text-primary w-8 text-right">{stage.probability}%</span>
          </div>

          {/* Touchpoints */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fluxo de Contato</span>
            <button
              onClick={addTouchpoint}
              className="flex items-center gap-1 text-[10px] text-primary font-medium active:scale-95"
            >
              <Plus size={12} /> Adicionar
            </button>
          </div>

          {stage.touchpoints.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-3">Nenhum ponto de contato configurado</p>
          )}

          {stage.touchpoints.map((tp, i) => (
            <TouchpointCard
              key={tp.id}
              tp={tp}
              onUpdate={(updated) => updateTouchpoint(i, updated)}
              onDelete={() => deleteTouchpoint(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ========== FUNNEL EDITOR ==========

const FunnelEditor = ({ funnel, onUpdate }: { funnel: Funnel; onUpdate: (f: Funnel) => void }) => {
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftName, setDraftName] = useState(funnel.name);
  const [draftDesc, setDraftDesc] = useState(funnel.description);

  const addStage = () => {
    const newStage: FunnelStage = { name: 'Nova Etapa', probability: 50, touchpoints: [] };
    onUpdate({ ...funnel, stages: [...funnel.stages, newStage] });
  };

  const updateStage = (idx: number, stage: FunnelStage) => {
    const stages = [...funnel.stages];
    stages[idx] = stage;
    onUpdate({ ...funnel, stages });
  };

  const deleteStage = (idx: number) => {
    onUpdate({ ...funnel, stages: funnel.stages.filter((_, i) => i !== idx) });
  };

  return (
    <div className="pb-4">
      {/* Funnel Meta */}
      {editingMeta ? (
        <div className="bg-card rounded-xl p-4 mb-4">
          <input
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            placeholder="Nome do funil"
            className="w-full bg-secondary rounded-lg px-3 py-2 text-sm font-semibold text-foreground outline-none mb-2 border border-border focus:border-primary/50"
          />
          <input
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            placeholder="Descrição"
            className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none mb-3 border border-border focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onUpdate({ ...funnel, name: draftName, description: draftDesc }); setEditingMeta(false); }}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.98]"
            >
              Salvar
            </button>
            <button onClick={() => setEditingMeta(false)} className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground text-xs active:scale-[0.98]">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-foreground">{funnel.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{funnel.description}</p>
          </div>
          <button onClick={() => setEditingMeta(true)} className="p-1.5 text-muted-foreground active:scale-95"><Pencil size={14} /></button>
        </div>
      )}

      {/* Stages Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{funnel.stages.length} Etapas</span>
        <button
          onClick={addStage}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
        >
          <Plus size={14} /> Nova Etapa
        </button>
      </div>

      {/* Stages List */}
      {funnel.stages.map((stage, idx) => (
        <StageEditor
          key={`${funnel.id}-${idx}`}
          stage={stage}
          onUpdate={(s) => updateStage(idx, s)}
          onDelete={() => deleteStage(idx)}
        />
      ))}
    </div>
  );
};

// ========== EXISTING CARDS ==========

const PropertyCard = ({ property }: { property: Property }) => (
  <div className="bg-card rounded-xl p-4 mb-3 active:scale-[0.98] transition-transform">
    <div className="flex items-start justify-between mb-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-mono">{property.code}</span>
        </div>
        <p className="text-sm font-semibold text-foreground mt-1">{property.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{property.address}</p>
      </div>
      {property.tourLink && (
        <button className="p-1.5 text-primary active:scale-95 transition-transform">
          <ExternalLink size={14} />
        </button>
      )}
    </div>
    <p className="text-base font-bold text-primary">{formatCurrency(property.value)}</p>
  </div>
);

const FlowCard = ({ flow }: { flow: AIFlow }) => (
  <div className="bg-card rounded-xl p-4 mb-3">
    <div className="flex items-start justify-between mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{flow.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{flow.description}</p>
      </div>
      <div className={`p-1 ${flow.active ? 'text-primary' : 'text-muted-foreground'}`}>
        {flow.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </div>
    </div>
    <div className="flex items-center justify-between mt-3">
      <span className="text-xs text-muted-foreground">{flow.blocks} blocos</span>
      <div className="flex gap-2">
        <button className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg active:scale-95 transition-transform">
          <Copy size={12} /> Clonar
        </button>
        <button className="flex items-center gap-1 text-xs text-primary bg-primary/15 px-2 py-1 rounded-lg active:scale-95 transition-transform">
          Editar <ChevronRight size={12} />
        </button>
      </div>
    </div>
  </div>
);

// ========== FIELD TYPE ICON ==========

const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: 'Aa', textarea: '¶', number: '#', monetary: 'R$', phone: '📱', email: '@',
  date: '📅', datetime: '🕐', dropdown: '▾', multiselect: '☰', checkbox: '☑',
  radio: '◉', url: '🔗', file: '📎', signature: '✍', toggle: '⊘',
};

// ========== FIELD CARD ==========

const FieldCard = ({ field, onEdit, onDelete }: { field: CustomField; onEdit: () => void; onDelete: () => void }) => (
  <div className="flex items-center gap-3 bg-card rounded-xl p-3 mb-2">
    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-foreground shrink-0">
      {FIELD_TYPE_ICONS[field.type]}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-semibold text-foreground truncate">{field.name}</p>
        {field.system && <Lock size={10} className="text-muted-foreground shrink-0" />}
        {field.required && <span className="text-[9px] text-destructive font-bold">*</span>}
      </div>
      <p className="text-[10px] text-muted-foreground">{FIELD_TYPE_LABELS[field.type]}{field.key ? ` · ${field.key}` : ''}</p>
    </div>
    {!field.system && (
      <div className="flex items-center gap-1">
        <button onClick={onEdit} className="p-2 text-muted-foreground active:scale-95"><Pencil size={14} /></button>
        <button onClick={onDelete} className="p-2 text-destructive active:scale-95"><Trash2 size={14} /></button>
      </div>
    )}
  </div>
);

// ========== FIELD FORM (create/edit) ==========

const FieldForm = ({ field, onSave, onCancel }: { field?: CustomField; onSave: (f: CustomField) => void; onCancel: () => void }) => {
  const [name, setName] = useState(field?.name || '');
  const [key, setKey] = useState(field?.key || '');
  const [type, setType] = useState<FieldType>(field?.type || 'text');
  const [object, setObject] = useState<FieldObject>(field?.object || 'lead');
  const [required, setRequired] = useState(field?.required || false);
  const [options, setOptions] = useState(field?.options?.join('\n') || '');
  const [placeholder, setPlaceholder] = useState(field?.placeholder || '');
  const [description, setDescription] = useState(field?.description || '');

  const needsOptions = ['dropdown', 'multiselect', 'radio'].includes(type);

  const autoKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: field?.id || `cf-${Date.now()}`,
      name: name.trim(),
      key: key.trim() || autoKey(name),
      type,
      object,
      required,
      system: false,
      ...(needsOptions ? { options: options.split('\n').map(o => o.trim()).filter(Boolean) } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(description ? { description } : {}),
    });
  };

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{field ? 'Editar Campo' : 'Novo Campo'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        {/* Object */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Objeto</label>
          <div className="flex gap-1.5">
            {(['lead', 'deal', 'property'] as FieldObject[]).map(obj => (
              <button
                key={obj}
                onClick={() => setObject(obj)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                  object === obj ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {FIELD_OBJECT_LABELS[obj]}
              </button>
            ))}
          </div>
        </div>

        {/* Name + Key */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Nome</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); if (!field) setKey(autoKey(e.target.value)); }}
              placeholder="Ex: Renda Familiar"
              className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Chave</label>
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="renda_familiar"
              className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground font-mono text-xs"
            />
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Tipo do Campo</label>
          <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
            <SelectTrigger className="w-full h-9 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map(t => (
                <SelectItem key={t} value={t}>
                  <span className="mr-2">{FIELD_TYPE_ICONS[t]}</span> {FIELD_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Options for dropdown/multiselect/radio */}
        {needsOptions && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Opções (uma por linha)</label>
            <textarea
              value={options}
              onChange={e => setOptions(e.target.value)}
              rows={4}
              placeholder={"Opção 1\nOpção 2\nOpção 3"}
              className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground resize-none"
            />
          </div>
        )}

        {/* Placeholder + Description */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Placeholder</label>
            <input
              value={placeholder}
              onChange={e => setPlaceholder(e.target.value)}
              placeholder="Texto de exemplo..."
              className="w-full bg-secondary rounded-lg px-3 py-2 text-xs text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Descrição</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ajuda para o usuário"
              className="w-full bg-secondary rounded-lg px-3 py-2 text-xs text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Required toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground">Campo obrigatório</span>
          <button onClick={() => setRequired(v => !v)} className={`p-1 ${required ? 'text-primary' : 'text-muted-foreground'}`}>
            {required ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
          </button>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          {field ? 'Salvar Alterações' : 'Criar Campo'}
        </button>
      </div>
    </div>
  );
};

// ========== FIELDS MANAGER ==========

const FieldsManager = () => {
  const [fields, setFields] = useState<CustomField[]>(initialFields);
  const [activeObject, setActiveObject] = useState<FieldObject>('lead');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = fields.filter(f => f.object === activeObject);
  const systemFields = filtered.filter(f => f.system);
  const customFieldsList = filtered.filter(f => !f.system);

  const handleSave = (field: CustomField) => {
    setFields(prev => {
      const exists = prev.find(f => f.id === field.id);
      if (exists) return prev.map(f => f.id === field.id ? field : f);
      return [...prev, field];
    });
    setCreating(false);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div>
      {/* Object tabs */}
      <div className="flex gap-1.5 mb-4">
        {(['lead', 'deal', 'property'] as FieldObject[]).map(obj => (
          <button
            key={obj}
            onClick={() => { setActiveObject(obj); setCreating(false); setEditingId(null); }}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
              activeObject === obj ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {FIELD_OBJECT_LABELS[obj]}
          </button>
        ))}
      </div>

      {/* Create form */}
      {creating && (
        <FieldForm
          onSave={handleSave}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Edit form */}
      {editingId && (
        <FieldForm
          field={fields.find(f => f.id === editingId)}
          onSave={handleSave}
          onCancel={() => setEditingId(null)}
        />
      )}

      {/* Header + Add button */}
      {!creating && !editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{filtered.length} campos</span>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
          >
            <Plus size={14} /> Novo Campo
          </button>
        </div>
      )}

      {/* System fields */}
      {systemFields.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Lock size={12} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Campos do Sistema</span>
          </div>
          {systemFields.map(f => (
            <FieldCard key={f.id} field={f} onEdit={() => {}} onDelete={() => {}} />
          ))}
        </div>
      )}

      {/* Custom fields */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <List size={12} className="text-primary" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Campos Personalizados</span>
        </div>
        {customFieldsList.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhum campo personalizado criado</p>
        ) : (
          customFieldsList.map(f => (
            <FieldCard
              key={f.id}
              field={f}
              onEdit={() => setEditingId(f.id)}
              onDelete={() => handleDelete(f.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ========== MAIN PAGE ==========

const ConfigPage = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('funis');
  const [funnelsList, setFunnelsList] = useState<Funnel[]>(initialFunnels);
  const [selectedFunnelId, setSelectedFunnelId] = useState(funnelsList[0].id);

  const selectedFunnel = funnelsList.find(f => f.id === selectedFunnelId);

  const updateFunnel = (updated: Funnel) => {
    setFunnelsList(prev => prev.map(f => f.id === updated.id ? updated : f));
  };

  const addFunnel = () => {
    const newFunnel: Funnel = {
      id: `fun-${Date.now()}`,
      name: 'Novo Funil',
      description: 'Descrição do funil',
      icon: 'Zap',
      color: 'hsl(var(--primary))',
      stages: [{ name: 'Novo Lead', probability: 10, touchpoints: [] }],
    };
    setFunnelsList(prev => [...prev, newFunnel]);
    setSelectedFunnelId(newFunnel.id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">

        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors active:scale-95 transition-transform shrink-0 ${
                  activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-24">
        {activeTab === 'funis' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <Select value={selectedFunnelId} onValueChange={setSelectedFunnelId}>
                <SelectTrigger className="w-auto gap-1.5 h-9 px-3 rounded-lg bg-card border-border text-sm font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funnelsList.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={addFunnel}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
              >
                <Plus size={14} /> Novo Funil
              </button>
            </div>
            {selectedFunnel && (
              <FunnelEditor funnel={selectedFunnel} onUpdate={updateFunnel} />
            )}
          </>
        )}

        {activeTab === 'imoveis' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{properties.length} imóveis cadastrados</span>
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
                <Plus size={14} /> Novo
              </button>
            </div>
            {properties.map(p => <PropertyCard key={p.id} property={p} />)}
          </>
        )}

        {activeTab === 'numeros' && (
          <>
            {waNumbers.map(wa => (
              <div key={wa.id} className="bg-card rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{wa.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{wa.number}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    wa.type === 'official' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning'
                  }`}>
                    {wa.type === 'official' ? 'API Oficial' : 'QR Code'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {wa.agents.map(agent => (
                    <span key={agent} className="text-[10px] bg-secondary text-muted-foreground px-2 py-1 rounded-full">{agent}</span>
                  ))}
                  <button className="text-[10px] bg-primary/15 text-primary px-2 py-1 rounded-full active:scale-95 transition-transform">
                    + Vincular
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'fluxos' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{aiFlows.length} fluxos</span>
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
                <Plus size={14} /> Novo Fluxo
              </button>
            </div>
            {aiFlows.map(f => <FlowCard key={f.id} flow={f} />)}
          </>
        )}
      </div>
    </div>
  );
};

export default ConfigPage;