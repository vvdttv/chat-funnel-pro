import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ListChecks, ToggleLeft, ToggleRight, User, Building2, MapPin, ShieldCheck } from 'lucide-react';
import {
  useLeaseContractsContext, type LeaseContractFieldDef, type LeaseFieldType,
  type LeaseContractSection, type LeaseFieldInput,
} from '@/hooks/useLeaseContracts';

const TYPE_LABELS: Record<LeaseFieldType, string> = {
  text: 'Texto livre',
  single_select: 'Selecao unica',
  multi_select: 'Selecao multipla',
};

const SECTION_META: Record<LeaseContractSection, { label: string; icon: typeof User; cls: string }> = {
  dados_cliente: { label: 'Dados do cliente (locatario)', icon: User, cls: 'text-primary' },
  dados_imobiliaria: { label: 'Dados da imobiliaria / locador', icon: Building2, cls: 'text-warning' },
  endereco_imovel: { label: 'Endereco do imovel', icon: MapPin, cls: 'text-[hsl(150,60%,65%)]' },
  garantia: { label: 'Garantia', icon: ShieldCheck, cls: 'text-[hsl(280,70%,70%)]' },
};

const SECTION_ORDER: LeaseContractSection[] = ['dados_cliente', 'dados_imobiliaria', 'endereco_imovel', 'garantia'];

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const FieldForm = ({ field, defaultSection, onSave, onCancel }: {
  field?: LeaseContractFieldDef;
  defaultSection?: LeaseContractSection;
  onSave: (input: LeaseFieldInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [section, setSection] = useState<LeaseContractSection>(field?.section ?? defaultSection ?? 'dados_cliente');
  const [label, setLabel] = useState(field?.label ?? '');
  const [fieldType, setFieldType] = useState<LeaseFieldType>(field?.fieldType ?? 'text');
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  const needsOptions = fieldType !== 'text';

  const handleSave = async () => {
    if (!label.trim() || saving) return;
    const options = needsOptions
      ? optionsText.split('\n').map(o => o.trim()).filter(Boolean)
      : [];
    if (needsOptions && options.length === 0) { alert('Adicione ao menos uma opcao.'); return; }
    setSaving(true);
    try {
      await onSave({
        section,
        label: label.trim(),
        ...(field ? {} : { fieldKey: slug(label) || `campo_${Date.now()}` }),
        fieldType,
        options,
      });
    } finally { setSaving(false); }
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
          <label className="text-[11px] text-muted-foreground">Secao</label>
          <select value={section} onChange={e => setSection(e.target.value as LeaseContractSection)} className={inputCls} disabled={!!field}>
            {SECTION_ORDER.map(s => <option key={s} value={s}>{SECTION_META[s].label}</option>)}
          </select>
          {field && <p className="text-[10px] text-muted-foreground mt-1">Secao nao editavel: crie um campo novo se quiser mover.</p>}
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Rotulo *</label>
          <input value={label} onChange={e => setLabel(e.target.value)} className={inputCls} placeholder="Ex.: CPF do locatario" />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Tipo</label>
          <select value={fieldType} onChange={e => setFieldType(e.target.value as LeaseFieldType)} className={inputCls}>
            {(Object.keys(TYPE_LABELS) as LeaseFieldType[]).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {needsOptions && (
          <div>
            <label className="text-[11px] text-muted-foreground">Opcoes (uma por linha)</label>
            <textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} rows={4} className={inputCls}
              placeholder={'Opcao A\nOpcao B\nOpcao C'} />
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

const LeaseContractFieldsManager = () => {
  const { fieldDefs, loading, addFieldDef, updateFieldDef, deleteFieldDef } = useLeaseContractsContext();
  const [editing, setEditing] = useState<LeaseContractFieldDef | null>(null);
  const [creatingFor, setCreatingFor] = useState<LeaseContractSection | null>(null);

  const bySection = useMemo(() => {
    const m: Record<LeaseContractSection, LeaseContractFieldDef[]> = {
      dados_cliente: [], dados_imobiliaria: [], endereco_imovel: [], garantia: [],
    };
    for (const f of fieldDefs) m[f.section].push(f);
    for (const s of SECTION_ORDER) m[s].sort((a, b) => a.position - b.position);
    return m;
  }, [fieldDefs]);

  return (
    <div>
      <div className="bg-card border border-border rounded-xl p-3 mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
          <ListChecks size={12} /> Campos do contrato de locacao
        </p>
        <p className="text-[11px] text-muted-foreground">
          Campos extras que o administrativo preenche ao gerar o contrato. Os padrao ja vem prontos; edite ou exclua a vontade. Os 4 blocos sao: dados do cliente, dados da imobiliaria/locador, endereco do imovel e garantia.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        SECTION_ORDER.map(s => {
          const list = bySection[s];
          const Meta = SECTION_META[s];
          return (
            <div key={s} className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className={`text-xs font-semibold flex items-center gap-1.5 ${Meta.cls}`}>
                  <Meta.icon size={13} /> {Meta.label} <span className="text-muted-foreground">({list.length})</span>
                </h4>
                <button onClick={() => setCreatingFor(s)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-[11px] text-foreground active:scale-95">
                  <Plus size={11} /> Adicionar
                </button>
              </div>
              {list.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3 bg-card/30 rounded-lg border border-dashed border-border">
                  Nenhum campo nesta secao
                </p>
              ) : list.map(f => (
                <div key={f.id} className="bg-card border border-border rounded-xl p-3 mb-1.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{f.label}</span>
                      {f.isDefault && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">padrao</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {TYPE_LABELS[f.fieldType]}{f.options.length > 0 ? ` - ${f.options.length} opcoes` : ''} - <span className="font-mono">{f.fieldKey}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateFieldDef(f.id, { section: f.section, label: f.label, fieldType: f.fieldType, options: f.options, isActive: !f.isActive })}
                      className="p-1 text-muted-foreground active:scale-95" title={f.isActive ? 'Ativo' : 'Inativo'}>
                      {f.isActive ? <ToggleRight size={18} className="text-primary" /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => setEditing(f)} className="p-1 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
                    <button onClick={() => { if (confirm(`Excluir o campo "${f.label}"?`)) deleteFieldDef(f.id); }} className="p-1 text-destructive active:scale-95"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}

      {(creatingFor || editing) && (
        <FieldForm
          field={editing ?? undefined}
          defaultSection={creatingFor ?? undefined}
          onSave={async (input) => {
            if (editing) await updateFieldDef(editing.id, input);
            else await addFieldDef(input);
            setCreatingFor(null); setEditing(null);
          }}
          onCancel={() => { setCreatingFor(null); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default LeaseContractFieldsManager;