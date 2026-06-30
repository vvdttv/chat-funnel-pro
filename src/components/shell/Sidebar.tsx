import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LogOut, LayoutGrid } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { TABS, filterPanels, type NavTab, type NavRoute, type TabId } from './navItems';

type Props = {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
};

const STORAGE_KEY = 'omnimob.sidebar.collapsed';

export function Sidebar({ activeTab, onTabChange }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });
  const { isAdmin, roles, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const panels = useMemo(() => filterPanels({ isAdmin, roles }), [isAdmin, roles]);
  const onPanel = location.pathname !== '/' && location.pathname !== '/auth';

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // O atalho Ctrl/Cmd+B vem do AppShell via evento custom — sem recarregar a página.
  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener('omnimob:sidebar-toggle', onToggle as EventListener);
    return () => window.removeEventListener('omnimob:sidebar-toggle', onToggle as EventListener);
  }, [toggle]);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={`hidden lg:flex flex-col bg-card border-r border-border h-screen sticky top-0 z-40 transition-[width] duration-150 ease-out ${
          collapsed ? 'w-[var(--sidebar-w)]' : 'w-[var(--sidebar-w-expanded)]'
        }`}
      >
        <div className="h-11 flex items-center px-3 border-b border-border shrink-0">
          <div className="h-6 w-6 rounded-sm bg-primary/15 border border-primary/40 flex items-center justify-center text-primary font-bold text-[11px] shrink-0">
            O
          </div>
          {!collapsed && (
            <span className="ml-2 text-[13px] font-semibold tracking-tight">OmniMob</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {TABS.map((tab) => (
            <SideTab
              key={tab.id}
              tab={tab}
              active={!onPanel && activeTab === tab.id}
              collapsed={collapsed}
              onClick={() => {
                if (onPanel) navigate('/');
                onTabChange(tab.id);
              }}
            />
          ))}

          {panels.length > 0 && (
            <>
              <div className={`mt-3 mb-1 px-2 text-[10px] uppercase tracking-wider text-muted-foreground ${collapsed ? 'sr-only' : ''}`}>
                Painéis
              </div>
              {panels.map((p) => (
                <SideRoute
                  key={p.to}
                  route={p}
                  active={location.pathname === p.to}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-border p-2 space-y-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`w-full flex items-center rounded-md hover:bg-secondary transition-colors px-2 py-1.5 text-left ${
                  collapsed ? 'justify-center' : ''
                }`}
                aria-label="Menu do usuário"
              >
                <span className="h-6 w-6 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                  {(profile?.username?.[0] || 'U').toUpperCase()}
                </span>
                {!collapsed && (
                  <span className="ml-2 truncate text-[12px] font-medium">
                    {profile?.username || 'Usuário'}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                {profile?.email || profile?.username}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DensityToggleItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()} className="gap-2 text-destructive">
                <LogOut size={14} /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggle}
                className={`w-full h-7 ${collapsed ? 'px-0' : 'justify-start gap-2'}`}
              >
                {collapsed ? <ChevronsRight size={14} /> : <><ChevronsLeft size={14} /> <span className="text-[12px]">Recolher</span></>}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Expandir</TooltipContent>}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function SideTab({
  tab, active, collapsed, onClick,
}: { tab: NavTab; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = tab.icon;
  const inner = (
    <button
      onClick={onClick}
      className={`w-full flex items-center rounded-md px-2 py-1.5 text-[12px] transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon size={16} strokeWidth={active ? 2.4 : 1.8} className="shrink-0" />
      {!collapsed && <span className="ml-2 truncate">{tab.label}</span>}
      {!collapsed && tab.shortcut && (
        <span className="ml-auto text-[9px] text-muted-foreground/70 font-mono">{tab.shortcut}</span>
      )}
    </button>
  );
  if (!collapsed) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right" className="text-[11px]">
        {tab.label} {tab.shortcut && <span className="ml-1 opacity-60 font-mono">{tab.shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function SideRoute({
  route, active, collapsed,
}: { route: NavRoute; active: boolean; collapsed: boolean }) {
  const Icon = route.icon;
  const inner = (
    <Link
      to={route.to}
      className={`w-full flex items-center rounded-md px-2 py-1.5 text-[12px] transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon size={16} strokeWidth={active ? 2.4 : 1.8} className="shrink-0" />
      {!collapsed && <span className="ml-2 truncate">{route.label}</span>}
    </Link>
  );
  if (!collapsed) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right" className="text-[11px]">{route.label}</TooltipContent>
    </Tooltip>
  );
}

function DensityToggleItem() {
  const KEY = 'omnimob.density';
  const isCompact = typeof document !== 'undefined' && document.documentElement.classList.contains('density-compact');
  const toggle = () => {
    const next = !document.documentElement.classList.contains('density-compact');
    document.documentElement.classList.toggle('density-compact', next);
    try { window.localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };
  return (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }} className="gap-2">
      <LayoutGrid size={14} /> {isCompact ? 'Densidade compacta (ativa)' : 'Densidade compacta'}
    </DropdownMenuItem>
  );
}