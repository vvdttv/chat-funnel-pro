import { useState, useMemo } from 'react';
import { deals as mockDeals, funnels, chatMessages, chatThreads, LOSS_REASONS, formatCurrency, Deal, leads } from '@/data/mockData';
import { Users, ChevronRight, ChevronLeft, X, AlertTriangle, Send, Lock, MessageSquare, Sparkles, Filter, ChevronDown, ChevronUp, RotateCcw, Play, GitBranch, User } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [period, setPeriod] = useState('7');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    setLoading(true);
    setTimeout(() => {
      const leadNames = deals.map(d => d.leadName).join(', ');
      setAnalysis(
        `📋 **Resumo (últimos ${period} dias)**\n\n` +
        `**Leads nesta etapa:** ${leadNames || 'Nenhum'}\n\n` +
        `**O que foi tratado:** Conversas sobre condições de pagamento, visitas e documentação.\n\n` +
        `**Combinados:** Agendamento de visitas pendentes, envio de propostas formais.\n\n` +
        `**Pendências:** ${deals.length > 0 ? `${deals.length} lead(s) aguardando resposta ou ação.` : 'Nenhuma pendência.'}\n\n` +
        `**Próximos passos:** Retomar contato com leads sem resposta, enviar materiais complementares.\n\n` +
        `**Sugestão:** Priorize os leads com maior valor de negócio e envie uma mensagem personalizada de retomada.`
      );
      setLoading(false);
    }, 1200);
  };

  if (!open) return null;

  return (
    <div className="px-4 pb-2">
      <div className="bg-card rounded-xl p-3 border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Análise IA</span>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); setAnalysis(null); }}
            className="bg-secondary text-xs text-foreground rounded-lg px-2 py-1.5 outline-none border border-border flex-1"
          >
            <option value="1">1 dia</option>
            <option value="3">3 dias</option>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
          </select>
          <button
            onClick={handleAnalyze}
            disabled={loading || deals.length === 0}
            className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 shrink-0"
          >
            <Play size={16} />
          </button>
        </div>
        {analysis && (
          <div className="bg-secondary rounded-xl p-3 mt-2">
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

const DateRangeInput = ({ label, value, onChange }: { label: string; value: DateRange; onChange: (v: DateRange) => void }) => (
  <div>
    <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">{label}</p>
    <div className="flex gap-2">
      <input
        type="date"
        value={value.from}
        onChange={e => onChange({ ...value, from: e.target.value })}
        className="flex-1 bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border focus:border-primary/50"
      />
      <input
        type="date"
        value={value.to}
        onChange={e => onChange({ ...value, to: e.target.value })}
        className="flex-1 bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border focus:border-primary/50"
      />
    </div>
  </div>
);

const StageFilters = ({ filters, onChange }: { filters: StageFilterState; onChange: (f: StageFilterState) => void }) => {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.responsavel,
    filters.origem,
    filters.atividadesAtrasadas,
    filters.atividadesHoje,
    filters.atividadesAmanha,
    filters.periodoCriacao.from || filters.periodoCriacao.to,
    filters.periodoAtualizacaoCorretor.from || filters.periodoAtualizacaoCorretor.to,
    filters.periodoMsgLidaCliente.from || filters.periodoMsgLidaCliente.to,
    filters.periodoMsgLidaCorretor.from || filters.periodoMsgLidaCorretor.to,
    filters.periodoMsgEnviadaCliente.from || filters.periodoMsgEnviadaCliente.to,
    filters.periodoMsgEnviadaCorretor.from || filters.periodoMsgEnviadaCorretor.to,
    filters.periodoPrimeiraMsgCliente.from || filters.periodoPrimeiraMsgCliente.to,
    filters.periodoPrimeiraMsgCorretor.from || filters.periodoPrimeiraMsgCorretor.to,
    filters.periodoProximaAtividade.from || filters.periodoProximaAtividade.to,
    filters.periodoUltimaAtividade.from || filters.periodoUltimaAtividade.to,
  ].filter(Boolean).length;

  return (
    <div className="px-4 pb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full bg-card rounded-xl px-4 py-2.5 active:scale-[0.98] transition-transform border border-border"
      >
        <Filter size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground flex-1 text-left">Filtros</span>
        {activeCount > 0 && (
          <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold">
            {activeCount}
          </span>
        )}
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="bg-card rounded-xl mt-2 p-4 border border-border space-y-4 max-h-[50vh] overflow-y-auto scrollbar-hide">
          {/* Reset */}
          <div className="flex justify-end">
            <button
              onClick={() => onChange(defaultFilters)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground active:scale-95"
            >
              <RotateCcw size={10} /> Limpar filtros
            </button>
          </div>

          {/* Responsável */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Responsável</p>
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
          </div>

          {/* Origem */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Origem</p>
            <select
              value={filters.origem}
              onChange={e => onChange({ ...filters, origem: e.target.value })}
              className="w-full bg-secondary text-foreground text-xs rounded-lg px-2.5 py-2 outline-none border border-border"
            >
              <option value="">Todas</option>
              {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Atividades checkboxes */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground font-medium">Atividades</p>
            {[
              { key: 'atividadesAtrasadas' as const, label: 'Com atividades atrasadas/vencidas' },
              { key: 'atividadesHoje' as const, label: 'Com atividades vencendo hoje' },
              { key: 'atividadesAmanha' as const, label: 'Com atividades a partir de amanhã' },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-2 active:scale-[0.98]">
                <div
                  onClick={() => onChange({ ...filters, [item.key]: !filters[item.key] })}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    filters[item.key] ? 'bg-primary border-primary' : 'border-border bg-secondary'
                  }`}
                >
                  {filters[item.key] && <span className="text-primary-foreground text-[10px]">✓</span>}
                </div>
                <span className="text-xs text-foreground">{item.label}</span>
              </label>
            ))}
          </div>

          {/* Date range filters */}
          <DateRangeInput label="Período da criação do cadastro" value={filters.periodoCriacao} onChange={v => onChange({ ...filters, periodoCriacao: v })} />
          <DateRangeInput label="Última atualização pelo corretor" value={filters.periodoAtualizacaoCorretor} onChange={v => onChange({ ...filters, periodoAtualizacaoCorretor: v })} />
          <DateRangeInput label="Última msg lida pelo cliente" value={filters.periodoMsgLidaCliente} onChange={v => onChange({ ...filters, periodoMsgLidaCliente: v })} />
          <DateRangeInput label="Última msg lida pelo corretor" value={filters.periodoMsgLidaCorretor} onChange={v => onChange({ ...filters, periodoMsgLidaCorretor: v })} />
          <DateRangeInput label="Última msg enviada pelo cliente" value={filters.periodoMsgEnviadaCliente} onChange={v => onChange({ ...filters, periodoMsgEnviadaCliente: v })} />
          <DateRangeInput label="Última msg enviada pelo corretor" value={filters.periodoMsgEnviadaCorretor} onChange={v => onChange({ ...filters, periodoMsgEnviadaCorretor: v })} />
          <DateRangeInput label="Primeira msg enviada pelo cliente" value={filters.periodoPrimeiraMsgCliente} onChange={v => onChange({ ...filters, periodoPrimeiraMsgCliente: v })} />
          <DateRangeInput label="Primeira msg enviada pelo corretor" value={filters.periodoPrimeiraMsgCorretor} onChange={v => onChange({ ...filters, periodoPrimeiraMsgCorretor: v })} />
          <DateRangeInput label="Próxima atividade agendada" value={filters.periodoProximaAtividade} onChange={v => onChange({ ...filters, periodoProximaAtividade: v })} />
          <DateRangeInput label="Última atividade realizada" value={filters.periodoUltimaAtividade} onChange={v => onChange({ ...filters, periodoUltimaAtividade: v })} />
        </div>
      )}
    </div>
  );
};

// ========== MAIN PAGE ==========

const FunisPage = () => {
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
    <div className="flex flex-col h-full">
      {/* Toolbar row */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <button
            onClick={() => handleModeChange(viewMode === 'lead' ? 'funnel' : 'lead')}
            className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center active:scale-95 transition-transform shrink-0"
            title={viewMode === 'lead' ? 'Por Lead' : 'Por Funil'}
          >
            {viewMode === 'lead' ? <User size={18} className="text-primary" /> : <GitBranch size={18} className="text-primary" />}
          </button>

          {/* Funnel selector (only in funnel mode) */}
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

          {viewMode === 'lead' && <div className="flex-1" />}

          {/* Filter toggle */}
          <button
            onClick={() => { setFiltersOpen(v => !v); setAiOpen(false); }}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-95 transition-transform shrink-0 ${
              filtersOpen ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            <Filter size={18} />
          </button>

          {/* AI toggle */}
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

      {/* Expandable Filters */}
      {filtersOpen && <StageFilters filters={stageFilters} onChange={setStageFilters} />}

      {/* Expandable AI */}
      <AIAnalysisPanel deals={currentDeals} open={aiOpen} onClose={() => setAiOpen(false)} />

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
      <DealDetailSheet deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
    </div>
  );
};

export default FunisPage;
