import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ListChecks, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  useDevolutivaFields, type DevolutivaFieldDef, type DevolutivaFieldType, type FieldInput,
} from '@/hooks/useDevolutivaFields';

const TYPE_LABELS: Record<DevolutivaFieldType, string> = {
  text: 'Texto livre',
  single_select: 'Seleção única',
  multi_select: 'Seleção múltipla',
};

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const FieldForm = ({ field, onSave, onCancel }: {
  field?: DevolutivaFieldDef;
  onSave: (input: FieldInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [label, setLabel] = useState(field?.label ?? '');
  const [fieldType, setFieldType] = useState<DevolutivaFieldType>(field?.fieldType ?? 'text');
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  const needsOptions = fieldType !== 'text';

  const handleSave = async () => {
    if (!label.trim() || saving) return;
    const options = needsOptions
      ? optionsText.split('\n').map(o => o.trim()).filter(Boolean)
      : [];
    if (needsOptions && options.length === 0) { alert('Adicione ao menos uma opção.'); return; }
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        // Mantém a key original ao editar; gera nova ao criar.
        ...(field ? {} : { fieldKey: slug(label) || `campo_${Date.now()}` }),
        fieldType,
        options,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground';

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{field ? 'Editar campo' : 'Novo campo'}</h3>
          <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={18} /></button>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Rótulo *</label>
          <input value={label} onChange={e => setLabel(e.target.value)} className={inputCls} placeholder="Ex.: Banco" />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Tipo</label>
          <select value={fieldType} onChange={e => setFieldType(e.target.value as DevolutivaFieldType)} className={inputCls}>
            {(Object.keys(TYPE_LABELS) as DevolutivaFieldType[]).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {needsOptions && (
          <div>
            <label className="text-[11px] text-muted-foreground">Opções (uma por linha)</label>
            <textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} rows={4} className={inputCls}
              placeholder={'Opção A\nOpção B\nOpção C'} />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg bg-secondary text-sm text-foreground active:scale-95">Cancelar</button>
          <button onClick={handleSave} disabled={!label.trim() || saving}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DevolutivaFieldsManager = () => {
  const { fields, loading, addField, updateField, deleteField } = useDevolutivaFields();
  const [editing, setEditing] = useState<DevolutivaFieldDef | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="bg-card border border-border rounded-xl p-3 mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
          <ListChecks size={12} /> Campos da devolutiva
        </p>
        <p className="text-[11px] text-muted-foreground">
          Campos extras que o correspondente preenche ao devolver a análise. Os padrão (MCMV) já vêm prontos; edite ou exclua à vontade.
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{fields.length} campos</span>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95">
          <Plus size={14} /> Novo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : fields.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Nenhum campo configurado.</p>
      ) : (
        fields.map(f => (
          <div key={f.id} className="bg-card border border-border rounded-xl p-3 mb-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{f.label}</span>
                {f.isDefault && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">padrão</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {TYPE_LABELS[f.fieldType]}{f.options.length > 0 ? ` · ${f.options.length} opções` : ''} · <span className="font-mono">{f.fieldKey}</span>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => updateField(f.id, { isActive: !f.isActive })} className="p-1 text-muted-foreground active:scale-95" title={f.isActive ? 'Ativo' : 'Inativo'}>
                {f.isActive ? <ToggleRight size={18} className="text-primary" /> : <ToggleLeft size={18} />}
              </button>
              <button onClick={() => setEditing(f)} className="p-1 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
              <button onClick={() => { if (confirm(`Excluir o campo "${f.label}"?`)) deleteField(f.id); }} className="p-1 text-destructive active:scale-95"><Trash2 size={15} /></button>
            </div>
          </div>
        ))
      )}

      {(creating || editing) && (
        <FieldForm
          field={editing ?? undefined}
          onSave={async (input) => {
            if (editing) await updateField(editing.id, input);
            else await addField(input);
            setCreating(false); setEditing(null);
          }}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default DevolutivaFieldsManager;
