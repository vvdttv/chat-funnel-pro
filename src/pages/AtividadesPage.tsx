import { useState, useRef, useCallback } from 'react';
import { Phone, FileText, MapPin, MessageCircle, Check, ChevronRight, Calendar, RotateCcw } from 'lucide-react';
import { activities as mockActivities, Activity, ACTIVITY_TYPES, formatCurrency } from '@/data/mockData';

const typeIcons = { call: Phone, proposal: FileText, visit: MapPin, followup: MessageCircle };
const filterOptions = ['Hoje', 'Atrasadas', 'Semana'] as const;

const ActivityCard = ({ activity, onDone, onPostpone }: { activity: Activity; onDone: (id: string) => void; onPostpone: (id: string) => void }) => {
  const startX = useRef(0);
  const currentX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !cardRef.current) return;
    currentX.current = e.touches[0].clientX - startX.current;
    const clamped = Math.max(-100, Math.min(100, currentX.current));
    cardRef.current.style.transform = `translateX(${clamped}px)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!cardRef.current) return;
    isDragging.current = false;
    if (currentX.current > 80) {
      onDone(activity.id);
    } else if (currentX.current < -80) {
      onPostpone(activity.id);
    }
    cardRef.current.style.transform = 'translateX(0)';
    currentX.current = 0;
  }, [activity.id, onDone, onPostpone]);

  const Icon = typeIcons[activity.type];
  const isOverdue = activity.dueDate < '2024-02-12' && !activity.done;

  return (
    <div className="relative overflow-hidden rounded-xl mb-3">
      {/* Swipe backgrounds */}
      <div className="absolute inset-0 flex items-center justify-between px-6">
        <div className="flex items-center gap-2 text-primary">
          <Check size={20} /> <span className="text-sm font-medium">Feita</span>
        </div>
        <div className="flex items-center gap-2 text-warning">
          <Calendar size={20} /> <span className="text-sm font-medium">Adiar</span>
        </div>
      </div>

      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative bg-card p-4 rounded-xl transition-transform active:scale-[0.99] ${activity.done ? 'opacity-50' : ''}`}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isOverdue ? 'bg-destructive/20 text-destructive' : 'bg-primary/15 text-primary'}`}>
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground truncate">{activity.title}</span>
              {activity.recurring && <RotateCcw size={12} className="text-primary shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground">{activity.leadName} · {activity.property}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${isOverdue ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                {activity.dueTime} · {activity.dueDate === '2024-02-12' ? 'Hoje' : activity.dueDate < '2024-02-12' ? 'Atrasada' : activity.dueDate}
              </span>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                {ACTIVITY_TYPES[activity.type].label}
              </span>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground mt-1 shrink-0" />
        </div>
      </div>
    </div>
  );
};

const CalendarBottomSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />
        <h3 className="text-lg font-semibold text-foreground mb-4">Salvar na Agenda</h3>
        {['Google Calendar', 'Outlook', 'Apple Calendar'].map(cal => (
          <button key={cal} className="w-full text-left p-4 rounded-xl bg-secondary mb-2 text-foreground text-sm font-medium active:scale-[0.98] transition-transform">
            {cal}
          </button>
        ))}
        <button onClick={onClose} className="w-full mt-2 p-3 text-center text-muted-foreground text-sm">Cancelar</button>
      </div>
    </div>
  );
};

const AtividadesPage = () => {
  const [filter, setFilter] = useState<string>('Hoje');
  const [activityList, setActivityList] = useState(mockActivities);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filteredActivities = activityList.filter(a => {
    if (filter === 'Hoje') return a.dueDate === '2024-02-12';
    if (filter === 'Atrasadas') return a.dueDate < '2024-02-12' && !a.done;
    return true;
  });

  const handleDone = (id: string) => {
    setActivityList(prev => prev.map(a => a.id === id ? { ...a, done: true } : a));
  };

  const handlePostpone = (_id: string) => {
    // In production, this would open a date picker
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-end mb-4">
          <button onClick={() => setCalendarOpen(true)} className="p-2 rounded-lg bg-secondary text-primary active:scale-95 transition-transform">
            <Calendar size={18} />
          </button>
        </div>

        {/* Quick Filters */}
        <div className="flex gap-2 mb-4">
          {filterOptions.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors active:scale-95 transition-transform ${
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-24">
        {filteredActivities.length === 0 ? (
          <div className="text-center text-muted-foreground mt-12">
            <Check size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma atividade neste filtro</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3 px-1">← Deslize para concluir/adiar →</p>
            {filteredActivities.map(a => (
              <ActivityCard key={a.id} activity={a} onDone={handleDone} onPostpone={handlePostpone} />
            ))}
          </>
        )}
      </div>

      <CalendarBottomSheet open={calendarOpen} onClose={() => setCalendarOpen(false)} />
    </div>
  );
};

export default AtividadesPage;
