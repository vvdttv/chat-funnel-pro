import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, Star, Smartphone } from 'lucide-react';
import { usePersonasContext } from '@/hooks/usePersonas';
import { useWhatsappNumbersContext, type WhatsappNumber, type WhatsappNumberInput } from '@/hooks/useWhatsappNumbers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ========== FORM ==========

const NumberForm = ({ number, onSave, onCancel }: {
  number?: WhatsappNumber;
  onSave: (input: WhatsappNumberInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const { personas } = usePersonasContext();
  const [label, setLabel] = useState(number?.label ?? '');
  const [phoneE164, setPhoneE164] = useState(number?.phoneE164 ?? '');
  const [provider, setProvider] = useState<'waha' | 'cloud_api'>(number?.provider ?? 'waha');
  const [wahaSession, setWahaSession] = useState(number?.wahaSession ?? '');
  const [externalNumberId, setExternalNumberId] = useState(number?.externalNumberId ?? '');
  const [personaId, setPersonaId] = useState<string | null>(number?.personaId ?? null);
  const [isDefault, setIsDefault] = useState(number?.isDefault ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!phoneE164.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        phoneE164: phoneE164.trim(),
        provider,
        wahaSession: provider === 'waha' ? (wahaSession.trim() || null) : null,
        externalNumberId: provider === 'cloud_api' ? (externalNumberId.trim() || null) : null,
        personaId,
        isDefault,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
  const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{number ? 'Editar Número' : 'Novo Número'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Rótulo</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Número P1" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefone (E.164)</label>
            <input value={phoneE164} onChange={e => setPhoneE164(e.target.value)} placeholder="+5511999999999" className={`${inputCls} font-mono text-xs`} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Provedor</label>
          <div className="flex gap-1.5">
            {(['waha', 'cloud_api'] as const).map(p => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] border ${
                  provider === p ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {p === 'waha' ? 'WAHA (não-oficial)' : 'Cloud API (oficial)'}
              </button>
            ))}
          </div>
        </div>

        {provider === 'waha' ? (
          <div>
            <label className={labelCls}>Sessão WAHA</label>
            <input value={wahaSession} onChange={e => setWahaSession(e.target.value)} placeholder="default" className={`${inputCls} font-mono text-xs`} />
          </div>
        ) : (
          <div>
            <label className={labelCls}>Phone Number ID (Meta)</label>
            <input value={externalNumberId} onChange={e => setExternalNumberId(e.target.value)} placeholder="ID do número na Cloud API" className={`${inputCls} font-mono text-xs`} />
          </div>
        )}

        <div>
          <label className={labelCls}>Persona vinculada</label>
          <Select value={personaId ?? 'none'} onValueChange={v => setPersonaId(v === 'none' ? null : v)}>
            <SelectTrigger className="w-full h-9 text-sm bg-secondary border-border">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem persona</SelectItem>
              {personas.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground">Número padrão da organização</span>
          <button onClick={() => setIsDefault(v => !v)} className={`p-1 ${isDefault ? 'text-primary' : 'text-muted-foreground'}`}>
            {isDefault ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={!phoneE164.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {number ? 'Salvar Alterações' : 'Criar Número'}
        </button>
      </div>
    </div>
  );
};

// ========== MANAGER ==========

const WhatsappNumbersManager = () => {
  const { numbers, loading, addNumber, updateNumber, deleteNumber } = useWhatsappNumbersContext();
  const { personas } = usePersonasContext();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const personaName = (id: string | null) => id ? (personas.find(p => p.id === id)?.name ?? '—') : '—';

  // Ao marcar um número como default, desmarca os demais (índice único exige isso).
  const handleSave = async (input: WhatsappNumberInput, id?: string) => {
    if (input.isDefault) {
      const others = numbers.filter(n => n.isDefault && n.id !== id);
      for (const o of others) await updateNumber(o.id, { isDefault: false });
    }
    if (id) await updateNumber(id, input);
    else await addNumber(input);
    setCreating(false);
    setEditingId(null);
  };

  const handleDelete = async (n: WhatsappNumber) => {
    if (!confirm(`Excluir o número "${n.label || n.phoneE164}"?`)) return;
    await deleteNumber(n.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando números…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        Vincule cada número a uma persona. Mensagens recebidas neste número são atendidas pela persona dele. O número padrão atende leads sem número específico.
      </div>

      {creating && <NumberForm onSave={(i) => handleSave(i)} onCancel={() => setCreating(false)} />}
      {editingId && (
        <NumberForm
          number={numbers.find(n => n.id === editingId)}
          onSave={(i) => handleSave(i, editingId)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {!creating && !editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{numbers.length} número(s)</span>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
          >
            <Plus size={14} /> Novo Número
          </button>
        </div>
      )}

      {numbers.length === 0 && !creating
        ? <p className="text-xs text-muted-foreground text-center py-6">Nenhum número cadastrado</p>
        : numbers.map(n => (
            <div key={n.id} className="bg-card rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Smartphone size={15} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                      {n.label || 'Sem rótulo'}
                      {n.isDefault && <Star size={12} className="text-primary fill-primary shrink-0" />}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{n.phoneE164}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  n.provider === 'cloud_api' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning'
                }`}>
                  {n.provider === 'cloud_api' ? 'Oficial' : 'WAHA'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-muted-foreground">
                  Persona: <span className="text-foreground font-medium">{personaName(n.personaId)}</span>
                  {n.provider === 'waha' && n.wahaSession ? <span className="font-mono"> · {n.wahaSession}</span> : null}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateNumber(n.id, { isActive: !n.isActive })}
                    className={`p-1.5 active:scale-95 ${n.isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    title={n.isActive ? 'Ativo' : 'Inativo'}
                  >
                    {n.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => { setEditingId(n.id); setCreating(false); }} className="p-2 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(n)} className="p-2 text-destructive active:scale-95"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
    </div>
  );
};

export default WhatsappNumbersManager;
