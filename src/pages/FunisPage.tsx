import { useState } from 'react';
import { deals as mockDeals, STAGES, LOSS_REASONS, formatCurrency, Deal } from '@/data/mockData';
import { Users, ChevronRight, X, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react';

const DealCard = ({ deal, onClick }: { deal: Deal; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="bg-card rounded-xl p-4 mb-3 active:scale-[0.98] transition-transform"
  >
    <div className="flex items-start justify-between mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{deal.leadName}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{deal.property}</p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
    </div>
    <div className="flex items-center justify-between mt-3">
      <span className="text-base font-bold text-primary">{formatCurrency(deal.value)}</span>
      <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">
        {deal.probability}%
      </span>
    </div>
    {deal.secondaryContacts && deal.secondaryContacts.length > 0 && (
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <Users size={12} />
        <span>{deal.secondaryContacts.map(c => `${c.name} (${c.role})`).join(', ')}</span>
      </div>
    )}
  </div>
);

const LossBottomSheet = ({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [selected, setSelected] = useState('');

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-destructive" />
          <h3 className="text-lg font-semibold text-foreground">Motivo da Perda</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Selecione o motivo para registrar a perda do negócio:</p>
        <div className="space-y-2 mb-6">
          {LOSS_REASONS.map(reason => (
            <button
              key={reason}
              onClick={() => setSelected(reason)}
              className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] transition-transform ${
                selected === reason ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {reason}
            </button>
          ))}
        </div>
        <button
          onClick={() => { if (selected) onConfirm(selected); }}
          disabled={!selected}
          className="w-full p-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          Confirmar Perda
        </button>
        <button onClick={onClose} className="w-full mt-2 p-3 text-center text-muted-foreground text-sm">Cancelar</button>
      </div>
    </div>
  );
};

const DealDetailSheet = ({ deal, onClose }: { deal: Deal | null; onClose: () => void }) => {
  if (!deal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{deal.leadName}</h3>
            <p className="text-sm text-muted-foreground">{deal.property}</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95 transition-transform"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-secondary rounded-xl p-3">
            <p className="text-xs text-muted-foreground">Valor</p>
            <p className="text-base font-bold text-primary">{formatCurrency(deal.value)}</p>
          </div>
          <div className="bg-secondary rounded-xl p-3">
            <p className="text-xs text-muted-foreground">Probabilidade</p>
            <p className="text-base font-bold text-foreground">{deal.probability}%</p>
          </div>
          <div className="bg-secondary rounded-xl p-3">
            <p className="text-xs text-muted-foreground">Etapa</p>
            <p className="text-sm font-semibold text-foreground">{deal.stage}</p>
          </div>
          <div className="bg-secondary rounded-xl p-3">
            <p className="text-xs text-muted-foreground">Código</p>
            <p className="text-sm font-semibold text-foreground">{deal.propertyCode}</p>
          </div>
        </div>

        {deal.secondaryContacts && deal.secondaryContacts.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Users size={14} /> Envolvidos
            </h4>
            {deal.secondaryContacts.map((c, i) => (
              <div key={i} className="bg-secondary rounded-lg p-3 mb-1 text-sm text-foreground">
                {c.name} <span className="text-muted-foreground">· {c.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const FunisPage = () => {
  const [activeStage, setActiveStage] = useState<string>('Novos');
  const [groupByLead, setGroupByLead] = useState(false);
  const [lossOpen, setLossOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dealsList] = useState(mockDeals);

  const stageDeals = dealsList.filter(d => d.stage === activeStage);

  const groupedDeals = groupByLead
    ? stageDeals.reduce<Record<string, Deal[]>>((acc, deal) => {
        if (!acc[deal.leadName]) acc[deal.leadName] = [];
        acc[deal.leadName].push(deal);
        return acc;
      }, {})
    : null;

  const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Funis</h1>
          <button
            onClick={() => setGroupByLead(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-medium active:scale-95 transition-transform"
          >
            {groupByLead ? <ToggleRight size={16} className="text-primary" /> : <ToggleLeft size={16} />}
            Por Lead
          </button>
        </div>

        {/* Stage Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
          {STAGES.map(stage => {
            const count = dealsList.filter(d => d.stage === stage).length;
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors active:scale-95 transition-transform ${
                  activeStage === stage ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {stage} <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
          <button
            onClick={() => setLossOpen(true)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium bg-destructive/15 text-destructive active:scale-95 transition-transform"
          >
            Perdido
          </button>
        </div>
      </div>

      {/* Stage Summary */}
      <div className="px-4 py-2">
        <div className="bg-secondary rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{stageDeals.length} negócios nesta etapa</span>
          <span className="text-sm font-bold text-primary">{formatCurrency(stageTotal)}</span>
        </div>
      </div>

      {/* Deal List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-24">
        {groupedDeals ? (
          Object.entries(groupedDeals).map(([leadName, deals]) => (
            <div key={leadName} className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {leadName.split(' ').map(n => n[0]).join('')}
                </div>
                <span className="text-sm font-semibold text-foreground">{leadName}</span>
                <span className="text-xs text-muted-foreground">· {deals.length} negócios</span>
              </div>
              {deals.map(deal => (
                <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal)} />
              ))}
            </div>
          ))
        ) : (
          stageDeals.map(deal => (
            <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal)} />
          ))
        )}
        {stageDeals.length === 0 && (
          <div className="text-center text-muted-foreground mt-12">
            <p className="text-sm">Nenhum negócio nesta etapa</p>
          </div>
        )}
      </div>

      <LossBottomSheet open={lossOpen} onClose={() => setLossOpen(false)} onConfirm={() => setLossOpen(false)} />
      <DealDetailSheet deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
    </div>
  );
};

export default FunisPage;
