import { useState, useMemo, useCallback, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Loader2, ClipboardCheck, LogOut, Calendar, CheckCircle2, XCircle, ChevronLeft, Plus, Image as ImageIcon, FileText, Save, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  InspectorsProvider, useInspectorsContext,
  type PropertyInspection, type InspectionStatus, type InspectionItem, type Inspector,
} from '@/hooks/useInspectors';

const STATUS_META: Record<InspectionStatus, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-secondary text-muted-foreground' },
  agendada: { label: 'Agendada', cls: 'bg-warning/15 text-warning' },
  em_andamento: { label: 'Em andamento', cls: 'bg-primary/15 text-primary' },
  concluida: { label: 'Concluida', cls: 'bg-[hsl(150,40%,25%)]/40 text-[hsl(150,60%,65%)]' },
  cancelada: { label: 'Cancelada', cls: 'bg-destructive/15 text-destructive' },
};

const TYPE_LABEL: Record<string, string> = { entrada: 'Entrada', saida: 'Saida' };

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50';

const InspectionDetail = ({ inspection, inspectors, onClose }: { inspection: PropertyInspection; inspectors: Inspector[]; onClose: () => void }) => {
  const { assignInspector, updateInspectionStatus, loadItems, addItem, updateItem, deleteItem } = useInspectorsContext();
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [scheduledAt, setScheduledAt] = useState(inspection.scheduledAt ?? '');
  const [reportUrl, setReportUrl] = useState(inspection.reportUrl ?? '');
  const [notes, setNotes] = useState(inspection.generalNotes ?? '');
  const [newRoom, setNewRoom] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newCondition, setNewCondition] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingItems(true);
    const d = await loadItems(inspection.id);
    setItems(d);
    setLoadingItems(false);
  }, [inspection.id, loadItems]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAssign = async (inspectorId: string | null) => {
    setBusy(true);
    const { error } = await assignInspector(inspection.id, inspectorId);
    setBusy(false);
    if (error) alert('Erro ao atribuir: ' + error);
  };

  const handleStatus = async (s: InspectionStatus) => {
    setBusy(true);
    const { error } = await updateInspectionStatus(inspection.id, s,
      scheduledAt || null, reportUrl.trim() || null, notes.trim() || null);
    setBusy(false);
    if (error) alert('Erro: ' + error);
  };

  const handleAddItem = async () => {
    if (!newItem.trim()) return;
    setBusy(true);
    const r = await addItem(inspection.id, {
      room: newRoom.trim() || null,
      item: newItem.trim(),
      condition: newCondition.trim() || null,
      position: items.length,
    });
    setBusy(false);
    if (r.error) { alert('Erro ao adicionar item: ' + r.error); return; }
    setNewRoom(''); setNewItem(''); setNewCondition('');
    await refresh();
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Excluir este item?')) return;
    await deleteItem(id);
    await refresh();
  };

  const currentInspector = inspectors.find(i => i.id === inspection.inspectorId);
  const isFinal = inspection.status === 'concluida' || inspection.status === 'cancelada';

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="sticky top-0 bg-background border-b border-border p-3 flex items-center gap-2 z-10">
        <button onClick={onClose} className="p-1.5 active:scale-95 text-muted-foreground"><ChevronLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">Vistoria de {TYPE_LABEL[inspection.inspectionType]} - {inspection.dealId}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            Criada {new Date(inspection.createdAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_META[inspection.status].cls}`}>{STATUS_META[inspection.status].label}</span>
      </div>

      <div className="p-3 space-y-4 max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Vistoriador</p>
          <select value={inspection.inspectorId ?? ''} onChange={e => handleAssign(e.target.value || null)} disabled={isFinal || busy} className={inputCls}>
            <option value="">(sem vistoriador - na fila)</option>
            {inspectors.filter(i => i.isActive).map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          {currentInspector && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {currentInspector.email ?? 'sem e-mail'}{currentInspector.phoneE164 ? ` - ${currentInspector.phoneE164}` : ''}
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-3 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Agendamento e laudo</p>
          <div>
            <label className="text-[11px] text-muted-foreground flex items-center gap-1"><Calendar size={11} /> Data agendada</label>
            <input type="datetime-local" value={scheduledAt ? scheduledAt.slice(0, 16) : ''}
              onChange={e => setScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
              disabled={isFinal} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground flex items-center gap-1"><FileText size={11} /> URL do laudo (PDF)</label>
            <input value={reportUrl} onChange={e => setReportUrl(e.target.value)} disabled={isFinal} placeholder="https://..." className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Observacoes gerais</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={isFinal} rows={3} className={inputCls} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['pendente','agendada','em_andamento','concluida','cancelada'] as InspectionStatus[]).map(s => (
              <button key={s} onClick={() => handleStatus(s)} disabled={busy || s === inspection.status}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium active:scale-95 disabled:opacity-40 ${s === inspection.status ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                {STATUS_META[s].label}
              </button>
            ))}
            <button onClick={() => handleStatus(inspection.status)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-foreground active:scale-95 flex items-center gap-1">
              <Save size={12} /> Salvar campos
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Checklist - itens por comodo</p>
          {loadingItems ? (
            <div className="flex justify-center py-4"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-3">Nenhum item ainda</p>
          ) : (
            <div className="space-y-1.5 mb-3">
              {items.map(it => (
                <div key={it.id} className="bg-secondary rounded-lg p-2 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      {it.room && <span className="text-muted-foreground">[{it.room}] </span>}
                      <span className="font-medium">{it.item}</span>
                      {it.condition && <span className="text-muted-foreground"> - {it.condition}</span>}
                    </p>
                    {it.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{it.notes}</p>}
                    {it.photoUrls.length > 0 && (
                      <div className="flex gap-1 mt-1.5 overflow-x-auto">
                        {it.photoUrls.map(url => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                            <ImageIcon size={14} className="text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {!isFinal && (
                    <button onClick={() => handleDeleteItem(it.id)} className="p-1 text-destructive active:scale-95"><XCircle size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!isFinal && (
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <input value={newRoom} onChange={e => setNewRoom(e.target.value)} placeholder="Comodo (sala...)" className={`${inputCls} text-xs`} />
              <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Item (parede...)" className={`${inputCls} text-xs`} />
              <input value={newCondition} onChange={e => setNewCondition(e.target.value)} placeholder="Condicao" className={`${inputCls} text-xs`} />
            </div>
          )}
          {!isFinal && (
            <button onClick={handleAddItem} disabled={!newItem.trim() || busy} className="w-full py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1">
              <Plus size={12} /> Adicionar item
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const VistoriasContent = () => {
  const { profile, signOut, isAdmin } = useAuth();
  const { inspections, inspectors, loading } = useInspectorsContext();
  const [filter, setFilter] = useState<'todas' | InspectionStatus>('todas');
  const [selected, setSelected] = useState<PropertyInspection | null>(null);

  const filtered = useMemo(() => {
    return inspections.filter(i => filter === 'todas' || i.status === filter);
  }, [inspections, filter]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={28} className="mx-auto text-destructive mb-2" />
          <p className="text-sm text-foreground font-semibold mb-1">Acesso restrito</p>
          <p className="text-xs text-muted-foreground">O painel de vistorias e do dpto administrativo. Pedir acesso ao admin da org.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-background border-b border-border p-3 z-10 flex items-center gap-2">
        <ClipboardCheck size={18} className="text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Vistorias</p>
          <p className="text-[11px] text-muted-foreground truncate">{profile?.full_name ?? 'admin'}</p>
        </div>
        <button onClick={signOut} className="p-1.5 text-muted-foreground active:scale-95" title="Sair"><LogOut size={16} /></button>
      </div>

      <div className="p-3 max-w-2xl mx-auto">
        <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1">
          {(['todas','pendente','agendada','em_andamento','concluida','cancelada'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium active:scale-95 ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {s === 'todas' ? 'Todas' : STATUS_META[s].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhuma vistoria neste filtro.</p>
        ) : (
          filtered.map(i => {
            const insp = inspectors.find(x => x.id === i.inspectorId);
            const meta = STATUS_META[i.status];
            return (
              <button key={i.id} onClick={() => setSelected(i)}
                className="w-full text-left bg-card border border-border rounded-xl p-3 mb-2 active:scale-[0.99]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground">
                    {TYPE_LABEL[i.inspectionType]} - {i.dealId}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {insp ? insp.name : 'sem vistoriador'}{i.scheduledAt ? ` - ${new Date(i.scheduledAt).toLocaleString('pt-BR')}` : ''}
                </p>
              </button>
            );
          })
        )}
      </div>

      {selected && <InspectionDetail inspection={selected} inspectors={inspectors} onClose={() => setSelected(null)} />}
    </div>
  );
};

const VistoriasPanel = () => {
  const { user, loading: authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <InspectorsProvider>
      <VistoriasContent />
    </InspectorsProvider>
  );
};

export default VistoriasPanel;