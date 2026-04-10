import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { deals as mockDeals, funnels, chatMessages as initialChatMessages, chatThreads, LOSS_REASONS, formatCurrency, Deal, leads, ACTIVITY_TYPES, LEAD_TEMPERATURES, ChatMessage } from '@/data/mockData';
import { Users, ChevronRight, ChevronLeft, X, AlertTriangle, Send, Lock, MessageSquare, Sparkles, SlidersHorizontal, RotateCcw, Play, Filter, User, CalendarDays, Clock, FileText, Loader2, Paperclip, Image, Mic, Link2, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

// ========== VIEW MODE ==========
type ViewMode = 'lead' | 'funnel';

// ========== LEAD STAGES ==========
const LEAD_STAGES = [
  { name: 'Não lidas pelo corretor', key: 'unread_agent' },
  { name: 'Não lidas pelo cliente', key: 'unread_client' },
  { name: 'Lidas sem resposta do cliente', key: 'no_reply_client' },
  { name: 'Lidas sem resposta do corretor', key: 'no_reply_agent' },
] as const;

type LeadStageKey = typeof LEAD_STAGES[number]['key'];

// Classify a deal into a lead stage based on chat data
function classifyDealLeadStage(deal: Deal): LeadStageKey {
  const thread = chatThreads.find(t => t.dealId === deal.id);
  if (!thread) return 'unread_agent';
  const msgs = chatMessages.filter(m => m.threadId === thread.id).filter(m => m.sender !== 'ai');
  if (msgs.length === 0) return 'unread_agent';
  const last = msgs[msgs.length - 1];
  if (last.sender === 'lead' && thread.unread > 0) return 'unread_agent';
  if (last.sender === 'agent' && thread.unread > 0) return 'unread_client';
  if (last.sender === 'agent') return 'no_reply_client';
  return 'no_reply_agent';
}

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

const DealChatView = ({ deal, onMessageSent }: { deal: Deal; onMessageSent?: () => void }) => {
  const [message, setMessage] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const thread = chatThreads.find(t => t.dealId === deal.id);
  const messages = thread ? chatMessages.filter(m => m.threadId === thread.id) : [];

  // Auto-scroll to bottom on mount and when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquare size={32} className="text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma conversa iniciada</p>
        <p className="text-xs text-muted-foreground mt-1">Inicie pelo WhatsApp para ver aqui</p>
      </div>
    );
  }

  const handleSend = () => {
    if (!message.trim()) return;
    setMessage('');
    if (!aiMode) {
      onMessageSent?.();
    }
    // If aiMode is on, the message goes to AI (mock for now)
    setAiMode(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide space-y-3 py-2">
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
      <div className="pt-2 pb-1">
        {aiMode && (
          <div className="flex items-center gap-1 mb-1.5 px-1">
            <Sparkles size={10} className="text-[hsl(270,60%,65%)]" />
            <span className="text-[10px] text-[hsl(270,60%,65%)] font-medium">Modo IA ativo — sua mensagem será enviada para a IA</span>
          </div>
        )}
        <div className={`flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
          aiMode ? 'bg-[hsl(270,30%,15%)] border-2 border-dashed border-[hsl(270,40%,35%)]' : 'bg-secondary'
        }`}>
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={aiMode ? "Pergunte algo à IA..." : "Mensagem..."}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => setAiMode(!aiMode)}
            className={`p-1.5 rounded-full active:scale-95 transition-all ${
              aiMode ? 'bg-[hsl(270,40%,35%)] text-[hsl(270,80%,85%)]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles size={16} />
          </button>
          <button
            onClick={handleSend}
            className={`p-1.5 rounded-full active:scale-95 transition-all ${
              aiMode ? 'bg-[hsl(270,40%,35%)] text-[hsl(270,80%,85%)]' : 'bg-primary text-primary-foreground'
            }`}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== NEXT STEP POPUP (mandatory) ==========

const NextStepPopup = ({ deal, onConfirm }: { deal: Deal; onConfirm: () => void }) => {
  const [summary, setSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [activityType, setActivityType] = useState('');
  const [activityDate, setActivityDate] = useState('');
  const [activityTime, setActivityTime] = useState('');
  const [activityDesc, setActivityDesc] = useState('');
  const [temperature, setTemperature] = useState('');

  const isValid = summary.trim() !== '' && activityType !== '' && activityDate !== '' && activityTime !== '' && activityDesc.trim() !== '' && temperature !== '';

  const handleAIExtract = () => {
    setAiLoading(true);
    // Mock AI extraction — in production, call Lovable AI edge function
    const thread = chatThreads.find(t => t.dealId === deal.id);
    const msgs = thread ? chatMessages.filter(m => m.threadId === thread.id).filter(m => m.sender !== 'ai') : [];
    const lastMsgs = msgs.slice(-5).map(m => `${m.sender === 'agent' ? 'Corretor' : 'Lead'}: ${m.content}`).join('\n');

    setTimeout(() => {
      const aiSummary = `Conversa com ${deal.leadName} sobre ${deal.property}.\n\nÚltimas mensagens:\n${lastMsgs || 'Sem mensagens recentes.'}\n\nO lead demonstrou interesse e aguarda próximos passos.`;
      setSummary(prev => {
        if (prev.trim()) {
          return `${prev}\n\n--- Resumo IA ---\n${aiSummary}`;
        }
        return aiSummary;
      });
      setAiLoading(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-background/90" />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[92vh] flex flex-col overflow-hidden">
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
        
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Registrar Atendimento</h3>
            <p className="text-[11px] text-muted-foreground">{deal.leadName} · {deal.property}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4">
          {/* Summary section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Resumo do atendimento *</label>
              <button
                onClick={handleAIExtract}
                disabled={aiLoading}
                className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {aiLoading ? 'Extraindo...' : 'Extrair com IA'}
              </button>
            </div>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Descreva o que aconteceu neste atendimento..."
              rows={4}
              className="w-full bg-secondary text-sm text-foreground rounded-xl px-3 py-2.5 outline-none border border-border placeholder:text-muted-foreground resize-none focus:border-primary/50"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Temperatura do lead *</label>
            <div className="flex gap-2">
              {LEAD_TEMPERATURES.map(temp => (
                <button
                  key={temp}
                  onClick={() => setTemperature(temp)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors active:scale-[0.98] ${
                    temperature === temp
                      ? temp === 'Quente' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : temp === 'Morno' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {temp === 'Quente' ? '🔥' : temp === 'Morno' ? '🌤️' : '❄️'} {temp}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground font-medium">PRÓXIMA ATIVIDADE</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Activity type */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Tipo de atividade *</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ACTIVITY_TYPES) as [string, { label: string }][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setActivityType(key)}
                  className={`py-2.5 rounded-xl text-xs font-semibold transition-colors active:scale-[0.98] ${
                    activityType === key ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date and time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <CalendarDays size={12} /> Data *
              </label>
              <input
                type="date"
                value={activityDate}
                onChange={e => setActivityDate(e.target.value)}
                className="w-full bg-secondary text-sm text-foreground rounded-xl px-3 py-2.5 outline-none border border-border focus:border-primary/50"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                <Clock size={12} /> Hora *
              </label>
              <input
                type="time"
                value={activityTime}
                onChange={e => setActivityTime(e.target.value)}
                className="w-full bg-secondary text-sm text-foreground rounded-xl px-3 py-2.5 outline-none border border-border focus:border-primary/50"
              />
            </div>
          </div>

          {/* Activity description */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">O que vai fazer? *</label>
            <textarea
              value={activityDesc}
              onChange={e => setActivityDesc(e.target.value)}
              placeholder="Descreva brevemente a próxima ação..."
              rows={2}
              className="w-full bg-secondary text-sm text-foreground rounded-xl px-3 py-2.5 outline-none border border-border placeholder:text-muted-foreground resize-none focus:border-primary/50"
            />
          </div>
        </div>

        {/* Submit button */}
        <button
          onClick={() => {
            if (isValid) {
              console.log('NextStep:', { dealId: deal.id, summary, activityType, activityDate, activityTime, activityDesc, temperature });
              onConfirm();
            }
          }}
          disabled={!isValid}
          className="w-full mt-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-30 active:scale-[0.98] transition-transform"
        >
          Registrar e Continuar
        </button>
      </div>
    </div>
  );
};

// ========== DEAL DETAIL SHEET ==========

const DealDetailSheet = ({ deal, onClose, onPendingStepChange }: { deal: Deal | null; onClose: () => void; onPendingStepChange?: (pending: boolean) => void }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'conversa'>('conversa');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showNextStep, setShowNextStep] = useState(false);

  // Reset state when deal changes
  useEffect(() => {
    if (deal) {
      setActiveTab('conversa');
      setHasInteracted(false);
      setShowNextStep(false);
    }
  }, [deal?.id]);

  const handleMessageSent = useCallback(() => {
    setHasInteracted(true);
    onPendingStepChange?.(true);
  }, [onPendingStepChange]);

  const handleClose = () => {
    if (hasInteracted) {
      setShowNextStep(true);
    } else {
      onClose();
    }
  };

  const handleNextStepConfirm = () => {
    setShowNextStep(false);
    setHasInteracted(false);
    onPendingStepChange?.(false);
    onClose();
  };

  if (!deal) return null;

  const funnel = funnels.find(f => f.id === deal.funnelId);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 flex flex-col" style={{ bottom: '4rem' }} onClick={handleClose}>
        <div className="absolute inset-0 bg-background" />
        <div className="relative w-full max-w-md mx-auto h-full bg-card flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Compact header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <button onClick={handleClose} className="p-1 text-muted-foreground active:scale-95 transition-transform"><X size={20} /></button>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{deal.leadName}</h3>
              <p className="text-[11px] text-muted-foreground truncate">{deal.property}</p>
            </div>
            <div className="flex gap-1">
              {(['conversa', 'info'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab === 'info' ? 'info' : 'conversa')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                    activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {tab === 'info' ? 'Detalhes' : 'Conversa'}
                </button>
              ))}
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab === 'info' ? (
              <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4">
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
            ) : (
              <div className="flex-1 min-h-0 flex flex-col px-4">
                <DealChatView deal={deal} onMessageSent={handleMessageSent} />
              </div>
            )}
          </div>
        </div>
      </div>
      {showNextStep && <NextStepPopup deal={deal} onConfirm={handleNextStepConfirm} />}
    </>
  );
};

// ========== STAGE NAVIGATOR ==========

const StageNavigator = ({
  stages,
  activeIndex,
  onPrev,
  onNext,
  dealCount,
  subtitle,
}: {
  stages: { name: string }[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  dealCount: number;
  subtitle?: string;
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
          {subtitle || `Etapa ${activeIndex + 1} de ${stages.length} · ${dealCount} ${dealCount === 1 ? 'lead' : 'leads'}`}
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

// ========== AI ANALYSIS PANEL (inline expandable) ==========

const AIAnalysisPanel = ({ deals, open, onClose }: { deals: Deal[]; open: boolean; onClose: () => void }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    setLoading(true);
    setTimeout(() => {
      const leadNames = deals.map(d => d.leadName).join(', ');
      const q = question || 'resumo geral';
      setAnalysis(
        `📋 **Análise: "${q}"**\n\n` +
        `**Leads nesta etapa:** ${leadNames || 'Nenhum'}\n\n` +
        `**O que foi tratado:** Conversas sobre condições de pagamento, visitas e documentação.\n\n` +
        `**Combinados:** Agendamento de visitas pendentes, envio de propostas formais.\n\n` +
        `**Pendências:** ${deals.length > 0 ? `${deals.length} lead(s) aguardando resposta ou ação.` : 'Nenhuma pendência.'}\n\n` +
        `**Sugestão:** Priorize os leads com maior valor de negócio e envie uma mensagem personalizada de retomada.`
      );
      setLoading(false);
    }, 1200);
  };

  if (!open) return null;

  return (
    <div className="px-4 pb-2">
      <div className="bg-card rounded-xl p-3 border border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Análise IA</span>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-1">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setAnalysis(null); }} className="bg-secondary text-[11px] text-foreground rounded-lg px-2 py-1.5 outline-none border border-border w-full" />
            <span className="text-[10px] text-muted-foreground">até</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setAnalysis(null); }} className="bg-secondary text-[11px] text-foreground rounded-lg px-2 py-1.5 outline-none border border-border w-full" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={e => { setQuestion(e.target.value); setAnalysis(null); }}
            placeholder="O que você gostaria de analisar?"
            className="bg-secondary text-xs text-foreground rounded-lg px-2 py-1.5 outline-none border border-border flex-1 placeholder:text-muted-foreground"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || deals.length === 0}
            className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 shrink-0"
          >
            <Play size={14} />
          </button>
        </div>
        {analysis && (
          <div className="bg-secondary rounded-xl p-3">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{analysis}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ========== FILTERS ==========

interface DateRange {
  from: string;
  to: string;
}

type FilterKey =
  | 'responsavel'
  | 'origem'
  | 'atividadesAtrasadas'
  | 'atividadesHoje'
  | 'atividadesAmanha'
  | 'periodoCriacao'
  | 'periodoAtualizacaoCorretor'
  | 'periodoMsgLidaCliente'
  | 'periodoMsgLidaCorretor'
  | 'periodoMsgEnviadaCliente'
  | 'periodoMsgEnviadaCorretor'
  | 'periodoPrimeiraMsgCliente'
  | 'periodoPrimeiraMsgCorretor'
  | 'periodoProximaAtividade'
  | 'periodoUltimaAtividade';

interface FilterOption {
  key: FilterKey;
  label: string;
  type: 'select' | 'toggle' | 'daterange';
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'responsavel', label: 'Usuário atribuído como responsável pelo cliente', type: 'select' },
  { key: 'origem', label: 'Origem de criação do cadastro do cliente', type: 'select' },
  { key: 'atividadesAtrasadas', label: 'Leads com atividades atrasadas/vencidas', type: 'toggle' },
  { key: 'atividadesHoje', label: 'Leads com atividades vencendo hoje', type: 'toggle' },
  { key: 'atividadesAmanha', label: 'Leads com atividades vencendo a partir de amanhã', type: 'toggle' },
  { key: 'periodoCriacao', label: 'Período da criação do cadastro do cliente', type: 'daterange' },
  { key: 'periodoAtualizacaoCorretor', label: 'Período da última atualização por parte do corretor', type: 'daterange' },
  { key: 'periodoMsgLidaCliente', label: 'Período da última mensagem lida pelo cliente', type: 'daterange' },
  { key: 'periodoMsgLidaCorretor', label: 'Período da última mensagem lida pelo corretor', type: 'daterange' },
  { key: 'periodoMsgEnviadaCliente', label: 'Período da última mensagem enviada pelo cliente', type: 'daterange' },
  { key: 'periodoMsgEnviadaCorretor', label: 'Período da última mensagem enviada pelo corretor', type: 'daterange' },
  { key: 'periodoPrimeiraMsgCliente', label: 'Período da primeira mensagem enviada pelo cliente', type: 'daterange' },
  { key: 'periodoPrimeiraMsgCorretor', label: 'Período da primeira mensagem enviada pelo corretor', type: 'daterange' },
  { key: 'periodoProximaAtividade', label: 'Período da próxima atividade agendada pelo corretor', type: 'daterange' },
  { key: 'periodoUltimaAtividade', label: 'Período da última atividade realizada pelo corretor', type: 'daterange' },
];

interface StageFilterState {
  responsavel: string;
  origem: string;
  atividadesAtrasadas: boolean;
  atividadesHoje: boolean;
  atividadesAmanha: boolean;
  periodoCriacao: DateRange;
  periodoAtualizacaoCorretor: DateRange;
  periodoMsgLidaCliente: DateRange;
  periodoMsgLidaCorretor: DateRange;
  periodoMsgEnviadaCliente: DateRange;
  periodoMsgEnviadaCorretor: DateRange;
  periodoPrimeiraMsgCliente: DateRange;
  periodoPrimeiraMsgCorretor: DateRange;
  periodoProximaAtividade: DateRange;
  periodoUltimaAtividade: DateRange;
}

const emptyDateRange: DateRange = { from: '', to: '' };

const defaultFilters: StageFilterState = {
  responsavel: '',
  origem: '',
  atividadesAtrasadas: false,
  atividadesHoje: false,
  atividadesAmanha: false,
  periodoCriacao: emptyDateRange,
  periodoAtualizacaoCorretor: emptyDateRange,
  periodoMsgLidaCliente: emptyDateRange,
  periodoMsgLidaCorretor: emptyDateRange,
  periodoMsgEnviadaCliente: emptyDateRange,
  periodoMsgEnviadaCorretor: emptyDateRange,
  periodoPrimeiraMsgCliente: emptyDateRange,
  periodoPrimeiraMsgCorretor: emptyDateRange,
  periodoProximaAtividade: emptyDateRange,
  periodoUltimaAtividade: emptyDateRange,
};

const ORIGENS = [...new Set(leads.map(l => l.origin))];

const isFilterActive = (filters: StageFilterState, key: FilterKey): boolean => {
  const val = filters[key];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val !== '';
  return (val as DateRange).from !== '' || (val as DateRange).to !== '';
};

const StageFilters = ({ filters, onChange }: { filters: StageFilterState; onChange: (f: StageFilterState) => void }) => {
  const [selectedFilter, setSelectedFilter] = useState<FilterKey | ''>('');
  const [draftDateRange, setDraftDateRange] = useState<DateRange>(emptyDateRange);

  const activeCount = FILTER_OPTIONS.filter(o => isFilterActive(filters, o.key)).length;
  const selectedOption = FILTER_OPTIONS.find(o => o.key === selectedFilter);

  const handleSelectFilter = (key: string) => {
    if (!key) { setSelectedFilter(''); return; }
    const opt = FILTER_OPTIONS.find(o => o.key === key)!;
    if (opt.type === 'toggle') {
      onChange({ ...filters, [key]: !(filters[key as keyof StageFilterState]) });
      setSelectedFilter('');
    } else {
      setSelectedFilter(key as FilterKey);
      if (opt.type === 'daterange') {
        setDraftDateRange(filters[key as keyof StageFilterState] as DateRange);
      }
    }
  };

  const handleApplyDateRange = () => {
    if (selectedFilter && selectedOption?.type === 'daterange') {
      onChange({ ...filters, [selectedFilter]: draftDateRange });
      setSelectedFilter('');
      setDraftDateRange(emptyDateRange);
    }
  };

  return (
    <div className="px-4 pb-2">
      <div className="bg-card rounded-xl p-3 border border-border space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={14} className="text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Filtros</span>
            {activeCount > 0 && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold leading-none">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              onClick={() => { onChange(defaultFilters); setSelectedFilter(''); }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground active:scale-95"
            >
              <RotateCcw size={10} /> Limpar
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {FILTER_OPTIONS.filter(o => isFilterActive(filters, o.key)).map(o => {
              const val = filters[o.key];
              let displayVal = '';
              if (o.type === 'toggle') displayVal = 'Sim';
              else if (o.type === 'select') displayVal = val as string;
              else {
                const dr = val as DateRange;
                displayVal = [dr.from, dr.to].filter(Boolean).join(' → ');
              }
              return (
                <button
                  key={o.key}
                  onClick={() => {
                    if (o.type === 'toggle') onChange({ ...filters, [o.key]: false });
                    else if (o.type === 'select') onChange({ ...filters, [o.key]: '' });
                    else onChange({ ...filters, [o.key]: emptyDateRange });
                  }}
                  className="flex items-center gap-1 bg-primary/15 text-primary text-[10px] px-2 py-1 rounded-lg font-medium active:scale-95"
                >
                  <span className="truncate max-w-[140px]">{o.label.split(' ').slice(0, 4).join(' ')}: {displayVal}</span>
                  <X size={10} className="shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Filter dropdown */}
        <select
          value={selectedFilter}
          onChange={e => handleSelectFilter(e.target.value)}
          className="w-full bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2.5 outline-none border border-border"
        >
          <option value="">Selecione um filtro...</option>
          {FILTER_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>
              {isFilterActive(filters, o.key) ? '✓ ' : ''}{o.label}
            </option>
          ))}
        </select>

        {/* Select input: Responsável */}
        {selectedOption?.type === 'select' && selectedFilter === 'responsavel' && (
          <select
            value={filters.responsavel}
            onChange={e => onChange({ ...filters, responsavel: e.target.value })}
            className="w-full bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border"
          >
            <option value="">Todos</option>
            <option value="João Silva">João Silva</option>
            <option value="Maria Oliveira">Maria Oliveira</option>
            <option value="Pedro Santos">Pedro Santos</option>
          </select>
        )}

        {/* Select input: Origem */}
        {selectedOption?.type === 'select' && selectedFilter === 'origem' && (
          <select
            value={filters.origem}
            onChange={e => onChange({ ...filters, origem: e.target.value })}
            className="w-full bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border"
          >
            <option value="">Todas</option>
            {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {/* Date range input */}
        {selectedOption?.type === 'daterange' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-1">De</p>
                <input
                  type="date"
                  value={draftDateRange.from}
                  onChange={e => setDraftDateRange(prev => ({ ...prev, from: e.target.value }))}
                  className="w-full bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border focus:border-primary/50"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-1">Até</p>
                <input
                  type="date"
                  value={draftDateRange.to}
                  onChange={e => setDraftDateRange(prev => ({ ...prev, to: e.target.value }))}
                  className="w-full bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border focus:border-primary/50"
                />
              </div>
            </div>
            <button
              onClick={handleApplyDateRange}
              disabled={!draftDateRange.from && !draftDateRange.to}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.98] disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ========== MAIN PAGE ==========

const FunisPage = ({ onPendingStepChange }: { onPendingStepChange?: (pending: boolean) => void }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('lead');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [activeFunnelId, setActiveFunnelId] = useState(funnels[0].id);
  const [stageIndex, setStageIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [lossOpen, setLossOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dealsList] = useState(mockDeals);
  const [stageFilters, setStageFilters] = useState<StageFilterState>(defaultFilters);

  const closePanels = () => { setFiltersOpen(false); setAiOpen(false); };
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen && !aiOpen) return;
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        closePanels();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filtersOpen, aiOpen]);


  const activeFunnel = funnels.find(f => f.id === activeFunnelId)!;

  // ===== POR FUNIL =====
  const funnelStages = activeFunnel.stages;
  const currentStageName = funnelStages[stageIndex]?.name || '';
  const funnelStageDeals = useMemo(
    () => dealsList.filter(d => d.funnelId === activeFunnelId && d.stage === currentStageName),
    [dealsList, activeFunnelId, currentStageName]
  );

  // ===== POR LEAD =====
  const leadStageDeals = useMemo(() => {
    const grouped: Record<LeadStageKey, Deal[]> = {
      unread_agent: [],
      unread_client: [],
      no_reply_client: [],
      no_reply_agent: [],
    };
    dealsList.forEach(d => {
      const key = classifyDealLeadStage(d);
      grouped[key].push(d);
    });
    return grouped;
  }, [dealsList]);

  const [leadStageIndex, setLeadStageIndex] = useState(0);
  const [leadCardIndex, setLeadCardIndex] = useState(0);
  const currentLeadStage = LEAD_STAGES[leadStageIndex];
  const currentLeadDeals = leadStageDeals[currentLeadStage.key];

  // Handlers
  const handleFunnelChange = (funnelId: string) => {
    setActiveFunnelId(funnelId);
    setStageIndex(0);
    setCardIndex(0);
  };

  const handleStageNav = (dir: 'prev' | 'next') => {
    if (viewMode === 'funnel') {
      setStageIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(funnelStages.length - 1, i + 1));
      setCardIndex(0);
    } else {
      setLeadStageIndex(i => dir === 'prev' ? Math.max(0, i - 1) : Math.min(LEAD_STAGES.length - 1, i + 1));
      setLeadCardIndex(0);
    }
  };

  const handleModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setStageIndex(0);
    setCardIndex(0);
    setLeadStageIndex(0);
    setLeadCardIndex(0);
  };

  // Current view data
  const stages = viewMode === 'funnel'
    ? funnelStages.map(s => ({ name: s.name }))
    : LEAD_STAGES.map(s => ({ name: s.name }));
  const activeStageIdx = viewMode === 'funnel' ? stageIndex : leadStageIndex;
  const currentDeals = viewMode === 'funnel' ? funnelStageDeals : currentLeadDeals;
  const activeCardIdx = viewMode === 'funnel' ? cardIndex : leadCardIndex;
  const stageTotal = currentDeals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col h-full relative">
      {/* Toolbar + panels */}
      <div ref={toolbarRef}>
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleModeChange(viewMode === 'lead' ? 'funnel' : 'lead')}
              className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center active:scale-95 transition-transform shrink-0"
              title={viewMode === 'lead' ? 'Por Lead' : 'Por Funil'}
            >
              {viewMode === 'lead' ? <User size={18} className="text-primary" /> : <Filter size={18} className="text-primary" />}
            </button>

            {viewMode === 'funnel' && (
              <Select value={activeFunnelId} onValueChange={handleFunnelChange}>
                <SelectTrigger className="flex-1 gap-1.5 h-10 px-3 rounded-xl bg-card border-border text-xs font-semibold">
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

            {viewMode === 'lead' && <div className="flex-1 min-h-[40px]" onMouseDown={(e) => { e.preventDefault(); closePanels(); }} />}

            <button
              onClick={() => { setFiltersOpen(v => !v); setAiOpen(false); }}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-95 transition-transform shrink-0 ${
                filtersOpen ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border text-muted-foreground'
              }`}
            >
              <SlidersHorizontal size={18} />
            </button>

            <button
              onClick={() => { setAiOpen(v => !v); setFiltersOpen(false); }}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-95 transition-transform shrink-0 ${
                aiOpen ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border text-muted-foreground'
              }`}
            >
              <Sparkles size={18} />
            </button>
          </div>
        </div>

        {filtersOpen && <StageFilters filters={stageFilters} onChange={setStageFilters} />}
        <AIAnalysisPanel deals={currentDeals} open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>

      {/* Stage Navigator */}
      <StageNavigator
        stages={stages}
        activeIndex={activeStageIdx}
        onPrev={() => handleStageNav('prev')}
        onNext={() => handleStageNav('next')}
        dealCount={currentDeals.length}
        subtitle={`${activeStageIdx + 1}/${stages.length} · ${currentDeals.length} ${currentDeals.length === 1 ? 'lead' : 'leads'} · ${formatCurrency(stageTotal)}`}
      />

      {/* Card Navigator */}
      <CardNavigator
        deals={currentDeals}
        activeIndex={Math.min(activeCardIdx, Math.max(0, currentDeals.length - 1))}
        onPrev={() => {
          if (viewMode === 'funnel') setCardIndex(i => Math.max(0, i - 1));
          else setLeadCardIndex(i => Math.max(0, i - 1));
        }}
        onNext={() => {
          if (viewMode === 'funnel') setCardIndex(i => Math.min(funnelStageDeals.length - 1, i + 1));
          else setLeadCardIndex(i => Math.min(currentLeadDeals.length - 1, i + 1));
        }}
        onCardClick={(deal) => setSelectedDeal(deal)}
      />

      <LossBottomSheet open={lossOpen} onClose={() => setLossOpen(false)} onConfirm={() => setLossOpen(false)} />
      <DealDetailSheet deal={selectedDeal} onClose={() => setSelectedDeal(null)} onPendingStepChange={onPendingStepChange} />
    </div>
  );
};

export default FunisPage;
