import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { chatMessages, chatThreads, LOSS_REASONS, formatCurrency, Deal, leads, ACTIVITY_TYPES, LEAD_TEMPERATURES, getDealDaysInStage } from '@/data/mockData';
import { useDealsContext } from '@/hooks/useDeals';
import { Users, ChevronRight, ChevronLeft, X, AlertTriangle, Send, Lock, MessageSquare, Sparkles, SlidersHorizontal, RotateCcw, Play, Filter, User, CalendarDays, Clock, FileText, Loader2, Paperclip, Image as ImageIcon, Mic, Plus, UserCog } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCardWidgets } from '@/hooks/useCardWidgets';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { useAuth } from '@/hooks/useAuth';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useToast } from '@/hooks/use-toast';
import type { CardWidget } from '@/components/CardWidgetConfig';
import { RegisterActivityPopup } from '@/components/RegisterActivityPopup';
import { DealActivityOverlay } from '@/components/DealActivityOverlay';
import { inferForcedStep, type ForcedStep } from '@/lib/activityBlocking';

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

const DealCardWidget = ({ widget, deal, compact }: { widget: CardWidget; deal: Deal; compact?: boolean }) => {
  const { funnels } = useFunnelsContext();
  const funnel = funnels.find(f => f.id === deal.funnelId);
  const getValue = (): string => {
    switch (widget.id) {
      case 'avatar_name': return deal.leadName;
      case 'property': return deal.property;
      case 'value': return formatCurrency(deal.value);
      case 'probability': return `${deal.probability}%`;
      case 'funnel_badge': return funnel?.name || '—';
      case 'stage_badge': return deal.stage;
      case 'contacts': return deal.secondaryContacts?.map(c => `${c.name} (${c.role})`).join(', ') || '';
      case 'phone': return '(11) 99999-0000';
      case 'origin': return 'Site';
      case 'created_at': return deal.createdAt;
      case 'property_code': return deal.propertyCode;
      case 'deal_id': return deal.id;
      case 'lead_id': return deal.leadId;
      case 'last_msg_lead': return '10/04 14:32';
      case 'last_msg_broker': return '10/04 15:10';
      case 'last_chat_msg': return 'Olá, gostaria de agendar uma visita';
      case 'last_stage_update': return '09/04/2026';
      case 'current_stage': return deal.stage;
      case 'opportunity_status': return 'Em andamento';
      case 'assigned_user': return 'Não atribuído';
      case 'first_msg_lead': return '01/03 09:15';
      case 'first_msg_broker': return '01/03 10:00';
      default: return '—';
    }
  };
  const val = getValue();
  if (!val) return null;

  if (widget.type === 'header') {
    return (
      <div className="flex items-center gap-1.5">
        <div className={`${compact ? 'w-6 h-6 text-[8px]' : 'w-8 h-8 text-xs'} rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary shrink-0`}>
          {deal.leadName.split(' ').map(n => n[0]).join('')}
        </div>
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground truncate`}>{val}</p>
      </div>
    );
  }
  if (widget.type === 'stat') {
    return (
      <div className={`bg-secondary rounded-lg ${compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5'}`}>
        <p className={`${compact ? 'text-[7px]' : 'text-[9px]'} text-muted-foreground uppercase tracking-wider`}>{widget.label}</p>
        <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold text-primary mt-0.5 truncate`}>{val}</p>
      </div>
    );
  }
  if (widget.type === 'badge') {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <span className={`${compact ? 'text-[7px]' : 'text-[9px]'} text-muted-foreground shrink-0`}>{widget.label}:</span>
        <span className={`${compact ? 'text-[8px] px-1.5' : 'text-[10px] px-2'} bg-primary/15 text-primary py-0.5 rounded-full font-medium truncate`}>{val}</span>
      </div>
    );
  }
  if (widget.type === 'contacts') {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <Users size={compact ? 9 : 11} className="text-muted-foreground shrink-0" />
        <span className={`${compact ? 'text-[7px]' : 'text-[9px]'} text-muted-foreground shrink-0`}>{widget.label}:</span>
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-foreground truncate`}>{val}</span>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className={`${compact ? 'text-[7px]' : 'text-[9px]'} text-muted-foreground uppercase tracking-wider`}>{widget.label}</p>
      <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-foreground mt-0.5 truncate`}>{val}</p>
    </div>
  );
};

const DealCard = ({ deal, onClick, widgets }: { deal: Deal; onClick: () => void; widgets: CardWidget[] }) => {
  const { funnels } = useFunnelsContext();
  const { isAdmin } = useAuth();
  const { members } = useOrgMembers();
  const enabled = widgets.filter(w => w.enabled);
  const compact = enabled.length > 7;
  const funnel = funnels.find(f => f.id === deal.funnelId);
  const stage = funnel?.stages.find(s => s.name === deal.stage);
  const daysInStage = getDealDaysInStage(deal);
  const overdue = stage ? daysInStage > stage.maxDaysInStage : false;
  const owner = isAdmin && deal.assignedTo ? members.find(m => m.user_id === deal.assignedTo) : null;
  const ownerLabel = owner ? (owner.display_name || owner.username) : null;
  const ownerInitials = ownerLabel
    ? ownerLabel.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join('')
    : '';
  return (
    <div
      onClick={onClick}
      className={`relative bg-card rounded-2xl ${compact ? 'p-2.5' : 'p-4'} active:scale-[0.98] transition-transform flex-1 min-h-0 flex flex-col ${overdue ? 'ring-1 ring-destructive/50' : ''}`}
    >
      {(isAdmin && (ownerLabel || deal.assignedTo === null)) && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-secondary/90 backdrop-blur-sm border border-border rounded-full pl-0.5 pr-2 py-0.5 max-w-[60%]">
          {ownerLabel ? (
            <>
              <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary shrink-0">
                {ownerInitials}
              </div>
              <span className="text-[9px] font-medium text-muted-foreground truncate">{ownerLabel}</span>
            </>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-warning/20 flex items-center justify-center text-warning shrink-0">
                <UserCog size={9} />
              </div>
              <span className="text-[9px] font-medium text-warning">sem dono</span>
            </>
          )}
        </div>
      )}
      {overdue && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full text-[9px] font-semibold z-10">
          <AlertTriangle size={9} /> atrasado
        </div>
      )}
      <div className={`grid grid-cols-2 ${compact ? 'gap-1' : 'gap-2'} flex-1 min-h-0 auto-rows-fr ${isAdmin ? 'pt-4' : ''}`}>
        {enabled.map(w => (
          <div key={w.id} className={`${w.size === 'full' ? 'col-span-2' : 'col-span-1'} min-h-0 flex flex-col justify-center`}>
            <DealCardWidget widget={w} deal={deal} compact={compact} />
          </div>
        ))}
      </div>
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

// ========== ATTACHMENT TYPE ==========
type Attachment = {
  type: 'image' | 'audio' | 'file';
  name: string;
  dataUrl?: string;
  file?: File;
};

// ========== LOCAL MESSAGE TYPE ==========
interface AIProvenance {
  archetypeCode: string | null;
  statusOverlayCode: string | null;
  overrideIds: string[];
  contextTags: string[];
  dealStatus: 'open' | 'won' | 'lost';
  appliedRuleCodes?: string[];
}

type LocalMessage = {
  id: string;
  sender: 'agent' | 'lead' | 'ai';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  /** Sprint 9: proveniência composicional retornada pela edge `ai-chat-analysis` */
  provenance?: AIProvenance | null;
};

// ========== CHAT VIEW ==========

const DealChatView = ({ deal, onMessageSent }: { deal: Deal; onMessageSent?: () => void }) => {
  const { funnels } = useFunnelsContext();
  const [message, setMessage] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const now = new Date();
          const name = `audio_${now.getHours()}${now.getMinutes()}${now.getSeconds()}.webm`;
          setAttachments(prev => [...prev, {
            type: 'audio',
            name,
            dataUrl: reader.result as string,
            file: new File([audioBlob], name, { type: 'audio/webm' }),
          }]);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const thread = chatThreads.find(t => t.dealId === deal.id);
  const baseMessages = thread ? chatMessages.filter(m => m.threadId === thread.id) : [];

  const allMessages = [
    ...baseMessages.map(m => ({
      ...m,
      attachments: undefined as Attachment[] | undefined,
      provenance: undefined as AIProvenance | null | undefined,
    })),
    ...localMessages,
  ];

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages.length, aiLoading]);

  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquare size={32} className="text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma conversa iniciada</p>
        <p className="text-xs text-muted-foreground mt-1">Inicie pelo WhatsApp para ver aqui</p>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'audio' | 'file') => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(prev => [...prev, {
          type,
          name: file.name,
          dataUrl: reader.result as string,
          file,
        }]);
      };
      reader.readAsDataURL(file);
    });
    setShowAttachMenu(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!message.trim() && attachments.length === 0) return;
    const msgText = message.trim();
    const currentAttachments = [...attachments];
    setMessage('');
    setAttachments([]);
    setShowAttachMenu(false);

    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (aiMode) {
      // Add user question as agent message with AI indicator
      const userMsgId = `local-${Date.now()}`;
      setLocalMessages(prev => [...prev, {
        id: userMsgId,
        sender: 'agent',
        content: `🤖 ${msgText}`,
        timestamp,
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      }]);

      setAiLoading(true);
      try {
        const funnel = funnels.find(f => f.id === deal.funnelId);
        // Resolve stageId real (Deal.stage guarda o nome legível)
        const stageId = funnel?.stages.find(s => s.name === deal.stage)?.id ?? null;
        const { data, error } = await supabase.functions.invoke('ai-chat-analysis', {
          body: {
            messages: allMessages.map(m => ({
              sender: m.sender,
              content: m.content,
              timestamp: m.timestamp,
            })),
            userQuestion: msgText,
            dealContext: {
              leadName: deal.leadName,
              property: deal.property,
              value: formatCurrency(deal.value),
              stage: deal.stage,
              funnel: funnel?.name || '',
              // Sprint 9: contexto composicional
              dealId: deal.id,
              funnelId: deal.funnelId,
              stageId: stageId ?? undefined,
            },
            attachments: currentAttachments.map(a => ({
              type: a.type,
              name: a.name,
              dataUrl: a.type === 'image' ? a.dataUrl : undefined,
              description: a.type === 'audio' ? 'Áudio enviado pelo corretor' :
                           a.type === 'file' ? `Arquivo: ${a.name}` : undefined,
            })),
          },
        });

        if (error) throw error;

        const aiMsgId = `ai-${Date.now()}`;
        setLocalMessages(prev => [...prev, {
          id: aiMsgId,
          sender: 'ai',
          content: data.response || data.error || 'Erro ao processar',
          timestamp,
          provenance: (data?.provenance ?? null) as AIProvenance | null,
        }]);
      } catch (err) {
        console.error('AI error:', err);
        setLocalMessages(prev => [...prev, {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          content: '❌ Erro ao consultar a IA. Tente novamente.',
          timestamp,
        }]);
      } finally {
        setAiLoading(false);
        setAiMode(false);
      }
    } else {
      // Normal message
      setLocalMessages(prev => [...prev, {
        id: `local-${Date.now()}`,
        sender: 'agent',
        content: msgText,
        timestamp,
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      }]);
      onMessageSent?.();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'image')} multiple />
      <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={e => handleFileSelect(e, 'audio')} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFileSelect(e, 'file')} multiple />

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide space-y-3 py-2">
        {allMessages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'lead' ? 'justify-start' : msg.sender === 'ai' ? 'justify-center' : 'justify-end'}`}>
            {msg.sender === 'ai' ? (
              <div className="max-w-[90%] rounded-xl p-3 border-2 border-dashed bg-[hsl(270,30%,15%)] border-[hsl(270,40%,35%)]">
                <div className="flex items-center gap-1 mb-1">
                  <Lock size={10} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">🔒 Apenas você vê isso</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                {msg.provenance && (
                  <div className="mt-2 pt-2 border-t border-[hsl(270,40%,30%)] flex flex-wrap gap-1">
                    {msg.provenance.archetypeCode && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(270,50%,25%)] text-[hsl(270,70%,80%)]" title="Arquétipo de etapa">
                        🧬 {msg.provenance.archetypeCode}
                      </span>
                    )}
                    {msg.provenance.statusOverlayCode && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(40,50%,25%)] text-[hsl(40,80%,75%)]" title="Overlay de status">
                        🎭 {msg.provenance.statusOverlayCode}
                      </span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      msg.provenance.dealStatus === 'won' ? 'bg-[hsl(140,50%,20%)] text-[hsl(140,70%,75%)]' :
                      msg.provenance.dealStatus === 'lost' ? 'bg-[hsl(0,50%,25%)] text-[hsl(0,70%,80%)]' :
                      'bg-secondary text-muted-foreground'
                    }`} title="Status do deal">
                      {msg.provenance.dealStatus}
                    </span>
                    {msg.provenance.contextTags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(200,40%,20%)] text-[hsl(200,70%,80%)]" title="Context tag">
                        #{tag}
                      </span>
                    ))}
                    {msg.provenance.contextTags.length > 3 && (
                      <span className="text-[9px] text-muted-foreground" title={msg.provenance.contextTags.slice(3).join(', ')}>
                        +{msg.provenance.contextTags.length - 3}
                      </span>
                    )}
                    {msg.provenance.overrideIds.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(320,40%,25%)] text-[hsl(320,70%,80%)]" title={msg.provenance.overrideIds.join(' | ')}>
                        ⚙️ {msg.provenance.overrideIds.length} override{msg.provenance.overrideIds.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {msg.provenance.appliedRuleCodes && msg.provenance.appliedRuleCodes.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground" title={msg.provenance.appliedRuleCodes.join(', ')}>
                        📜 {msg.provenance.appliedRuleCodes.length} regras
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                msg.sender === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground border border-border'
              }`}>
                {/* Attachments preview */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-1.5 space-y-1">
                    {msg.attachments.map((att, i) => (
                      <div key={i}>
                        {att.type === 'image' && att.dataUrl && (
                          <img src={att.dataUrl} alt={att.name} className="rounded-lg max-w-full max-h-40 object-cover" />
                        )}
                        {att.type === 'audio' && (
                          <div className="flex items-center gap-1.5 text-xs opacity-80">
                            <Mic size={12} /> {att.name}
                          </div>
                        )}
                        {att.type === 'file' && (
                          <div className="flex items-center gap-1.5 text-xs opacity-80">
                            <Paperclip size={12} /> {att.name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-sm">{msg.content}</p>
                <p className={`text-[10px] mt-1 text-right ${msg.sender === 'agent' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{msg.timestamp}</p>
              </div>
            )}
          </div>
        ))}
        {aiLoading && (
          <div className="flex justify-center">
            <div className="rounded-xl p-3 border-2 border-dashed bg-[hsl(270,30%,15%)] border-[hsl(270,40%,35%)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[hsl(270,60%,65%)]" />
              <span className="text-xs text-[hsl(270,60%,65%)]">Analisando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Attachments bar */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-1 pt-2 overflow-x-auto scrollbar-hide">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1 text-[10px] text-foreground shrink-0">
              {att.type === 'image' ? <ImageIcon size={10} /> : att.type === 'audio' ? <Mic size={10} /> : <Paperclip size={10} />}
              <span className="max-w-[80px] truncate">{att.name}</span>
              <button onClick={() => removeAttachment(i)} className="ml-0.5 text-muted-foreground"><X size={10} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Attachment menu */}
      {showAttachMenu && (
        <div className="flex gap-3 px-2 pt-2 pb-1">
          <button onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-1 text-muted-foreground active:scale-95">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><ImageIcon size={18} /></div>
            <span className="text-[9px]">Imagem</span>
          </button>
          <button onClick={() => audioInputRef.current?.click()} className="flex flex-col items-center gap-1 text-muted-foreground active:scale-95">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Mic size={18} /></div>
            <span className="text-[9px]">Áudio</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 text-muted-foreground active:scale-95">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Paperclip size={18} /></div>
            <span className="text-[9px]">Arquivo</span>
          </button>
        </div>
      )}

      <div className="pt-2 pb-1">
        {aiMode && (
          <div className="flex items-center gap-1 mb-1.5 px-1">
            <Sparkles size={10} className="text-[hsl(270,60%,65%)]" />
            <span className="text-[10px] text-[hsl(270,60%,65%)] font-medium">Modo IA ativo — a IA analisa conversa, anexos e links</span>
          </div>
        )}
        <div className={`flex items-center gap-2 rounded-full px-3 py-2 transition-colors ${
          aiMode ? 'bg-[hsl(270,30%,15%)] border-2 border-dashed border-[hsl(270,40%,35%)]' : 'bg-secondary'
        }`}>
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="p-1 text-muted-foreground active:scale-95"
          >
            <Plus size={18} />
          </button>

          {isRecording ? (
            <div className="flex-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm text-destructive font-medium">{formatRecTime(recordingTime)}</span>
              <span className="text-xs text-muted-foreground">Gravando...</span>
            </div>
          ) : (
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={aiMode ? "Pergunte algo à IA..." : "Mensagem..."}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground min-w-0"
            />
          )}

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-1.5 rounded-full active:scale-95 transition-all ${
              isRecording ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground'
            }`}
          >
            <Mic size={16} />
          </button>
          <button
            onClick={() => setAiMode(!aiMode)}
            className={`p-1.5 rounded-full active:scale-95 transition-all ${
              aiMode ? 'bg-[hsl(270,40%,35%)] text-[hsl(270,80%,85%)]' : 'text-muted-foreground'
            }`}
          >
            <Sparkles size={16} />
          </button>
          <button
            onClick={handleSend}
            disabled={aiLoading}
            className={`p-1.5 rounded-full active:scale-95 transition-all ${
              aiMode ? 'bg-[hsl(270,40%,35%)] text-[hsl(270,80%,85%)]' : 'bg-primary text-primary-foreground'
            } disabled:opacity-50`}
          >
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

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

// Admin-only: dropdown para reatribuir o deal a outro membro da empresa.
const ReassignDealRow = ({ deal }: { deal: Deal }) => {
  const { isAdmin } = useAuth();
  const { members, loading } = useOrgMembers();
  const { reassignDeal } = useDealsContext();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null;

  const handleChange = async (userId: string) => {
    if (userId === deal.assignedTo) return;
    setSaving(true);
    const { error } = await reassignDeal(deal.id, userId);
    setSaving(false);
    if (error) {
      toast({ title: 'Falha ao reatribuir', description: error, variant: 'destructive' });
    } else {
      const target = members.find(m => m.user_id === userId);
      toast({ title: 'Deal reatribuído', description: `Responsável: ${target?.display_name || target?.username || '—'}` });
    }
  };

  const currentMember = members.find(m => m.user_id === deal.assignedTo);

  return (
    <div className="bg-secondary rounded-xl p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <UserCog size={14} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Responsável</p>
        {saving && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
      </div>
      <Select
        value={deal.assignedTo || ''}
        onValueChange={handleChange}
        disabled={loading || saving}
      >
        <SelectTrigger className="h-9 bg-background border-border text-sm">
          <SelectValue placeholder={loading ? 'Carregando...' : 'Selecionar corretor'}>
            {currentMember ? (currentMember.display_name || currentMember.username) : (deal.assignedTo ? 'Usuário desconhecido' : 'Sem responsável')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {members.map(m => (
            <SelectItem key={m.user_id} value={m.user_id}>
              <span className="flex items-center gap-2">
                <span>{m.display_name || m.username}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{m.role}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Sprint 7: ações atômicas (avançar/voltar/ganhar/perder) no detalhe do deal.
// Usa as RPCs `move_deal_stage` e `change_deal_status` (SELECT FOR UPDATE) via
// useDealsContext — qualquer falha (permissão, deal removido, conflito) gera
// toast e mantém o estado local consistente com o servidor.
// ----------------------------------------------------------------------------

const DealStatusActions = ({
  deal,
  onLost,
}: {
  deal: Deal;
  onLost: () => void;
}) => {
  const { funnels } = useFunnelsContext();
  const { setDealStatus, moveDealStage } = useDealsContext();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'prev' | 'next' | 'won' | null>(null);

  const funnel = funnels.find(f => f.id === deal.funnelId);
  const stages = funnel?.stages ?? [];
  const idx = stages.findIndex(s => s.id === deal.stage || s.name === deal.stage);
  const prevStage = idx > 0 ? stages[idx - 1] : null;
  const nextStage = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;

  const moveTo = async (stageId: string, label: string, slot: 'prev' | 'next') => {
    setBusy(slot);
    const { error } = await moveDealStage(deal.id, stageId);
    setBusy(null);
    if (error) {
      toast({ title: 'Não foi possível mover', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Etapa atualizada', description: `Movido para ${label}` });
    }
  };

  const markWon = async () => {
    setBusy('won');
    const { error } = await setDealStatus(deal.id, 'won', 'Ganho marcado pelo corretor');
    setBusy(null);
    if (error) {
      toast({ title: 'Não foi possível marcar ganho', description: error, variant: 'destructive' });
    } else {
      toast({ title: '🎉 Negócio ganho', description: deal.leadName });
    }
  };

  return (
    <div className="bg-secondary rounded-xl p-3 mb-4 space-y-2">
      <p className="text-xs text-muted-foreground">Etapa & status</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => prevStage && moveTo(prevStage.id, prevStage.name, 'prev')}
          disabled={!prevStage || busy !== null}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-card border border-border text-xs font-medium text-foreground disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {busy === 'prev' ? <Loader2 size={12} className="animate-spin" /> : <ChevronLeft size={12} />}
          {prevStage ? prevStage.name : 'Início'}
        </button>
        <button
          onClick={() => nextStage && moveTo(nextStage.id, nextStage.name, 'next')}
          disabled={!nextStage || busy !== null}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {nextStage ? nextStage.name : 'Final'}
          {busy === 'next' ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={markWon}
          disabled={busy !== null}
          className="py-2 rounded-lg bg-success/15 border border-success/30 text-success text-xs font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {busy === 'won' ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
          Marcar ganho
        </button>
        <button
          onClick={onLost}
          disabled={busy !== null}
          className="py-2 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          Marcar perdido
        </button>
      </div>
    </div>
  );
};

const DealDetailSheet = ({ deal, onClose, onPendingStepChange, onLost }: { deal: Deal | null; onClose: () => void; onPendingStepChange?: (pending: boolean) => void; onLost?: (deal: Deal) => void }) => {
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
                <ReassignDealRow deal={deal} />
                <DealStatusActions deal={deal} onLost={() => onLost?.(deal)} />
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
      {showNextStep && <RegisterActivityPopup deal={deal} onClose={() => setShowNextStep(false)} onConfirm={handleNextStepConfirm} />}
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
    <div className="flex items-center gap-2 px-4 py-1.5">
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
  widgets,
  onForcedAction,
}: {
  deals: Deal[];
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onCardClick: (deal: Deal) => void;
  widgets: CardWidget[];
  onForcedAction?: (deal: Deal, step: Exclude<ForcedStep, null>) => void;
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
  const forcedStep = inferForcedStep({
    status: deal.status,
    lostSubstage: deal.lostSubstage,
    nextActionAt: deal.nextActionAt,
    lastActivityAt: deal.lastActivityAt,
  });

  return (
    <div className="flex-1 flex flex-col px-4 pb-3 min-h-0">
      {/* Card counter */}
      <div className="flex items-center justify-center gap-2 mb-1.5 shrink-0">
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

      {/* Card + overlay */}
      <div className="relative">
        <DealCard deal={deal} onClick={() => onCardClick(deal)} widgets={widgets} />
        {forcedStep && onForcedAction && (
          <DealActivityOverlay step={forcedStep} onAction={() => onForcedAction(deal, forcedStep)} />
        )}
      </div>

      {/* Dots indicator */}
      {deals.length > 1 && deals.length <= 10 && (
        <div className="flex items-center justify-center gap-1.5 mt-1.5 shrink-0">
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center pb-16">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl p-4 mx-4 max-h-[calc(100vh-5rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />
        <div className="space-y-2">
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

const StageFilters = ({ filters, onChange, onClose }: { filters: StageFilterState; onChange: (f: StageFilterState) => void; onClose: () => void }) => {
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
    } else if (selectedFilter === key) {
      // Clicking again on the same filter: deselect/clear it
      const defaultVal = (defaultFilters as any)[key];
      onChange({ ...filters, [key]: defaultVal });
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center pb-16">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl p-4 mx-4 max-h-[calc(100vh-5rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />
        <div className="space-y-3">
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
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <button
                  onClick={() => { onChange(defaultFilters); setSelectedFilter(''); }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground active:scale-95"
                >
                  <RotateCcw size={10} /> Limpar
                </button>
              )}
              <button onClick={onClose} className="p-1 rounded-lg bg-secondary text-muted-foreground active:scale-95">
                <X size={14} />
              </button>
            </div>
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

          {/* Filter list with inline sub-options */}
          <div className="space-y-1">
            {FILTER_OPTIONS.map(o => (
              <div key={o.key}>
                <button
                  onClick={() => handleSelectFilter(o.key)}
                  className={`w-full flex items-center justify-between text-xs rounded-lg px-3 py-2.5 active:scale-[0.98] transition-colors ${
                    selectedFilter === o.key 
                      ? 'bg-primary/15 text-primary border border-primary/30' 
                      : 'bg-secondary text-foreground border border-border'
                  }`}
                >
                  <span>{o.label}</span>
                  {isFilterActive(filters, o.key) && <span className="text-primary font-bold">✓</span>}
                </button>

                {/* Inline: Responsável select */}
                {selectedFilter === o.key && o.type === 'select' && o.key === 'responsavel' && (
                  <div className="space-y-1 pl-2 border-l-2 border-primary/30 mt-1 ml-2">
                    {['', 'João Silva', 'Maria Oliveira', 'Pedro Santos'].map(name => (
                      <button
                        key={name || 'all'}
                        onClick={() => onChange({ ...filters, responsavel: name })}
                        className={`w-full text-left text-xs rounded-lg px-3 py-2 active:scale-[0.98] ${
                          filters.responsavel === name ? 'bg-primary/15 text-primary' : 'bg-secondary/50 text-foreground'
                        }`}
                      >
                        {name || 'Todos'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline: Origem select */}
                {selectedFilter === o.key && o.type === 'select' && o.key === 'origem' && (
                  <div className="space-y-1 pl-2 border-l-2 border-primary/30 mt-1 ml-2">
                    {['', ...ORIGENS].map(orig => (
                      <button
                        key={orig || 'all'}
                        onClick={() => onChange({ ...filters, origem: orig })}
                        className={`w-full text-left text-xs rounded-lg px-3 py-2 active:scale-[0.98] ${
                          filters.origem === orig ? 'bg-primary/15 text-primary' : 'bg-secondary/50 text-foreground'
                        }`}
                      >
                        {orig || 'Todas'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline: Date range */}
                {selectedFilter === o.key && o.type === 'daterange' && (
                  <div className="space-y-2 pl-2 border-l-2 border-primary/30 mt-1 ml-2">
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== MAIN PAGE ==========

const FunisPage = ({ onPendingStepChange }: { onPendingStepChange?: (pending: boolean) => void }) => {
  const { widgets: cardWidgets } = useCardWidgets();
  const { funnels } = useFunnelsContext();
  const { deals: dealsList } = useDealsContext();
  const [viewMode, setViewMode] = useState<ViewMode>('lead');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [activeFunnelId, setActiveFunnelId] = useState<string>('');
  const [stageIndex, setStageIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [lossDeal, setLossDeal] = useState<Deal | null>(null);
  const { setDealStatus } = useDealsContext();
  const { toast } = useToast();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [stageFilters, setStageFilters] = useState<StageFilterState>(defaultFilters);

  const closePanels = () => { setFiltersOpen(false); setAiOpen(false); };
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Sincroniza funil ativo com lista carregada
  useEffect(() => {
    if (!activeFunnelId && funnels.length > 0) {
      setActiveFunnelId(funnels[0].id);
    } else if (activeFunnelId && funnels.length > 0 && !funnels.find(f => f.id === activeFunnelId)) {
      setActiveFunnelId(funnels[0].id);
    }
  }, [funnels, activeFunnelId]);

  const activeFunnel = funnels.find(f => f.id === activeFunnelId);

  // ===== POR FUNIL =====
  const funnelStages = activeFunnel?.stages || [];
  const currentStageName = funnelStages[stageIndex]?.name || '';
  // ===== APPLY FILTERS =====
  const applyFilters = useCallback((list: Deal[]): Deal[] => {
    return list.filter(d => {
      // Responsável - sem campo no mock, ignorar por enquanto
      // Origem - via lead
      if (stageFilters.origem) {
        const lead = leads.find(l => l.id === d.leadId);
        if (!lead || lead.origin !== stageFilters.origem) return false;
      }
      // Atividades hoje / amanhã - sem dados reais, ignorar por enquanto
      // periodoCriacao - usa createdAt do deal
      if (stageFilters.periodoCriacao.from || stageFilters.periodoCriacao.to) {
        const created = d.createdAt?.slice(0, 10) || '';
        if (stageFilters.periodoCriacao.from && created < stageFilters.periodoCriacao.from) return false;
        if (stageFilters.periodoCriacao.to && created > stageFilters.periodoCriacao.to) return false;
      }
      // Demais filtros de período - prontos para dados reais
      return true;
    });
  }, [stageFilters]);

  const funnelStageDeals = useMemo(
    () => applyFilters(dealsList.filter(d => d.funnelId === activeFunnelId && d.stage === currentStageName)),
    [dealsList, activeFunnelId, currentStageName, applyFilters]
  );

  // ===== POR LEAD =====
  const leadStageDeals = useMemo(() => {
    const grouped: Record<LeadStageKey, Deal[]> = {
      unread_agent: [],
      unread_client: [],
      no_reply_client: [],
      no_reply_agent: [],
    };
    applyFilters(dealsList).forEach(d => {
      const key = classifyDealLeadStage(d);
      grouped[key].push(d);
    });
    return grouped;
  }, [dealsList, applyFilters]);

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
    <div className="flex flex-col h-full relative pb-16">
      {/* Toolbar + panels */}
      <div ref={toolbarRef} className="lg:max-w-5xl lg:mx-auto w-full">
        <div className="px-4 lg:px-8 pt-2 pb-0.5">
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
      </div>

      {filtersOpen && <StageFilters filters={stageFilters} onChange={setStageFilters} onClose={() => setFiltersOpen(false)} />}
      <AIAnalysisPanel deals={currentDeals} open={aiOpen} onClose={() => setAiOpen(false)} />

      <div className="lg:max-w-5xl lg:mx-auto w-full">
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
          widgets={cardWidgets}
        />
      </div>

      <LossBottomSheet
        open={lossDeal !== null}
        onClose={() => setLossDeal(null)}
        onConfirm={async (reason) => {
          if (!lossDeal) return;
          const target = lossDeal;
          setLossDeal(null);
          const { error } = await setDealStatus(target.id, 'lost', reason);
          if (error) {
            toast({ title: 'Falha ao registrar perda', description: error, variant: 'destructive' });
          } else {
            toast({ title: 'Negócio marcado como perdido', description: `${target.leadName} · ${reason}` });
          }
        }}
      />
      <DealDetailSheet
        deal={selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onPendingStepChange={onPendingStepChange}
        onLost={(d) => setLossDeal(d)}
      />
    </div>
  );
};

export default FunisPage;
