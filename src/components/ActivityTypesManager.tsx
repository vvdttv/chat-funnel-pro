import { useState } from 'react';
import { useActivityTypes, ActivityType } from '@/hooks/useActivityTypes';
import { Phone, MapPin, FileText, MessageCircle, Calendar, Mail, Video, Users, Coffee, Briefcase, Clock, Plus, Pencil, Trash2, X, Lock, Loader2, ToggleLeft, ToggleRight, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const ICON_OPTIONS: { name: string; Icon: typeof Phone }[] = [
  { name: 'Phone', Icon: Phone },
  { name: 'MapPin', Icon: MapPin },
  { name: 'FileText', Icon: FileText },
  { name: 'MessageCircle', Icon: MessageCircle },
  { name: 'Calendar', Icon: Calendar },
  { name: 'Mail', Icon: Mail },
  { name: 'Video', Icon: Video },
  { name: 'Users', Icon: Users },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'Clock', Icon: Clock },
];

const COLOR_OPTIONS = [
  'hsl(145,63%,49%)', // green
  'hsl(210,80%,55%)', // blue
  'hsl(38,92%,50%)',  // amber
  'hsl(270,60%,65%)', // purple
  'hsl(0,84%,60%)',   // red
  'hsl(180,60%,45%)', // teal
  'hsl(330,75%,55%)', // pink
  'hsl(50,85%,50%)',  // yellow
];

export const renderActivityIcon = (name: string, props: { size?: number; className?: string } = {}) => {
  const found = ICON_OPTIONS.find(o => o.name === name);
  const Icon = found?.Icon || Phone;
  return <Icon {...props} />;
};

const ActivityTypeCard = ({ type, onEdit, onDelete, onToggleActive }: {
  type: ActivityType;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) => (
  <div className="flex items-center gap-3 bg-card rounded-xl p-3 mb-2">
    <GripVertical size={14} className="text-muted-foreground/40 shrink-0" />
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
      style={{ backgroundColor: `${type.color}20`, color: type.color }}
    >
      {renderActivityIcon(type.icon, { size: 16 })}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-semibold text-foreground truncate">{type.label}</p>
        {type.is_system && <Lock size={10} className="text-muted-foreground shrink-0" />}
        {!type.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">inativo</span>}
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">{type.code} · {type.default_duration_min}min</p>
    </div>
    <button onClick={onToggleActive} className={`p-1.5 active:scale-95 ${type.is_active ? 'text-primary' : 'text-muted-foreground'}`}>
      {type.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
    </button>
    <button onClick={onEdit} className="p-2 text-muted-foreground active:scale-95"><Pencil size={14} /></button>
    {!type.is_system && (
      <button onClick={onDelete} className="p-2 text-destructive active:scale-95"><Trash2 size={14} /></button>
    )}
  </div>
);

const ActivityTypeForm = ({ type, onSave, onCancel, saving }: {
  type?: ActivityType;
  onSave: (data: { code: string; label: string; icon: string; color: string; default_duration_min: number }) => void;
  onCancel: () => void;
  saving: boolean;
}) => {
  const [label, setLabel] = useState(type?.label || '');
  const [code, setCode] = useState(type?.code || '');
  const [icon, setIcon] = useState(type?.icon || 'Phone');
  const [color, setColor] = useState(type?.color || COLOR_OPTIONS[0]);
  const [duration, setDuration] = useState(type?.default_duration_min || 30);

  const autoCode = (n: string) =>
    n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{type ? 'Editar tipo' : 'Novo tipo de atividade'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Nome</label>
            <input
              value={label}
              onChange={e => { setLabel(e.target.value); if (!type) setCode(autoCode(e.target.value)); }}
              placeholder="Ex: Reunião comercial"
              className="w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Duração</label>
            <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg px-2">
              <input
                type="number" min={5} step={5}
                value={duration}
                onChange={e => setDuration(Math.max(5, Number(e.target.value)))}
                className="w-14 bg-transparent text-sm text-foreground outline-none text-center py-2"
              />
              <span className="text-[10px] text-muted-foreground">min</span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Código (slug)</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="reuniao_comercial"
            disabled={!!type?.is_system}
            className="w-full bg-secondary rounded-lg px-3 py-2 text-xs font-mono text-foreground outline-none border border-border focus:border-primary/50 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Ícone</label>
          <div className="grid grid-cols-6 gap-1.5">
            {ICON_OPTIONS.map(opt => {
              const active = icon === opt.name;
              const Icon = opt.Icon;
              return (
                <button
                  key={opt.name}
                  onClick={() => setIcon(opt.name)}
                  className={`aspect-square rounded-lg flex items-center justify-center border transition-colors active:scale-95 ${
                    active ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'
                  }`}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Cor</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-all active:scale-90 ${color === c ? 'border-foreground' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => onSave({ code: code.trim(), label: label.trim(), icon, color, default_duration_min: duration })}
          disabled={!label.trim() || !code.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {type ? 'Salvar alterações' : 'Criar tipo'}
        </button>
      </div>
    </div>
  );
};

export const ActivityTypesManager = () => {
  const { types, loading, createType, updateType, deleteType } = useActivityTypes();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        Apenas administradores podem gerenciar tipos de atividade.
      </div>
    );
  }

  const handleSave = async (data: { code: string; label: string; icon: string; color: string; default_duration_min: number }) => {
    setSaving(true);
    const res = editingId
      ? await updateType(editingId, data)
      : await createType(data);
    setSaving(false);
    if (res.error) {
      toast({ title: 'Erro', description: res.error, variant: 'destructive' });
    } else {
      toast({ title: editingId ? 'Tipo atualizado' : 'Tipo criado' });
      setCreating(false);
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este tipo de atividade? Atividades existentes não serão afetadas.')) return;
    const res = await deleteType(id);
    if (res.error) toast({ title: 'Erro', description: res.error, variant: 'destructive' });
  };

  const handleToggle = async (t: ActivityType) => {
    await updateType(t.id, { is_active: !t.is_active });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>;
  }

  const editingType = editingId ? types.find(t => t.id === editingId) : undefined;
  const systemTypes = types.filter(t => t.is_system);
  const customTypes = types.filter(t => !t.is_system);

  return (
    <div>
      {(creating || editingType) && (
        <ActivityTypeForm
          type={editingType}
          onSave={handleSave}
          onCancel={() => { setCreating(false); setEditingId(null); }}
          saving={saving}
        />
      )}

      {!creating && !editingType && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{types.length} tipos</span>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
          >
            <Plus size={14} /> Novo tipo
          </button>
        </div>
      )}

      {systemTypes.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Lock size={12} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipos do sistema</span>
          </div>
          {systemTypes.map(t => (
            <ActivityTypeCard
              key={t.id}
              type={t}
              onEdit={() => setEditingId(t.id)}
              onDelete={() => handleDelete(t.id)}
              onToggleActive={() => handleToggle(t)}
            />
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Plus size={12} className="text-primary" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipos personalizados</span>
        </div>
        {customTypes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhum tipo personalizado criado</p>
        ) : (
          customTypes.map(t => (
            <ActivityTypeCard
              key={t.id}
              type={t}
              onEdit={() => setEditingId(t.id)}
              onDelete={() => handleDelete(t.id)}
              onToggleActive={() => handleToggle(t)}
            />
          ))
        )}
      </div>
    </div>
  );
};
