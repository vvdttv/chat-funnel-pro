import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import type { Deal } from '@/data/mockData';
import type { CardWidget } from '@/components/CardWidgetConfig';
import { DealActivityOverlay } from '@/components/DealActivityOverlay';
import { inferForcedStep, type ForcedStep } from '@/lib/activityBlocking';
import { formatCurrency } from '@/data/mockData';
import { cn } from '@/lib/utils';

// ============================================================================
// HORIZONTAL SCROLLER (padrão Enermac: scroll horizontal + range slider)
// ============================================================================

interface HorizontalScrollerProps {
  children: ReactNode;
  className?: string;
}

const HorizontalScroller = ({ children, className }: HorizontalScrollerProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  const updateMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = Math.max(0, el.scrollWidth - el.clientWidth);
    setMaxScroll(next);
    setScrollLeft(Math.min(el.scrollLeft, next));
  }, []);

  useEffect(() => {
    updateMetrics();
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(updateMetrics);
    obs.observe(el);
    Array.from(el.children).forEach(c => obs.observe(c));
    window.addEventListener('resize', updateMetrics);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [children, updateMetrics]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x scrollbar-hide"
        onScroll={updateMetrics}
        style={{ WebkitOverflowScrolling: 'touch' } as CSSProperties}
      >
        <div className="h-full w-max flex flex-row gap-3 px-3 py-2">{children}</div>
      </div>

      <div className="shrink-0 px-3 pb-0">
        <input
          aria-label="Rolar etapas do funil"
          type="range"
          min={0}
          max={maxScroll || 1}
          value={scrollLeft}
          disabled={maxScroll <= 0}
          onChange={(e) => {
            const el = scrollRef.current;
            if (!el) return;
            const next = Number(e.currentTarget.value);
            el.scrollLeft = next;
            setScrollLeft(next);
          }}
          className="funnel-horizontal-range block w-full"
        />
      </div>
    </div>
  );
};

// ============================================================================
// KANBAN CARD (compacto, otimizado para coluna de 280px)
// ============================================================================

const widgetValue = (widget: CardWidget, deal: Deal): string => {
  switch (widget.id) {
    case 'avatar_name': return deal.leadName;
    case 'property': return deal.property;
    case 'value': return formatCurrency(deal.value);
    case 'probability': return `${deal.probability}%`;
    case 'stage_badge': return deal.stage;
    case 'contacts': return deal.secondaryContacts?.map(c => c.name).join(', ') || '';
    case 'property_code': return deal.propertyCode;
    case 'current_stage': return deal.stage;
    default: return '';
  }
};

interface KanbanCardProps {
  deal: Deal;
  widgets: CardWidget[];
  onClick: () => void;
  onForcedAction?: (step: Exclude<ForcedStep, null>) => void;
}

const KanbanCard = ({ deal, widgets, onClick, onForcedAction }: KanbanCardProps) => {
  const forcedStep = inferForcedStep({
    status: deal.status,
    lostSubstage: deal.lostSubstage,
    nextActionAt: deal.nextActionAt,
    lastActivityAt: deal.lastActivityAt,
  });

  // Pegamos os 4 widgets mais relevantes pra exibir no card compacto
  const enabled = widgets.filter(w => w.enabled);
  const headerWidget = enabled.find(w => w.type === 'header' || w.id === 'avatar_name');
  const valueWidget = enabled.find(w => w.id === 'value');
  const subtitleWidgets = enabled
    .filter(w => w.id !== headerWidget?.id && w.id !== valueWidget?.id)
    .slice(0, 3);

  const initials = deal.leadName.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-xl border border-border bg-card p-2.5 space-y-1.5 active:scale-[0.98] transition-transform"
      >
        {/* Header: avatar + nome + valor */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
              {initials}
            </div>
            <p className="text-xs font-semibold text-foreground truncate">{deal.leadName}</p>
          </div>
          {valueWidget && (
            <span className="shrink-0 inline-flex items-center text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
              {formatCurrency(deal.value)}
            </span>
          )}
        </div>

        {/* Subtítulos / metadados */}
        {subtitleWidgets.length > 0 && (
          <div className="space-y-0.5 pl-0.5">
            {subtitleWidgets.map(w => {
              const v = widgetValue(w, deal);
              if (!v) return null;
              if (w.type === 'badge') {
                return (
                  <div key={w.id} className="flex items-center gap-1 min-w-0">
                    <span className="text-[8px] text-muted-foreground uppercase tracking-wider shrink-0">{w.label}:</span>
                    <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full truncate">{v}</span>
                  </div>
                );
              }
              if (w.type === 'contacts') {
                return (
                  <div key={w.id} className="flex items-center gap-1 min-w-0">
                    <Users size={9} className="text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground truncate">{v}</span>
                  </div>
                );
              }
              return (
                <p key={w.id} className="text-[10px] text-muted-foreground truncate">
                  <span className="text-[8px] uppercase tracking-wider">{w.label}: </span>
                  {v}
                </p>
              );
            })}
          </div>
        )}
      </button>

      {forcedStep && onForcedAction && (
        <DealActivityOverlay step={forcedStep} onAction={() => onForcedAction(forcedStep)} />
      )}
    </div>
  );
};

// ============================================================================
// KANBAN BOARD
// ============================================================================

export interface KanbanColumn {
  key: string;
  name: string;
  deals: Deal[];
  /** HSL color string (sem hsl(), só os valores), usado na borda superior da coluna */
  accent?: string;
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  widgets: CardWidget[];
  onCardClick: (deal: Deal) => void;
  onForcedAction?: (deal: Deal, step: Exclude<ForcedStep, null>) => void;
  emptyLabel?: string;
}

const DEFAULT_ACCENTS = [
  '190 70% 45%', '200 65% 50%', '250 55% 55%', '280 50% 55%',
  '310 45% 50%', '35 70% 50%', '25 75% 45%', '142 70% 45%',
];

export const KanbanBoard = ({
  columns,
  widgets,
  onCardClick,
  onForcedAction,
  emptyLabel = 'Nenhum lead nesta etapa',
}: KanbanBoardProps) => {
  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Nenhuma etapa configurada</p>
      </div>
    );
  }

  return (
    <HorizontalScroller>
      {columns.map((col, idx) => {
        const accent = col.accent || DEFAULT_ACCENTS[idx % DEFAULT_ACCENTS.length];
        const total = col.deals.reduce((sum, d) => sum + d.value, 0);
        return (
          <div
            key={col.key}
            className="w-[280px] shrink-0 rounded-xl border border-border bg-secondary/40 overflow-hidden flex flex-col h-full"
            style={{ borderTop: `3px solid hsl(${accent})` }}
          >
            {/* Header */}
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-border/60 shrink-0 bg-card/60">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-foreground truncate">{col.name}</span>
                <span className="text-[10px] font-bold bg-secondary text-foreground rounded-full px-1.5 py-0.5 shrink-0">
                  {col.deals.length}
                </span>
              </div>
              {total > 0 && (
                <span className="text-[10px] font-semibold text-primary shrink-0">
                  {formatCurrency(total)}
                </span>
              )}
            </div>

            {/* Cards */}
            <div
              className="kanban-vscroll flex-1 overflow-y-auto p-2 space-y-2"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
            >
              {col.deals.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 text-center py-6">{emptyLabel}</p>
              ) : (
                col.deals.map(deal => (
                  <KanbanCard
                    key={deal.id}
                    deal={deal}
                    widgets={widgets}
                    onClick={() => onCardClick(deal)}
                    onForcedAction={onForcedAction ? (step) => onForcedAction(deal, step) : undefined}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </HorizontalScroller>
  );
};

export default KanbanBoard;
