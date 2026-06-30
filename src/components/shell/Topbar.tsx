import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/NotificationBell';
import { forceRefresh } from '@/lib/force-refresh';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { TABS, filterPanels, type TabId } from './navItems';
import { useAuth } from '@/hooks/useAuth';

type Props = {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
  onOpenPalette: () => void;
};

export function Topbar({ activeTab, onTabChange: _onTabChange, onOpenPalette }: Props) {
  void _onTabChange;
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const { isAdmin, roles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const onPanel = location.pathname !== '/' && location.pathname !== '/auth';
  const panelMatch = filterPanels({ isAdmin, roles }).find((p) => p.to === location.pathname);
  const currentTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? 'Leads';

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    toast({ title: 'Atualizando...', description: 'Limpando cache e sincronizando.' });
    try {
      await forceRefresh();
    } catch {
      setRefreshing(false);
      toast({ title: 'Erro ao atualizar', description: 'Recarregue manualmente.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenPalette]);

  return (
    <header className="sticky top-0 z-30 h-[var(--topbar-h)] bg-background/95 backdrop-blur border-b border-border flex items-center px-3 gap-2">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground min-w-0">
        {onPanel ? (
          <>
            <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors truncate">
              OmniMob
            </button>
            <ChevronRight size={12} className="opacity-60 shrink-0" />
            <span className="text-foreground font-medium truncate">{panelMatch?.label ?? 'Painel'}</span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground/70 truncate">OmniMob</span>
            <ChevronRight size={12} className="opacity-60 shrink-0" />
            <span className="text-foreground font-medium truncate">{currentTabLabel}</span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden md:flex items-center gap-2 h-7 px-2 rounded-md bg-secondary hover:bg-secondary/80 text-[12px] text-muted-foreground transition-colors w-[min(280px,30vw)]"
        aria-label="Buscar ou executar comando"
      >
        <Search size={12} />
        <span className="flex-1 text-left">Buscar ou executar...</span>
        <kbd className="text-[10px] font-mono opacity-70 bg-background border border-border rounded px-1 py-px">
          {isMac ? 'Cmd K' : 'Ctrl K'}
        </kbd>
      </button>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Atualizar e sincronizar"
        className="h-7 w-7 p-0"
      >
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
      </Button>

      <NotificationBell />
    </header>
  );
}