import { Bell, Check, CheckCheck } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, AppNotification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

const TYPE_EMOJI: Record<AppNotification['type'], string> = {
  deal_stalled: '⏰',
  new_lead: '🎯',
  credit_approved: '✅',
  briefing_ready: '📋',
  system: '🔔',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Notificacoes${unreadCount > 0 ? `, ${unreadCount} nao lidas` : ''}`}
          className="relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors active:scale-95"
        >
          <Bell size={22} className="text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">Notificacoes</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <CheckCheck size={14} /> Marcar todas
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificacao
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'px-4 py-3 flex gap-3 items-start hover:bg-muted/50 transition-colors',
                    !n.read && 'bg-primary/5',
                  )}
                >
                  <span className="text-lg leading-none mt-0.5">{TYPE_EMOJI[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                    <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      aria-label="Marcar como lida"
                      className="text-muted-foreground hover:text-primary p-1"
                    >
                      <Check size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
