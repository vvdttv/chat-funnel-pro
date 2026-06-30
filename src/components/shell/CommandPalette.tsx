import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, RefreshCw } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useAuth } from '@/hooks/useAuth';
import { forceRefresh } from '@/lib/force-refresh';
import { TABS, filterPanels, type TabId } from './navItems';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTabChange: (id: TabId) => void;
};

export function CommandPalette({ open, onOpenChange, onTabChange }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, roles, signOut } = useAuth();
  const [buffer, setBuffer] = useState('');

  const panels = useMemo(() => filterPanels({ isAdmin, roles }), [isAdmin, roles]);

  const go = (id: TabId) => {
    if (location.pathname !== '/') navigate('/');
    onTabChange(id);
    onOpenChange(false);
  };

  const goPanel = (to: string) => {
    navigate(to);
    onOpenChange(false);
  };

  // Atalhos "g + letra" (Linear-style). Sequência limpa em 800ms.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const editable = !!tgt && (
        tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' ||
        tgt.isContentEditable || tgt.getAttribute('role') === 'textbox'
      );
      if (editable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key.toLowerCase() === 'g' && !buffer) {
        setBuffer('g');
        timer = setTimeout(() => setBuffer(''), 800);
        return;
      }
      if (buffer === 'g') {
        const k = e.key.toLowerCase();
        if (timer) clearTimeout(timer);
        setBuffer('');
        if (k === 'l') return go('leads');
        if (k === 'i') return go('suggestions');
        if (k === 'a') return go('activities');
        if (k === 'd') return go('indicators');
        if (k === 'c') return go('settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, location.pathname]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar telas, paineis, acoes..." />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

        <CommandGroup heading="Ir para">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <CommandItem key={tab.id} onSelect={() => go(tab.id)} className="gap-2">
                <Icon size={14} className="text-muted-foreground" />
                <span>{tab.label}</span>
                {tab.shortcut && (
                  <span className="ml-auto text-[10px] font-mono opacity-60">{tab.shortcut}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {panels.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Paineis">
              {panels.map((p) => {
                const Icon = p.icon;
                return (
                  <CommandItem key={p.to} onSelect={() => goPanel(p.to)} className="gap-2">
                    <Icon size={14} className="text-muted-foreground" />
                    <span>{p.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Acoes">
          <CommandItem onSelect={() => { void forceRefresh(); onOpenChange(false); }} className="gap-2">
            <RefreshCw size={14} className="text-muted-foreground" />
            <span>Sincronizar e atualizar</span>
          </CommandItem>
          <CommandItem onSelect={() => { void signOut(); onOpenChange(false); }} className="gap-2 text-destructive">
            <LogOut size={14} />
            <span>Sair</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}