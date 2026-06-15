import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, Landmark, UserCog, AlertTriangle } from 'lucide-react';
import {
  useCorrespondentBanksContext,
  type CorrespondentBank,
  type CorrespondentAttendant,
  type BankInput,
  type AttendantInput,
} from '@/hooks/useCorrespondentBanks';

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

// ========== BANK FORM ==========

const BankForm = ({ bank, onSave, onCancel }: {
  bank?: CorrespondentBank;
  onSave: (input: BankInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(bank?.name ?? '');
  const [pct, setPct] = useState<number>(bank?.distributionPct ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), distributionPct: Math.max(0, Math.min(100, pct)) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{bank ? 'Editar Correspondente' : 'Novo Correspondente'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Nome do correspondente</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Banco Parceiro X" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>% de distribuição (0–100)</label>
          <input type="number" min={0} max={100} value={pct}
            onChange={e => setPct(Number(e.target.value))} className={`${inputCls} font-mono`} />
        </div>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {bank ? 'Salvar' : 'Criar Correspondente'}
        </button>
      </div>
    </div>
  );
};

// ========== ATTENDANT FORM ==========

const AttendantForm = ({ bankId, attendant, onSave, onCancel }: {
  bankId: string;
  attendant?: CorrespondentAttendant;
  onSave: (input: AttendantInput) => Promise<void>;
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
        bankId,
        name: name.trim(),
        email: email.trim() || null,
        phoneE164: phone.trim() || null,
        userId: userId.trim() || null,
        distributionPct: Math.max(0, Math.min(100, pct)),
      });
    } finally {
      setSaving(false);
    }
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
            <label className={labelCls}>% distribuição</label>
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
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="uuid do usuário com role atendente" className={`${inputCls} font-mono text-[11px]`} />
          <p className="text-[10px] text-muted-foreground mt-1">Vincule ao usuário (role atendente) para que ele veja só as análises dele no painel.</p>
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

// ========== MANAGER ==========

const CorrespondentsManager = () => {
  const {
    banks, attendants, loading,
    addBank, updateBank, deleteBank,
    addAttendant, updateAttendant, deleteAttendant,
  } = useCorrespondentBanksContext();
  const [creatingBank, setCreatingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [creatingAttFor, setCreatingAttFor] = useState<string | null>(null);
  const [editingAttId, setEditingAttId] = useState<string | null>(null);

  const bankSum = banks.filter(b => b.isActive).reduce((s, b) => s + b.distributionPct, 0);

  const handleDeleteBank = async (b: CorrespondentBank) => {
    if (!confirm(`Excluir o correspondente "${b.name}" e seus atendentes?`)) return;
    await deleteBank(b.id);
  };
  const handleDeleteAtt = async (a: CorrespondentAttendant) => {
    if (!confirm(`Excluir o atendente "${a.name}"?`)) return;
    await deleteAttendant(a.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando correspondentes…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        A roleta dupla distribui as análises de crédito: primeiro escolhe o correspondente pelos percentuais, depois o atendente dentro dele. 0% = não recebe. A distribuição é proporcional ao longo do tempo.
      </div>

      {/* Aviso de soma de % dos correspondentes ativos */}
      {banks.length > 0 && bankSum !== 100 && (
        <div className="flex items-center gap-2 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-lg p-2.5 mb-3">
          <AlertTriangle size={14} className="shrink-0" />
          A soma dos percentuais dos correspondentes ativos é {bankSum}% (ideal: 100%). A roleta ainda funciona proporcionalmente, mas convém ajustar.
        </div>
      )}

      {creatingBank && <BankForm onSave={async (i) => { await addBank(i); setCreatingBank(false); }} onCancel={() => setCreatingBank(false)} />}
      {editingBankId && (
        <BankForm
          bank={banks.find(b => b.id === editingBankId)}
          onSave={async (i) => { await updateBank(editingBankId, i); setEditingBankId(null); }}
          onCancel={() => setEditingBankId(null)}
        />
      )}

      {!creatingBank && !editingBankId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{banks.length} correspondente(s)</span>
          <button onClick={() => setCreatingBank(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
            <Plus size={14} /> Novo Correspondente
          </button>
        </div>
      )}

      {banks.length === 0 && !creatingBank
        ? <p className="text-xs text-muted-foreground text-center py-6">Nenhum correspondente cadastrado</p>
        : banks.map(bank => {
            const bankAttendants = attendants.filter(a => a.bankId === bank.id).sort((x, y) => x.position - y.position);
            const attSum = bankAttendants.filter(a => a.isActive).reduce((s, a) => s + a.distributionPct, 0);
            return (
              <div key={bank.id} className="bg-card rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <Landmark size={15} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{bank.name}</p>
                      <p className="text-xs text-muted-foreground">{bank.distributionPct}% · {bankAttendants.length} atendente(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateBank(bank.id, { isActive: !bank.isActive })}
                      className={`p-1.5 active:scale-95 ${bank.isActive ? 'text-primary' : 'text-muted-foreground'}`}
                      title={bank.isActive ? 'Ativo' : 'Inativo'}>
                      {bank.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => { setEditingBankId(bank.id); setCreatingBank(false); }} className="p-2 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
                    <button onClick={() => handleDeleteBank(bank)} className="p-2 text-destructive active:scale-95"><Trash2 size={15} /></button>
                  </div>
                </div>

                {/* Atendentes do banco */}
                <div className="mt-3 pl-2 border-l-2 border-border">
                  {bankAttendants.length > 0 && attSum !== 100 && (
                    <p className="text-[10px] text-warning mb-2">Soma dos % dos atendentes ativos: {attSum}% (ideal 100%).</p>
                  )}
                  {bankAttendants.map(a => (
                    editingAttId === a.id ? (
                      <AttendantForm key={a.id} bankId={bank.id} attendant={a}
                        onSave={async (i) => { await updateAttendant(a.id, i); setEditingAttId(null); }}
                        onCancel={() => setEditingAttId(null)} />
                    ) : (
                      <div key={a.id} className="flex items-center justify-between bg-secondary rounded-lg p-2.5 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <UserCog size={13} className="text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{a.name} · {a.distributionPct}%</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {a.phoneE164 ?? 'sem WhatsApp'}{a.userId ? ' · vinculado' : ' · sem login'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => updateAttendant(a.id, { bankId: a.bankId, name: a.name, isActive: !a.isActive })}
                            className={`p-1 active:scale-95 ${a.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                            {a.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          </button>
                          <button onClick={() => { setEditingAttId(a.id); setCreatingAttFor(null); }} className="p-1.5 text-muted-foreground active:scale-95"><Pencil size={13} /></button>
                          <button onClick={() => handleDeleteAtt(a)} className="p-1.5 text-destructive active:scale-95"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    )
                  ))}

                  {creatingAttFor === bank.id ? (
                    <AttendantForm bankId={bank.id}
                      onSave={async (i) => { await addAttendant(i); setCreatingAttFor(null); }}
                      onCancel={() => setCreatingAttFor(null)} />
                  ) : (
                    <button onClick={() => { setCreatingAttFor(bank.id); setEditingAttId(null); }}
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

export default CorrespondentsManager;
