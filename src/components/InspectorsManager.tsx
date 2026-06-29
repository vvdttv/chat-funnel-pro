import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, ClipboardCheck, AlertTriangle } from 'lucide-react';
import {
  useInspectorsContext, type Inspector, type InspectorInput, type InspectorType,
} from '@/hooks/useInspectors';

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

const TYPE_LABELS: Record<InspectorType, string> = {
  administrativo: 'Administrativo (interno)',
  perito_externo: 'Perito externo',
};

const InspectorForm = ({ inspector, onSave, onCancel }: {
  inspector?: Inspector;
  onSave: (input: InspectorInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(inspector?.name ?? '');
  const [email, setEmail] = useState(inspector?.email ?? '');
  const [phone, setPhone] = useState(inspector?.phoneE164 ?? '');
  const [userId, setUserId] = useState(inspector?.userId ?? '');
  const [insType, setInsType] = useState<InspectorType>(inspector?.inspectorType ?? 'administrativo');
  const [pct, setPct] = useState<number>(inspector?.distributionPct ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || null,
        phoneE164: phone.trim() || null,
        userId: userId.trim() || null,
        inspectorType: insType,
        distributionPct: Math.max(0, Math.min(100, pct)),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{inspector ? 'Editar Vistoriador' : 'Novo Vistoriador'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Nome do vistoriador</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Joao Silva" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Tipo</label>
            <select value={insType} onChange={e => setInsType(e.target.value as InspectorType)} className={inputCls}>
              {(Object.keys(TYPE_LABELS) as InspectorType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>% distribuicao (roleta)</label>
            <input type="number" min={0} max={100} value={pct}
              onChange={e => setPct(Number(e.target.value))} className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>E-mail</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" className={`${inputCls} text-xs`} />
          </div>
          <div>
            <label className={labelCls}>WhatsApp (E.164)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511999999999" className={`${inputCls} font-mono text-xs`} />
          </div>
        </div>
        <div>
          <label className={labelCls}>User ID do login (opcional)</label>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="uuid do usuario com role vistoriador" className={`${inputCls} font-mono text-[11px]`} />
          <p className="text-[10px] text-muted-foreground mt-1">Vincule ao usuario para que ele veja so as vistorias atribuidas a ele.</p>
        </div>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {inspector ? 'Salvar' : 'Criar Vistoriador'}
        </button>
      </div>
    </div>
  );
};

const InspectorsManager = () => {
  const { inspectors, loading, addInspector, updateInspector, deleteInspector } = useInspectorsContext();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pctSum = inspectors.filter(i => i.isActive && i.distributionPct > 0).reduce((s, i) => s + i.distributionPct, 0);

  const handleDelete = async (i: Inspector) => {
    if (!confirm(`Excluir o vistoriador "${i.name}"?`)) return;
    await deleteInspector(i.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando vistoriadores...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        Vistoriadores podem ser administrativos (internos) ou peritos externos. A roleta distribui vistorias entre os que tem % {'>'} 0. Quem fica com 0% recebe so por atribuicao manual (fila). Configure os modos em Configuracoes - Vistoria.
      </div>

      {inspectors.length > 0 && pctSum > 0 && pctSum !== 100 && (
        <div className="flex items-center gap-2 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-lg p-2.5 mb-3">
          <AlertTriangle size={14} className="shrink-0" />
          Soma dos % dos vistoriadores ativos com roleta: {pctSum}% (ideal: 100%). Funciona proporcionalmente, mas convem ajustar.
        </div>
      )}

      {creating && <InspectorForm onSave={async (i) => { await addInspector(i); setCreating(false); }} onCancel={() => setCreating(false)} />}
      {editingId && (
        <InspectorForm
          inspector={inspectors.find(i => i.id === editingId)}
          onSave={async (i) => { await updateInspector(editingId, i); setEditingId(null); }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {!creating && !editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{inspectors.length} vistoriador(es)</span>
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95">
            <Plus size={14} /> Novo Vistoriador
          </button>
        </div>
      )}

      {inspectors.length === 0 && !creating
        ? <p className="text-xs text-muted-foreground text-center py-6">Nenhum vistoriador cadastrado</p>
        : inspectors.map(i => (
            <div key={i.id} className="bg-card rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <ClipboardCheck size={15} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {TYPE_LABELS[i.inspectorType]} - {i.distributionPct}%{i.userId ? ' - vinculado' : ' - sem login'}{i.phoneE164 ? ` - ${i.phoneE164}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateInspector(i.id, { isActive: !i.isActive })}
                    className={`p-1.5 active:scale-95 ${i.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {i.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => { setEditingId(i.id); setCreating(false); }} className="p-2 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(i)} className="p-2 text-destructive active:scale-95"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
    </div>
  );
};

export default InspectorsManager;