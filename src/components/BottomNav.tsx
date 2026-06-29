import { useMemo, useState } from 'react';
import {
  Users,
  Clock,
  BarChart3,
  Settings,
  RefreshCw,
  Bot,
  LayoutGrid,
  ClipboardCheck,
  FileSignature,
  ShieldCheck,
  Briefcase,
  HeadsetIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { forceRefresh } from '@/lib/force-refresh';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Atalhos para os painéis externos ao CRM (rotas fora do Index). Cada item
// declara explicitamente quais papéis podem acessar — espelha a regra de
// gating na própria página, então se um curioso clicar sem permissão, o
// painel já redireciona pra '/'.
type PanelEntry = {
  to: string;
  label: string;
  icon: typeof Users;
  allow: (ctx: { isAdmin: boolean; roles: string[] }) => boolean;
};

const PANEL_ENTRIES: PanelEntry[] = [
  {
    to: '/correspondente',
    label: 'Correspondente',
    icon: HeadsetIcon,
    allow: ({ isAdmin, roles }) =>
      isAdmin || roles.includes('atendente') || roles.includes('correspondente'),
  },
  {
    to: '/garantia',
    label: 'Garantia (locação)',
    icon: ShieldCheck,
    allow: ({ isAdmin }) => isAdmin,
  },
  {
    to: '/vistorias',
    label: 'Vistorias',
    icon: ClipboardCheck,
    allow: ({ isAdmin }) => isAdmin,
  },
  {
    to: '/contratos',
    label: 'Contratos',
    icon: FileSignature,
    allow: ({ isAdmin }) => isAdmin,
  },
  {
    to: '/corretor',
    label: 'Corretor',
    icon: Briefcase,
    allow: ({ isAdmin, roles }) => isAdmin || roles.includes('corretor'),
  },
];

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
  const [panelsOpen, setPanelsOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin, roles } = useAuth();

  // Filtra os atalhos pelo papel do usuário. Recalcula só quando a lista de
  // papéis muda — evita re-render desnecessário em cada clique do dropdown.
  const visiblePanels = useMemo(
    () => PANEL_ENTRIES.filter((p) => p.allow({ isAdmin, roles })),
    [isAdmin, roles],
  );

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
        {visiblePanels.length > 0 && (
          <DropdownMenu open={panelsOpen} onOpenChange={setPanelsOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Abrir painéis"
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors active:scale-95 transition-transform ${
                  panelsOpen ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <LayoutGrid size={22} strokeWidth={panelsOpen ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium">Painéis</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-56">
              <DropdownMenuLabel>Painéis dedicados</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visiblePanels.map((panel) => {
                const Icon = panel.icon;
                return (
                  <DropdownMenuItem
                    key={panel.to}
                    onSelect={() => {
                      setPanelsOpen(false);
                      navigate(panel.to);
                    }}
                    className="cursor-pointer gap-2"
                  >
                    <Icon size={16} className="text-muted-foreground" />
                    <span>{panel.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;
