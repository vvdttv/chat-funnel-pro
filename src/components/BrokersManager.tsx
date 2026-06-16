import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, UserRound, CalendarClock, AlertTriangle } from 'lucide-react';
import {
  useBrokersContext,
  type Broker,
  type BrokerAvailability,
  type BrokerInput,
  type BrokerChannel,
} from '@/hooks/useBrokers';

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

const CHANNEL_LABELS: Record<BrokerChannel, string> = {
  presencial: 'Presencial',
  video: 'Vídeo',
  ligacao: 'Ligação',
};
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ========== BROKER FORM ==========

const BrokerForm = ({ broker, onSave, onCancel }: {
  broker?: Broker;
  onSave: (input: BrokerInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(broker?.name ?? '');
  const [email, setEmail] = useState(broker?.email ?? '');
  const [phone, setPhone] = useState(broker?.phoneE164 ?? '');
  const [wahaSession, setWahaSession] = useState(broker?.wahaSession ?? '');
  const [userId, setUserId] = useState(broker?.userId ?? '');
  const [pct, setPct] = useState<number>(broker?.distributionPct ?? 0);
  const [channels, setChannels] = useState<BrokerChannel[]>(broker?.channels ?? ['presencial', 'video', 'ligacao']);
  const [saving, setSaving] = useState(false);

  const toggleChannel = (c: BrokerChannel) =>
    setChannels(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim() || null,
        phoneE164: phone.trim() || null,
        wahaSession: wahaSession.trim() || null,
        userId: userId.trim() || null,
        distributionPct: Math.max(0, Math.min(100, pct)),
        channels: channels.length ? channels : ['presencial'],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{broker ? 'Editar Corretor' : 'Novo Corretor'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do corretor" className={inputCls} />
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
          <label className={labelCls}>Sessão WAHA (opcional)</label>
          <input value={wahaSession} onChange={e => setWahaSession(e.target.value)} placeholder="default" className={`${inputCls} font-mono text-xs`} />
          <p className="text-[10px] text-muted-foreground mt-1">Sessão WAHA pela qual o corretor atende o lead. Vazio = número operacional padrão.</p>
        </div>
        <div>
          <label className={labelCls}>Canais que atende</label>
          <div className="flex gap-1.5">
            {(['presencial', 'video', 'ligacao'] as BrokerChannel[]).map(c => (
              <button key={c} type="button" onClick={() => toggleChannel(c)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-medium border active:scale-[0.98] ${
                  channels.includes(c) ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
                }`}>
                {CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Hierarquia de preferência: presencial &gt; vídeo &gt; ligação.</p>
        </div>
        <div>
          <label className={labelCls}>User ID do login (opcional)</label>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="uuid do usuário com role corretor" className={`${inputCls} font-mono text-[11px]`} />
          <p className="text-[10px] text-muted-foreground mt-1">Vincule ao usuário (role corretor) para ele ver só os leads dele.</p>
        </div>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {broker ? 'Salvar' : 'Criar Corretor'}
        </button>
      </div>
    </div>
  );
};

// ========== AVAILABILITY EDITOR ==========

const AvailabilityEditor = ({ broker, availability }: {
  broker: Broker;
  availability: BrokerAvailability[];
}) => {
  const { addAvailability, deleteAvailability } = useBrokersContext();
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [busy, setBusy] = useState(false);

  const slots = availability.filter(a => a.brokerId === broker.id)
    .sort((x, y) => x.weekday - y.weekday || x.startTime.localeCompare(y.startTime));

  const handleAdd = async () => {
    if (end <= start || busy) return;
    setBusy(true);
    await addAvailability({ brokerId: broker.id, weekday, startTime: start, endTime: end });
    setBusy(false);
  };

  return (
    <div className="mt-3 pl-2 border-l-2 border-border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
        <CalendarClock size={11} /> Disponibilidade
      </p>
      {slots.length === 0 && (
        <p className="text-[10px] text-muted-foreground mb-2">Sem agenda cadastrada — usa o horário comercial padrão (seg–sex 8–18, sáb 8–12).</p>
      )}
      {slots.map(s => (
        <div key={s.id} className="flex items-center justify-between bg-secondary rounded-lg px-2.5 py-1.5 mb-1">
          <span className="text-[11px] text-foreground font-mono">{WEEKDAYS[s.weekday]} · {s.startTime}–{s.endTime}</span>
          <button onClick={() => deleteAvailability(s.id)} className="p-1 text-destructive active:scale-95"><Trash2 size={12} /></button>
        </div>
      ))}
      <div className="flex items-center gap-1.5 mt-1.5">
        <select value={weekday} onChange={e => setWeekday(Number(e.target.value))}
          className="bg-secondary rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none border border-border">
          {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        <input type="time" value={start} onChange={e => setStart(e.target.value)}
          className="bg-secondary rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none border border-border" />
        <input type="time" value={end} onChange={e => setEnd(e.target.value)}
          className="bg-secondary rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none border border-border" />
        <button onClick={handleAdd} disabled={end <= start || busy}
          className="p-2 rounded-lg bg-primary text-primary-foreground active:scale-95 disabled:opacity-40"><Plus size={13} /></button>
      </div>
    </div>
  );
};

// ========== MANAGER ==========

const BrokersManager = () => {
  const {
    brokers, availability, loading,
    addBroker, updateBroker, deleteBroker,
  } = useBrokersContext();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sum = brokers.filter(b => b.isActive).reduce((s, b) => s + b.distributionPct, 0);

  const handleDelete = async (b: Broker) => {
    if (!confirm(`Excluir o corretor "${b.name}" e sua agenda?`)) return;
    await deleteBroker(b.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando corretores…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        A roleta de corretores distribui os leads aprovados pelos percentuais (0% = não recebe). A agenda alimenta a proposta de horários da IA ("mais breve possível", 2 opções por vez). Sem agenda cadastrada, usa o horário comercial padrão.
      </div>

      {brokers.length > 0 && sum !== 100 && (
        <div className="flex items-center gap-2 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-lg p-2.5 mb-3">
          <AlertTriangle size={14} className="shrink-0" />
          A soma dos percentuais dos corretores ativos é {sum}% (ideal: 100%). A roleta ainda funciona proporcionalmente, mas convém ajustar.
        </div>
      )}

      {creating && <BrokerForm onSave={async (i) => { await addBroker(i); setCreating(false); }} onCancel={() => setCreating(false)} />}
      {editingId && (
        <BrokerForm
          broker={brokers.find(b => b.id === editingId)}
          onSave={async (i) => { await updateBroker(editingId, i); setEditingId(null); }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {!creating && !editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{brokers.length} corretor(es)</span>
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
            <Plus size={14} /> Novo Corretor
          </button>
        </div>
      )}

      {brokers.length === 0 && !creating
        ? <p className="text-xs text-muted-foreground text-center py-6">Nenhum corretor cadastrado</p>
        : brokers.map(broker => (
            <div key={broker.id} className="bg-card rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <UserRound size={15} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{broker.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {broker.distributionPct}% · {broker.phoneE164 ?? 'sem WhatsApp'}{broker.userId ? ' · vinculado' : ' · sem login'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateBroker(broker.id, { isActive: !broker.isActive })}
                    className={`p-1.5 active:scale-95 ${broker.isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    title={broker.isActive ? 'Ativo' : 'Inativo'}>
                    {broker.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button onClick={() => { setEditingId(broker.id); setCreating(false); }} className="p-2 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(broker)} className="p-2 text-destructive active:scale-95"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {broker.channels.map(c => (
                  <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{CHANNEL_LABELS[c]}</span>
                ))}
              </div>
              <AvailabilityEditor broker={broker} availability={availability} />
            </div>
          ))}
    </div>
  );
};

export default BrokersManager;
