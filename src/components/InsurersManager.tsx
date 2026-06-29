import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, ShieldCheck, UserCog, AlertTriangle } from 'lucide-react';
import {
  useInsurersContext, type Insurer, type InsurerAttendant,
  type InsurerInput, type InsurerAttendantInput,
} from '@/hooks/useInsurers';

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

const InsurerForm = ({ insurer, onSave, onCancel }: {
  insurer?: Insurer;
  onSave: (input: InsurerInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(insurer?.name ?? '');
  const [cnpj, setCnpj] = useState(insurer?.cnpj ?? '');
  const [phone, setPhone] = useState(insurer?.contactPhone ?? '');
  const [email, setEmail] = useState(insurer?.contactEmail ?? '');
  const [pct, setPct] = useState<number>(insurer?.distributionPct ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        cnpj: cnpj.trim() || null,
        contactPhone: phone.trim() || null,
        contactEmail: email.trim() || null,
        distributionPct: Math.max(0, Math.min(100, pct)),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{insurer ? 'Editar Seguradora' : 'Nova Seguradora'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Nome da seguradora/emissora</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Porto Seguro" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>CNPJ (opcional)</label>
            <input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>% distribuicao</label>
            <input type="number" min={0} max={100} value={pct}
              onChange={e => setPct(Number(e.target.value))} className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Telefone (opcional)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511999999999" className={`${inputCls} font-mono text-xs`} />
          </div>
          <div>
            <label className={labelCls}>E-mail (opcional)</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@seguradora.com" className={`${inputCls} text-xs`} />
          </div>
        </div>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {insurer ? 'Salvar' : 'Criar Seguradora'}
        </button>
      </div>
    </div>
  );
};

const AttendantForm = ({ insurerId, attendant, onSave, onCancel }: {
  insurerId: string;
  attendant?: InsurerAttendant;
  onSave: (input: InsurerAttendantInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(attendant?.name ?? '');
  const [email, setEmail] = useState(attendant?.email ?? '');
  const [phone, setPhone] = useState(attendant?.phoneE164 ?? '');
  const [userId, setUserId] = useState(attendant?.userId ?? '');
  const [pct, setPct] = useState<number>(attendant?.distributionPct ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        insurerId,
        name: name.trim(),
        email: email.trim() || null,
        phoneE164: phone.trim() || null,
        userId: userId.trim() || null,
        distributionPct: Math.max(0, Math.min(100, pct)),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-secondary rounded-xl p-3 mb-2 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-foreground">{attendant ? 'Editar Atendente' : 'Novo Atendente'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={14} /></button>
      </div>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do atendente" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>% distribuicao</label>
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
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="uuid do usuario com role atendente" className={`${inputCls} font-mono text-[11px]`} />
          <p className="text-[10px] text-muted-foreground mt-1">Vincule ao usuario (role atendente) para que ele veja so as analises dele no painel.</p>
        </div>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2">
          {saving && <Loader2 size={13} className="animate-spin" />}
          {attendant ? 'Salvar' : 'Criar Atendente'}
        </button>
      </div>
    </div>
  );
};

const InsurersManager = () => {
  const {
    insurers, attendants, loading,
    addInsurer, updateInsurer, deleteInsurer,
    addAttendant, updateAttendant, deleteAttendant,
  } = useInsurersContext();
  const [creatingInsurer, setCreatingInsurer] = useState(false);
  const [editingInsurerId, setEditingInsurerId] = useState<string | null>(null);
  const [creatingAttFor, setCreatingAttFor] = useState<string | null>(null);
  const [editingAttId, setEditingAttId] = useState<string | null>(null);

  const insurerSum = insurers.filter(i => i.isActive).reduce((s, i) => s + i.distributionPct, 0);

  const handleDeleteInsurer = async (i: Insurer) => {
    if (!confirm(`Excluir a seguradora "${i.name}" e seus atendentes?`)) return;
    await deleteInsurer(i.id);
  };
  const handleDeleteAtt = async (a: InsurerAttendant) => {
    if (!confirm(`Excluir o atendente "${a.name}"?`)) return;
    await deleteAttendant(a.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando seguradoras...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        A roleta dupla distribui as analises de garantia (seguro-fianca e titulo de capitalizacao) entre as seguradoras: primeiro escolhe a seguradora pelos percentuais, depois o atendente dentro dela. 0% = nao recebe. Fiador e caucao nao usam seguradora (ficam na fila do administrativo).
      </div>

      {insurers.length > 0 && insurerSum !== 100 && (
        <div className="flex items-center gap-2 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-lg p-2.5 mb-3">
          <AlertTriangle size={14} className="shrink-0" />
          A soma dos percentuais das seguradoras ativas e {insurerSum}% (ideal: 100%). A roleta funciona proporcionalmente, mas convem ajustar.
        </div>
      )}

      {creatingInsurer && <InsurerForm onSave={async (i) => { await addInsurer(i); setCreatingInsurer(false); }} onCancel={() => setCreatingInsurer(false)} />}
      {editingInsurerId && (
        <InsurerForm
          insurer={insurers.find(i => i.id === editingInsurerId)}
          onSave={async (i) => { await updateInsurer(editingInsurerId, i); setEditingInsurerId(null); }}
          onCancel={() => setEditingInsurerId(null)}
        />
      )}

      {!creatingInsurer && !editingInsurerId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{insurers.length} seguradora(s)</span>
          <button onClick={() => setCreatingInsurer(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
            <Plus size={14} /> Nova Seguradora
          </button>
        </div>
      )}

      {insurers.length === 0 && !creatingInsurer
        ? <p className="text-xs text-muted-foreground text-center py-6">Nenhuma seguradora cadastrada</p>
        : insurers.map(ins => {
            const list = attendants.filter(a => a.insurerId === ins.id).sort((x, y) => x.position - y.position);
            const attSum = list.filter(a => a.isActive).reduce((s, a) => s + a.distributionPct, 0);
            return (
              <div key={ins.id} className="bg-card rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <ShieldCheck size={15} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{ins.name}</p>
                      <p className="text-xs text-muted-foreground">{ins.distributionPct}% - {list.length} atendente(s){ins.cnpj ? ` - ${ins.cnpj}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateInsurer(ins.id, { isActive: !ins.isActive })}
                      className={`p-1.5 active:scale-95 ${ins.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {ins.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => { setEditingInsurerId(ins.id); setCreatingInsurer(false); }} className="p-2 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
                    <button onClick={() => handleDeleteInsurer(ins)} className="p-2 text-destructive active:scale-95"><Trash2 size={15} /></button>
                  </div>
                </div>

                <div className="mt-3 pl-2 border-l-2 border-border">
                  {list.length > 0 && attSum !== 100 && (
                    <p className="text-[10px] text-warning mb-2">Soma dos % dos atendentes ativos: {attSum}% (ideal 100%).</p>
                  )}
                  {list.map(a => (
                    editingAttId === a.id ? (
                      <AttendantForm key={a.id} insurerId={ins.id} attendant={a}
                        onSave={async (i) => { await updateAttendant(a.id, i); setEditingAttId(null); }}
                        onCancel={() => setEditingAttId(null)} />
                    ) : (
                      <div key={a.id} className="flex items-center justify-between bg-secondary rounded-lg p-2.5 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <UserCog size={13} className="text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{a.name} - {a.distributionPct}%</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {a.phoneE164 ?? 'sem WhatsApp'}{a.userId ? ' - vinculado' : ' - sem login'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => updateAttendant(a.id, { insurerId: a.insurerId, name: a.name, isActive: !a.isActive })}
                            className={`p-1 active:scale-95 ${a.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                            {a.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                          <button onClick={() => { setEditingAttId(a.id); setCreatingAttFor(null); }} className="p-1.5 text-muted-foreground active:scale-95"><Pencil size={13} /></button>
                          <button onClick={() => handleDeleteAtt(a)} className="p-1.5 text-destructive active:scale-95"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )
                  ))}

                  {creatingAttFor === ins.id ? (
                    <AttendantForm insurerId={ins.id}
                      onSave={async (i) => { await addAttendant(i); setCreatingAttFor(null); }}
                      onCancel={() => setCreatingAttFor(null)} />
                  ) : (
                    <button onClick={() => { setCreatingAttFor(ins.id); setEditingAttId(null); }}
                      className="flex items-center gap-1 text-[11px] text-primary font-medium active:scale-95 mt-1">
                      <Plus size={12} /> Adicionar atendente
                    </button>
                  )}
                </div>
              </div>
            );
          })}
    </div>
  );
};

export default InsurersManager;