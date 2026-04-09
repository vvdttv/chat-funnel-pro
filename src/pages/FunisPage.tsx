import { useState, useMemo } from 'react';
import { deals as mockDeals, funnels, chatMessages, chatThreads, LOSS_REASONS, formatCurrency, Deal } from '@/data/mockData';
import { Users, ChevronRight, ChevronLeft, X, AlertTriangle, Send, Lock, MessageSquare } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ========== VIEW MODE ==========
type ViewMode = 'lead' | 'funnel';

// ========== DEAL CARD (full-width single card) ==========

const DealCard = ({ deal, onClick }: { deal: Deal; onClick: () => void }) => {
  const funnel = funnels.find(f => f.id === deal.funnelId);
  return (
    <div
      onClick={onClick}
      className="bg-card rounded-2xl p-5 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
          {deal.leadName.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{deal.leadName}</p>
          <p className="text-xs text-muted-foreground truncate">{deal.property}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-secondary rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">Valor</p>
          <p className="text-sm font-bold text-primary">{formatCurrency(deal.value)}</p>
        </div>
        <div className="bg-secondary rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground">Probabilidade</p>
          <p className="text-sm font-bold text-foreground">{deal.probability}%</p>
        </div>
      </div>
      {funnel && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">
            {funnel.name}
          </span>
          <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">
            {deal.stage}
          </span>
        </div>
      )}
      {deal.secondaryContacts && deal.secondaryContacts.length > 0 && (
        <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
          <Users size={12} />
          <span>{deal.secondaryContacts.map(c => `${c.name} (${c.role})`).join(', ')}</span>
        </div>
      )}
    </div>
  );
};

// ========== LOSS BOTTOM SHEET ==========

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
              className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
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
          className="w-full p-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm disabled:opacity-40 active:scale-[0.98]"
        >
          Confirmar Perda
        </button>
        <button onClick={onClose} className="w-full mt-2 p-3 text-center text-muted-foreground text-sm">Cancelar</button>
      </div>
    </div>
  );
};

// ========== CHAT VIEW ==========

const DealChatView = ({ deal }: { deal: Deal }) => {
  const [message, setMessage] = useState('');
  const thread = chatThreads.find(t => t.dealId === deal.id);
  const messages = thread ? chatMessages.filter(m => m.threadId === thread.id) : [];

  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquare size={32} className="text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma conversa iniciada</p>
        <p className="text-xs text-muted-foreground mt-1">Inicie pelo WhatsApp para ver aqui</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3 py-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'lead' ? 'justify-start' : msg.sender === 'ai' ? 'justify-center' : 'justify-end'}`}>
            {msg.sender === 'ai' ? (
              <div className="max-w-[90%] rounded-xl p-3 border-2 border-dashed bg-[hsl(270,30%,15%)] border-[hsl(270,40%,35%)]">
                <div className="flex items-center gap-1 mb-1">
                  <Lock size={10} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">🔒 Apenas você vê isso</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed">{msg.content}</p>
              </div>
            ) : (
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                msg.sender === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground border border-border'
              }`}>
                <p className="text-sm">{msg.content}</p>
                <p className={`text-[10px] mt-1 text-right ${msg.sender === 'agent' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{msg.timestamp}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="pt-2">
        <div className="flex items-center gap-2 bg-secondary rounded-full px-4 py-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Mensagem..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button className="p-1.5 rounded-full bg-primary text-primary-foreground active:scale-95 transition-transform">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== DEAL DETAIL SHEET ==========

const DealDetailSheet = ({ deal, onClose }: { deal: Deal | null; onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'conversa'>('info');

  if (!deal) return null;

  const funnel = funnels.find(f => f.id === deal.funnelId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{deal.leadName}</h3>
            <p className="text-sm text-muted-foreground truncate">{deal.property}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-bold text-primary">{formatCurrency(deal.value)}</span>
              {funnel && (
                <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">
                  {funnel.name} · {deal.stage}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95 transition-transform"><X size={20} /></button>
        </div>
        <div className="flex gap-1 mb-4">
          {(['info', 'conversa'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] ${
                activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {tab === 'info' ? 'Detalhes' : 'Conversa'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {activeTab === 'info' ? (
            <>
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
            </>
          ) : (
            <DealChatView deal={deal} />
          )}
        </div>
      </div>
    </div>
  );
};

// ========== STAGE NAVIGATOR ==========

const StageNavigator = ({
  stages,
  activeIndex,
  onPrev,
  onNext,
  dealCount,
}: {
  stages: { name: string; probability: number }[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  dealCount: number;
}) => {
  const stage = stages[activeIndex];
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <button
        onClick={onPrev}
        disabled={activeIndex === 0}
        className="p-2.5 rounded-xl bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="flex-1 text-center">
        <p className="text-sm font-bold text-foreground">{stage.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Etapa {activeIndex + 1} de {stages.length} · {dealCount} {dealCount === 1 ? 'lead' : 'leads'} · {stage.probability}%
        </p>
      </div>
      <button
        onClick={onNext}
        disabled={activeIndex === stages.length - 1}
        className="p-2.5 rounded-xl bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
};

// ========== CARD NAVIGATOR ==========

const CardNavigator = ({
  deals,
  activeIndex,
  onPrev,
  onNext,
  onCardClick,
}: {
  deals: Deal[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onCardClick: (deal: Deal) => void;
}) => {
  if (deals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <Users size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">Nenhum lead nesta etapa</p>
        </div>
      </div>
    );
  }

  const deal = deals[activeIndex];

  return (
    <div className="flex-1 flex flex-col px-4">
      {/* Card counter */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <button
          onClick={onPrev}
          disabled={activeIndex === 0}
          className="p-2 rounded-lg bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-muted-foreground font-medium min-w-[60px] text-center">
          {activeIndex + 1} de {deals.length}
        </span>
        <button
          onClick={onNext}
          disabled={activeIndex === deals.length - 1}
          className="p-2 rounded-lg bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Card */}
      <DealCard deal={deal} onClick={() => onCardClick(deal)} />

      {/* Dots indicator */}
      {deals.length > 1 && deals.length <= 10 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {deals.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${
                i === activeIndex ? 'w-5 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ========== MAIN PAGE ==========

const FunisPage = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('funnel');
  const [activeFunnelId, setActiveFunnelId] = useState(funnels[0].id);
  const [stageIndex, setStageIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [lossOpen, setLossOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dealsList] = useState(mockDeals);

  const activeFunnel = funnels.find(f => f.id === activeFunnelId)!;

  // For "Por Funil": stages from selected funnel, deals filtered by funnel + stage
  const funnelStages = activeFunnel.stages;
  const currentStageName = funnelStages[stageIndex]?.name || '';
  const funnelStageDeals = useMemo(
    () => dealsList.filter(d => d.funnelId === activeFunnelId && d.stage === currentStageName),
    [dealsList, activeFunnelId, currentStageName]
  );

  // For "Por Lead": all unique leads, stages are all unique stages across all funnels for that lead
  const allLeads = useMemo(() => {
    const map = new Map<string, { leadId: string; leadName: string; deals: Deal[] }>();
    dealsList.forEach(d => {
      if (!map.has(d.leadId)) map.set(d.leadId, { leadId: d.leadId, leadName: d.leadName, deals: [] });
      map.get(d.leadId)!.deals.push(d);
    });
    return Array.from(map.values());
  }, [dealsList]);

  const [leadIndex, setLeadIndex] = useState(0);
  const currentLead = allLeads[leadIndex];
  const leadDeals = currentLead?.deals || [];

  // Derived stages and deals based on view mode
  const stages = viewMode === 'funnel' ? funnelStages : [{ name: 'Todos os negócios', probability: 0 }];
  const currentDeals = viewMode === 'funnel' ? funnelStageDeals : leadDeals;

  const stageTotal = currentDeals.reduce((sum, d) => sum + d.value, 0);

  const handleFunnelChange = (funnelId: string) => {
    setActiveFunnelId(funnelId);
    setStageIndex(0);
    setCardIndex(0);
  };

  const handleStageNav = (dir: 'prev' | 'next') => {
    setStageIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(funnelStages.length - 1, i + 1));
    setCardIndex(0);
  };

  const handleCardNav = (dir: 'prev' | 'next') => {
    const max = currentDeals.length - 1;
    if (viewMode === 'lead') {
      // In lead mode, card nav goes to next/prev lead
      setLeadIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(allLeads.length - 1, i + 1));
      setCardIndex(0);
    } else {
      setCardIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(max, i + 1));
    }
  };

  const handleModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setStageIndex(0);
    setCardIndex(0);
    setLeadIndex(0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-foreground">Leads</h1>
          {viewMode === 'funnel' && (
            <Select value={activeFunnelId} onValueChange={handleFunnelChange}>
              <SelectTrigger className="w-auto gap-1.5 h-8 px-3 rounded-lg bg-primary/15 border-primary/30 text-primary text-xs font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {funnels.map(funnel => {
                  const count = dealsList.filter(d => d.funnelId === funnel.id).length;
                  return (
                    <SelectItem key={funnel.id} value={funnel.id}>
                      {funnel.name} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-1 p-1 bg-secondary rounded-xl mb-3">
          <button
            onClick={() => handleModeChange('lead')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors active:scale-[0.98] ${
              viewMode === 'lead' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Por Lead
          </button>
          <button
            onClick={() => handleModeChange('funnel')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors active:scale-[0.98] ${
              viewMode === 'funnel' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Por Funil
          </button>
        </div>
      </div>

      {/* Stage Navigator (funnel mode) or Lead Navigator (lead mode) */}
      {viewMode === 'funnel' ? (
        <>
          <StageNavigator
            stages={funnelStages}
            activeIndex={stageIndex}
            onPrev={() => handleStageNav('prev')}
            onNext={() => handleStageNav('next')}
            dealCount={currentDeals.length}
          />

          {/* Summary bar */}
          <div className="px-4 pb-2">
            <div className="bg-secondary rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{currentDeals.length} leads</span>
              <span className="text-sm font-bold text-primary">{formatCurrency(stageTotal)}</span>
            </div>
          </div>

          {/* Card Navigator */}
          <CardNavigator
            deals={currentDeals}
            activeIndex={Math.min(cardIndex, Math.max(0, currentDeals.length - 1))}
            onPrev={() => handleCardNav('prev')}
            onNext={() => handleCardNav('next')}
            onCardClick={(deal) => setSelectedDeal(deal)}
          />
        </>
      ) : (
        <>
          {/* Lead mode: navigate between leads */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => { setLeadIndex(i => Math.max(0, i - 1)); setCardIndex(0); }}
              disabled={leadIndex === 0}
              className="p-2.5 rounded-xl bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {currentLead?.leadName.split(' ').map(n => n[0]).join('') || '?'}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{currentLead?.leadName || 'Nenhum lead'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Lead {leadIndex + 1} de {allLeads.length} · {leadDeals.length} {leadDeals.length === 1 ? 'negócio' : 'negócios'}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setLeadIndex(i => Math.min(allLeads.length - 1, i + 1)); setCardIndex(0); }}
              disabled={leadIndex === allLeads.length - 1}
              className="p-2.5 rounded-xl bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Summary */}
          <div className="px-4 pb-2">
            <div className="bg-secondary rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{leadDeals.length} negócios</span>
              <span className="text-sm font-bold text-primary">{formatCurrency(leadDeals.reduce((s, d) => s + d.value, 0))}</span>
            </div>
          </div>

          {/* Cards for this lead */}
          <CardNavigator
            deals={leadDeals}
            activeIndex={Math.min(cardIndex, Math.max(0, leadDeals.length - 1))}
            onPrev={() => setCardIndex(i => Math.max(0, i - 1))}
            onNext={() => setCardIndex(i => Math.min(leadDeals.length - 1, i + 1))}
            onCardClick={(deal) => setSelectedDeal(deal)}
          />
        </>
      )}

      <LossBottomSheet open={lossOpen} onClose={() => setLossOpen(false)} onConfirm={() => setLossOpen(false)} />
      <DealDetailSheet deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
    </div>
  );
};

export default FunisPage;