import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AppNotification {
  id: string;
  user_id: string;
  organization_id: string | null;
  type: 'deal_stalled' | 'new_lead' | 'credit_approved' | 'briefing_ready' | 'system';
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const POLL_MS = 30_000;

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setNotifications([]); setUnreadCount(0); return; }
      const { data, error: err } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (err) throw err;
      if (!mounted.current) return;
      const list = (data || []) as AppNotification[];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Erro ao carregar notificacoes');
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    // Otimista
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    const { error: err } = await supabase.rpc('mark_notification_read', { p_id: id });
    if (err) fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    const { error: err } = await supabase.rpc('mark_all_notifications_read');
    if (err) fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    mounted.current = true;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_MS);

    // Realtime (best-effort): atualiza ao inserir/atualizar do proprio usuario.
    const channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      mounted.current = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  return { notifications, unreadCount, isLoading, error, refetch: fetchNotifications, markRead, markAllRead };
}
