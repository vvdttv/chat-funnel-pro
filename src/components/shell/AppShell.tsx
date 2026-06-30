import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import BottomNav from '@/components/BottomNav';
import type { TabId } from './navItems';

type Props = {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
  children: ReactNode;
  /**
   * Quando true (paineis dedicados ex.: /correspondente), a sidebar segue ali
   * mas o ProtectedRoute interno do painel cuida do gating; tabs apenas levam
   * de volta para "/" + ativam a tab.
   */
  panelMode?: boolean;
};

const DENSITY_KEY = 'omnimob.density';

export function AppShell({ activeTab, onTabChange, children, panelMode = false }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restaura densidade no boot (Fase 2). Aplica em <html> para herdar nas custom-props.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DENSITY_KEY);
      if (v === '1') document.documentElement.classList.add('density-compact');
    } catch { /* ignore */ }
  }, []);

  // Atalho Ctrl/Cmd + B emite evento que o Sidebar escuta — sem reload.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('omnimob:sidebar-toggle'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar activeTab={activeTab} onTabChange={onTabChange} onOpenPalette={() => setPaletteOpen(true)} />
        <main
          className={`flex-1 min-h-0 overflow-hidden ${
            panelMode ? '' : 'lg:pb-0 pb-[var(--bottom-nav-h)]'
          }`}
        >
          {children}
        </main>
        {/* Mobile-only: mantém bottom-nav abaixo do conteudo */}
        <div className="lg:hidden">
          <BottomNav activeTab={activeTab} onTabChange={(t) => onTabChange(t as TabId)} />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onTabChange={onTabChange} />
    </div>
  );
}