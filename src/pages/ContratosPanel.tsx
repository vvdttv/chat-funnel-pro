import { useState, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Loader2, FileSignature, LogOut, ChevronLeft, Save, AlertCircle, FileText, User, Building2, MapPin, ShieldCheck, Plus, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  LeaseContractsProvider, useLeaseContractsContext,
  type LeaseContract, type LeaseContractStatus, type LeaseContractSection, type LeaseContractFieldDef,
} from '@/hooks/useLeaseContracts';

const STATUS_META: Record<LeaseContractStatus, { label: string; cls: string }> = {
  rascunho:   { label: 'Rascunho',   cls: 'bg-secondary text-muted-foreground' },
  enviado:    { label: 'Enviado',    cls: 'bg-warning/15 text-warning' },
  assinado:   { label: 'Assinado',   cls: 'bg-primary/15 text-primary' },
  ativo:      { label: 'Ativo',      cls: 'bg-[hsl(150,40%,25%)]/40 text-[hsl(150,60%,65%)]' },
  encerrado:  { label: 'Encerrado',  cls: 'bg-secondary text-muted-foreground' },
  cancelado:  { label: 'Cancelado',  cls: 'bg-destructive/15 text-destructive' },
};

const SECTION_META: Record<LeaseContractSection, { label: string; icon: typeof User }> = {
  dados_cliente: { label: 'Dados do cliente', icon: User },
  dados_imobiliaria: { label: 'Imobiliaria / locador', icon: Building2 },
  endereco_imovel: { label: 'Endereco do imovel', icon: MapPin },
  garantia: { label: 'Garantia', icon: ShieldCheck },
};

const SECTION_ORDER: LeaseContractSection[] = ['dados_cliente', 'dados_imobiliaria', 'endereco_imovel', 'garantia'];

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50';

const READJ_OPTIONS = ['IGPM', 'IPCA', 'INCC', 'outro'];

const FieldEditor = ({ def, value, onChange }: {
  def: LeaseContractFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) => {
  if (def.fieldType === 'text') {
    return <input value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={inputCls} placeholder={def.label} />;
  }
  if (def.fieldType === 'single_select') {
    return (
      <select value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">(selecione)</option>
        {def.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (opt: string) => {
    onChange(arr.includes(opt) ? arr.filter(o => o !== opt) : [...arr, opt]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {def.options.map(o => (
        <button key={o} onClick={() => toggle(o)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium active:scale-95 ${arr.includes(o) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
          {o}
        </button>
      ))}
    </div>
  );
};

const ContractDetail = ({ contract, fieldDefs, onClose }: {
  contract: LeaseContract;
  fieldDefs: LeaseContractFieldDef[];
  onClose: () => void;
}) => {
  const { updateStatus, setField, updateContractFields } = useLeaseContractsContext();
  const [busy, setBusy] = useState(false);

  // Campos estruturados
  const [rent, setRent] = useState<string>(contract.rentValue?.toString() ?? '');
  const [condo, setCondo] = useState<string>(contract.condoFee?.toString() ?? '');
  const [iptu, setIptu] = useState<string>(contract.iptu?.toString() ?? '');
  const [dia, setDia] = useState<string>(contract.diaVencimento?.toString() ?? '');
  const [start, setStart] = useState(contract.startDate ?? '');
  const [end, setEnd] = useState(contract.endDate ?? '');
  const [dur, setDur] = useState<string>(contract.durationMonths?.toString() ?? '');
  const [readjIdx, setReadjIdx] = useState(contract.readjustmentIndex ?? '');
  const [readjPer, setReadjPer] = useState<string>(contract.readjustmentPeriodMonths?.toString() ?? '');
  const [multa, setMulta] = useState<string>(contract.multaRescisoriaMeses?.toString() ?? '');
  const [caucao, setCaucao] = useState<string>(contract.caucaoMeses?.toString() ?? '');
  const [docUrl, setDocUrl] = useState(contract.documentUrl ?? '');

  // Campos customizaveis (custom_fields_response)
  const [custom, setCustom] = useState<Record<string, unknown>>({ ...contract.customFieldsResponse });

  const bySection = useMemo(() => {
    const m: Record<LeaseContractSection, LeaseContractFieldDef[]> = {
      dados_cliente: [], dados_imobiliaria: [], endereco_imovel: [], garantia: [],
    };
    for (const f of fieldDefs.filter(f => f.isActive)) m[f.section].push(f);
    for (const s of SECTION_ORDER) m[s].sort((a, b) => a.position - b.position);
    return m;
  }, [fieldDefs]);

  const isLocked = ['encerrado','cancelado'].includes(contract.status);

  const saveStructured = useCallback(async () => {
    setBusy(true);
    const r = await updateContractFields(contract.id, {
      rentValue: rent === '' ? null : Number(rent),
      condoFee: condo === '' ? null : Number(condo),
      iptu: iptu === '' ? null : Number(iptu),
      diaVencimento: dia === '' ? null : Number(dia),
      startDate: start || null,
      endDate: end || null,
      durationMonths: dur === '' ? null : Number(dur),
      readjustmentIndex: readjIdx || null,
      readjustmentPeriodMonths: readjPer === '' ? null : Number(readjPer),
      multaRescisoriaMeses: multa === '' ? null : Number(multa),
      caucaoMeses: caucao === '' ? null : Number(caucao),
      documentUrl: docUrl.trim() || null,
    });
    setBusy(false);
    if (r.error) alert('Erro ao salvar: ' + r.error);
  }, [contract.id, rent, condo, iptu, dia, start, end, dur, readjIdx, readjPer, multa, caucao, docUrl, updateContractFields]);

  const saveCustomField = useCallback(async (key: string, value: unknown) => {
    setCustom(prev => ({ ...prev, [key]: value }));
    const { error } = await setField(contract.id, key, value);
    if (error) alert('Erro ao salvar campo: ' + error);
  }, [contract.id, setField]);

  const moveStatus = useCallback(async (s: LeaseContractStatus) => {
    if (!confirm(`Mudar status para "${STATUS_META[s].label}"?`)) return;
    setBusy(true);
    const { error } = await updateStatus(contract.id, s);
    setBusy(false);
    if (error) alert('Erro ao mudar status: ' + error);
  }, [contract.id, updateStatus]);

  // Transicoes validas (cliente lado a lado com server)
  const nextOptions: LeaseContractStatus[] =
    contract.status === 'rascunho' ? ['enviado','cancelado'] :
    contract.status === 'enviado'  ? ['assinado','rascunho','cancelado'] :
    contract.status === 'assinado' ? ['ativo','cancelado'] :
    contract.status === 'ativo'    ? ['encerrado','cancelado'] : [];

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="sticky top-0 bg-background border-b border-border p-3 flex items-center gap-2 z-10">
        <button onClick={onClose} className="p-1.5 active:scale-95 text-muted-foreground"><ChevronLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">Contrato - {contract.dealId}</p>
          <p className="text-[11px] text-muted-foreground truncate">Criado {new Date(contract.createdAt).toLocaleString('pt-BR')}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_META[contract.status].cls}`}>{STATUS_META[contract.status].label}</span>
      </div>

      <div className="p-3 space-y-4 max-w-2xl mx-auto">
        {/* Lifecycle */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Mover status</p>
          {nextOptions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Contrato em estado final. Nao da pra mudar.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextOptions.map(s => (
                <button key={s} onClick={() => moveStatus(s)} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium active:scale-95 disabled:opacity-40">
                  -&gt; {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">
            {contract.signedAt && `Assinado em ${new Date(contract.signedAt).toLocaleDateString('pt-BR')}. `}
            {contract.activatedAt && `Ativado em ${new Date(contract.activatedAt).toLocaleDateString('pt-BR')}. `}
            {contract.terminatedAt && `Encerrado em ${new Date(contract.terminatedAt).toLocaleDateString('pt-BR')}.`}
          </p>
        </div>

        {/* Campos estruturados */}
        <div className="bg-card border border-border rounded-xl p-3 space-y-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Valores e prazos</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Aluguel (R$)</label>
              <input type="number" value={rent} onChange={e => setRent(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Condominio (R$)</label>
              <input type="number" value={condo} onChange={e => setCondo(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">IPTU (R$)</label>
              <input type="number" value={iptu} onChange={e => setIptu(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Dia vencimento (1-31)</label>
              <input type="number" min={1} max={31} value={dia} onChange={e => setDia(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Inicio</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} disabled={isLocked} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Fim</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} disabled={isLocked} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Duracao (meses)</label>
              <input type="number" value={dur} onChange={e => setDur(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Indice reajuste</label>
              <select value={readjIdx} onChange={e => setReadjIdx(e.target.value)} disabled={isLocked} className={inputCls}>
                <option value="">(nenhum)</option>
                {READJ_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Periodo reajuste (meses)</label>
              <input type="number" value={readjPer} onChange={e => setReadjPer(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Multa rescisoria (meses)</label>
              <input type="number" value={multa} onChange={e => setMulta(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground">Caucao (meses)</label>
              <input type="number" value={caucao} onChange={e => setCaucao(e.target.value)} disabled={isLocked} className={`${inputCls} font-mono`} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground flex items-center gap-1"><FileText size={11} /> URL do contrato (PDF)</label>
            <input value={docUrl} onChange={e => setDocUrl(e.target.value)} disabled={isLocked} placeholder="https://..." className={inputCls} />
          </div>
          <button onClick={saveStructured} disabled={busy || isLocked}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1">
            {busy && <Loader2 size={12} className="animate-spin" />}
            <Save size={12} /> Salvar valores
          </button>
        </div>

        {/* Campos customizaveis por secao */}
        {SECTION_ORDER.map(s => {
          const Meta = SECTION_META[s];
          const defs = bySection[s];
          if (defs.length === 0) return null;
          return (
            <div key={s} className="bg-card border border-border rounded-xl p-3 space-y-2.5">
              <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                <Meta.icon size={13} /> {Meta.label}
              </p>
              {defs.map(d => (
                <div key={d.id}>
                  <label className="text-[10px] text-muted-foreground">{d.label}</label>
                  <FieldEditor def={d} value={custom[d.fieldKey]}
                    onChange={(v) => { if (!isLocked) saveCustomField(d.fieldKey, v); }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ContratosContent = () => {
  const { profile, signOut, isAdmin } = useAuth();
  const { contracts, fieldDefs, loading } = useLeaseContractsContext();
  const [filter, setFilter] = useState<'todos' | LeaseContractStatus>('todos');
  const [selected, setSelected] = useState<LeaseContract | null>(null);

  const filtered = useMemo(() => {
    return contracts.filter(c => filter === 'todos' || c.status === filter);
  }, [contracts, filter]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={28} className="mx-auto text-destructive mb-2" />
          <p className="text-sm text-foreground font-semibold mb-1">Acesso restrito</p>
          <p className="text-xs text-muted-foreground">O painel de contratos e do dpto administrativo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-background border-b border-border p-3 z-10 flex items-center gap-2">
        <FileSignature size={18} className="text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Contratos de Locacao</p>
          <p className="text-[11px] text-muted-foreground truncate">{profile?.full_name ?? 'admin'}</p>
        </div>
        <button onClick={signOut} className="p-1.5 text-muted-foreground active:scale-95" title="Sair"><LogOut size={16} /></button>
      </div>

      <div className="p-3 max-w-2xl mx-auto">
        <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1">
          {(['todos','rascunho','enviado','assinado','ativo','encerrado','cancelado'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium active:scale-95 ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {s === 'todos' ? 'Todos' : STATUS_META[s].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhum contrato neste filtro. Contratos sao criados na etapa "corloc-contrato" do funil de corretor de locacao.
          </p>
        ) : (
          filtered.map(c => {
            const meta = STATUS_META[c.status];
            return (
              <button key={c.id} onClick={() => setSelected(c)}
                className="w-full text-left bg-card border border-border rounded-xl p-3 mb-2 active:scale-[0.99]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {c.locatarioNome ?? c.dealId}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Deal {c.dealId}{c.rentValue ? ` - R$ ${c.rentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                  {c.startDate ? ` - inicio ${new Date(c.startDate).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </button>
            );
          })
        )}
      </div>

      {selected && <ContractDetail contract={selected} fieldDefs={fieldDefs} onClose={() => setSelected(null)} />}
    </div>
  );
};

const ContratosPanel = () => {
  const { user, loading: authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <LeaseContractsProvider>
      <ContratosContent />
    </LeaseContractsProvider>
  );
};

export default ContratosPanel;