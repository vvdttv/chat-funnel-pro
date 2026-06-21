import { useState } from 'react';
import { Users, Clock, BarChart3, Settings, RefreshCw, Bot } from 'lucide-react';
import { forceRefresh } from '@/lib/force-refresh';
import { useToast } from '@/hooks/use-toast';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const leftTabs = [
  { id: 'leads', icon: Users, label: 'Leads' },
  { id: 'suggestions', icon: Bot, label: 'IA' },
  { id: 'activities', icon: Clock, label: 'Atividades' },
];

const rightTabs = [
  { id: 'indicators', icon: BarChart3, label: 'Indicadores' },
  { id: 'settings', icon: Settings, label: 'Config' },
];

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    toast({
      title: 'Atualizando sistema…',
      description: 'Limpando cache e sincronizando dados.',
    });
    try {
      await forceRefresh();
    } catch (err) {
      console.error('Erro ao forçar atualização:', err);
      setRefreshing(false);
      toast({
        title: 'Erro ao atualizar',
        description: 'Tente recarregar manualmente.',
        variant: 'destructive',
      });
    }
  };

  const renderTab = (tab: { id: string; icon: typeof Users; label: string }) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors active:scale-95 transition-transform ${
          isActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
        <span className="text-[10px] font-medium">{tab.label}</span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 w-full bg-card border-t border-border z-50">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-w-md lg:max-w-2xl mx-auto">
        {leftTabs.map(renderTab)}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Atualizar e sincronizar"
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors active:scale-95 transition-transform text-primary disabled:opacity-60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} strokeWidth={2.2} />
          </span>
          <span className="text-[10px] font-medium">Sync</span>
        </button>
        {rightTabs.map(renderTab)}
      </div>
    </nav>
  );
};

export default BottomNav;
