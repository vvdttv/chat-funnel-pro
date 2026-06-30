import {
  Users, Clock, BarChart3, Settings, Bot, ClipboardCheck,
  FileSignature, ShieldCheck, Briefcase, HeadsetIcon, type LucideIcon,
} from 'lucide-react';

/**
 * Definição única de toda a navegação. Sidebar, BottomNav e o Command Palette
 * consomem desta lista — assim a UI nunca desincroniza quando uma entrada
 * muda de label, ícone ou permissão.
 */
export type RoleCtx = { isAdmin: boolean; roles: string[] };

export type TabId = 'leads' | 'suggestions' | 'activities' | 'indicators' | 'settings';

export type NavTab = {
  kind: 'tab';
  id: TabId;
  label: string;
  icon: LucideIcon;
  shortcut?: string;  // ex: 'g l'
};

export type NavRoute = {
  kind: 'route';
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  allow: (ctx: RoleCtx) => boolean;
};

export type NavItem = NavTab | NavRoute;

export const TABS: NavTab[] = [
  { kind: 'tab', id: 'leads',       label: 'Leads',        icon: Users,    shortcut: 'g l' },
  { kind: 'tab', id: 'suggestions', label: 'IA',           icon: Bot,      shortcut: 'g i' },
  { kind: 'tab', id: 'activities',  label: 'Atividades',   icon: Clock,    shortcut: 'g a' },
  { kind: 'tab', id: 'indicators',  label: 'Indicadores',  icon: BarChart3,shortcut: 'g d' },
  { kind: 'tab', id: 'settings',    label: 'Config',       icon: Settings, shortcut: 'g c' },
];

export const PANELS: NavRoute[] = [
  {
    kind: 'route', to: '/correspondente', label: 'Correspondente', icon: HeadsetIcon, shortcut: 'g p c',
    allow: ({ isAdmin, roles }) =>
      isAdmin || roles.includes('atendente') || roles.includes('correspondente'),
  },
  {
    kind: 'route', to: '/garantia', label: 'Garantia', icon: ShieldCheck, shortcut: 'g p g',
    allow: ({ isAdmin }) => isAdmin,
  },
  {
    kind: 'route', to: '/vistorias', label: 'Vistorias', icon: ClipboardCheck, shortcut: 'g p v',
    allow: ({ isAdmin }) => isAdmin,
  },
  {
    kind: 'route', to: '/contratos', label: 'Contratos', icon: FileSignature, shortcut: 'g p t',
    allow: ({ isAdmin }) => isAdmin,
  },
  {
    kind: 'route', to: '/corretor', label: 'Corretor', icon: Briefcase, shortcut: 'g p r',
    allow: ({ isAdmin, roles }) => isAdmin || roles.includes('corretor'),
  },
];

export function filterPanels(ctx: RoleCtx): NavRoute[] {
  return PANELS.filter((p) => p.allow(ctx));
}
