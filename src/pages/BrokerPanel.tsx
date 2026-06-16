import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Loader2, UserRound, LogOut, ChevronLeft, Calendar, MapPin, Video, Phone,
  FileText, Clock, ExternalLink, Home,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  AppointmentsProvider,
  useAppointmentsContext,
  type Appointment,
  type BrokerBriefing,
  type AppointmentChannel,
} from '@/hooks/useAppointments';

const CHANNEL_META: Record<AppointmentChannel, { label: string; icon: typeof MapPin }> = {
  presencial: { label: 'Presencial', icon: MapPin },
  video: { label: 'Vídeo', icon: Video },
  ligacao: { label: 'Ligação', icon: Phone },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  proposed: { label: 'A agendar', cls: 'bg-warning/15 text-warning' },
  confirmed: { label: 'Agendada', cls: 'bg-primary/15 text-primary' },
  done: { label: 'Realizada', cls: 'bg-[hsl(150,40%,25%)]/40 text-[hsl(150,60%,65%)]' },
  cancelled: { label: 'Cancelada', cls: 'bg-secondary text-muted-foreground' },
  no_show: { label: 'Não compareceu', cls: 'bg-destructive/15 text-destructive' },
};

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const FIELD_LABELS: Record<string, string> = {
  lead_name: 'Nome do lead',
  lead_phone: 'Telefone',
  value: 'Valor compatível',
  property: 'Imóvel',
  property_code: 'Código do imóvel',
  summary: 'Resumo do atendimento',
  reason: 'Motivo da transferência',
  property_match: 'Match de imóveis',
  history_link: 'Histórico',
};

// ========== DETALHE DO BRIEFING ==========

const BriefingDetail = ({ appointment, briefing, onClose }: {
  appointment: Appointment;
  briefing: BrokerBriefing | null;
  onClose: () => void;
}) => {
  const ch = CHANNEL_META[appointment.channel];
  const ChIcon = ch.icon;
  const f = briefing?.fields ?? {};

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={onClose} className="p-1 text-muted-foreground active:scale-95"><ChevronLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{String(f.lead_name ?? 'Lead transferido')}</p>
          <p className="text-[11px] text-muted-foreground truncate">{briefing?.reason === 'troca_voz' ? 'Troca de voz — agende a visita' : 'Visita agendada pela IA'}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_META[appointment.status]?.cls ?? ''}`}>
          {STATUS_META[appointment.status]?.label ?? appointment.status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 lg:max-w-3xl lg:mx-auto w-full">
        {/* Agendamento */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Agendamento</p>
          <div className="flex items-center gap-2 text-sm text-foreground mb-1">
            <Calendar size={15} className="text-primary" /> {fmtDateTime(appointment.scheduledAt)}
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground mb-1">
            <ChIcon size={15} className="text-primary" /> {ch.label}{appointment.location ? ` · ${appointment.location}` : ''}
          </div>
          {appointment.attempts > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">Tentativas de agendamento pela IA: {appointment.attempts}</p>
          )}
        </div>

        {/* Briefing */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
            <FileText size={12} /> Briefing
          </p>
          {!briefing ? (
            <p className="text-xs text-muted-foreground">Briefing ainda não gerado.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(f)
                .filter(([k, v]) => v !== null && v !== '' && k !== 'appointment' && k !== 'history_link')
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-xs border-b border-border/50 pb-1.5">
                    <span className="text-muted-foreground shrink-0">{FIELD_LABELS[k] ?? k}</span>
                    <span className="text-foreground text-right break-words">
                      {k === 'value' && typeof v === 'number'
                        ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : k === 'property_match' && v === 'a_definir_fase3b'
                        ? 'Captação a definir'
                        : String(v)}
                    </span>
                  </div>
                ))}
              {typeof f.history_link === 'string' && (
                <a href={f.history_link} className="inline-flex items-center gap-1 text-[11px] text-primary mt-1 active:scale-95">
                  <ExternalLink size={12} /> Abrir histórico do lead
                </a>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                Enviado por: {briefing.channelsSent.length ? briefing.channelsSent.join(', ') : 'pendente'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ========== CARD ==========

const AppointmentCard = ({ a, briefing, onOpen }: {
  a: Appointment;
  briefing: BrokerBriefing | null;
  onOpen: () => void;
}) => {
  const s = STATUS_META[a.status];
  const leadName = briefing?.fields?.lead_name ? String(briefing.fields.lead_name) : (a.iaDealId ?? 'Lead');
  const ChIcon = CHANNEL_META[a.channel].icon;
  return (
    <button onClick={onOpen} className="w-full text-left bg-card rounded-xl p-4 mb-2 border border-border active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Home size={15} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground truncate">{leadName}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${s?.cls ?? ''}`}>{s?.label ?? a.status}</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDateTime(a.scheduledAt)}</span>
        <span className="flex items-center gap-1"><ChIcon size={11} /> {CHANNEL_META[a.channel].label}</span>
      </div>
    </button>
  );
};

// ========== PAINEL ==========

const PanelInner = () => {
  const { profile, signOut } = useAuth();
  const { appointments, briefings, loading } = useAppointmentsContext();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'proposed' | 'confirmed' | 'done'>('confirmed');

  const briefingByAppt = useMemo(() => {
    const map: Record<string, BrokerBriefing> = {};
    for (const b of briefings) if (b.appointmentId) map[b.appointmentId] = b;
    return map;
  }, [briefings]);

  const grouped = useMemo(() => ({
    proposed: appointments.filter(a => a.status === 'proposed'),
    confirmed: appointments.filter(a => a.status === 'confirmed'),
    done: appointments.filter(a => ['done', 'no_show', 'cancelled'].includes(a.status)),
  }), [appointments]);

  const open = openId ? appointments.find(a => a.id === openId) ?? null : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md lg:max-w-3xl mx-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <UserRound size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">Painel do Corretor</p>
              <p className="text-[10px] text-muted-foreground truncate">@{profile?.username}</p>
            </div>
          </div>
          <button onClick={() => signOut()} className="flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary px-2.5 py-1.5 rounded-full active:scale-95">
            <LogOut size={11} /> Sair
          </button>
        </div>

        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {([
            { id: 'confirmed', label: 'Agendadas', n: grouped.confirmed.length },
            { id: 'proposed', label: 'A agendar', n: grouped.proposed.length },
            { id: 'done', label: 'Concluídas', n: grouped.done.length },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium shrink-0 active:scale-95 ${
                tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
              {t.label}
              <span className={`text-[10px] px-1.5 rounded-full ${tab === t.id ? 'bg-primary-foreground/20' : 'bg-background/50'}`}>{t.n}</span>
            </button>
          ))}
        </div>

        <div className="px-4 pb-24">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" /><span className="text-xs ml-2">Carregando…</span>
            </div>
          ) : grouped[tab].length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">Nenhum lead nesta categoria.</p>
          ) : (
            grouped[tab].map(a => (
              <AppointmentCard key={a.id} a={a} briefing={briefingByAppt[a.id] ?? null} onOpen={() => setOpenId(a.id)} />
            ))
          )}
        </div>
      </div>

      {open && <BriefingDetail appointment={open} briefing={briefingByAppt[open.id] ?? null} onClose={() => setOpenId(null)} />}
    </div>
  );
};

// ========== PÁGINA (guarda de role) ==========

const BrokerPanel = () => {
  const { session, loading, profile, roles, isAdmin } = useAuth();

  if (loading) {
    return <div className="h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>;
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) {
    return <div className="h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>;
  }
  const allowed = isAdmin || roles.includes('corretor');
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <AppointmentsProvider>
      <PanelInner />
    </AppointmentsProvider>
  );
};

export default BrokerPanel;
