import { type CSSProperties, type ReactNode, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Deal } from '@/data/mockData';
import type { CardWidget } from '@/components/CardWidgetConfig';
import type { Tag } from '@/types/tags';
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

// Constante estável: deal sem tags reusa o mesmo array em todos os cards,
// permitindo que React.memo de fato pule re-render quando nada mudou.
const EMPTY_TAGS: Tag[] = [];

interface KanbanCardProps {
  deal: Deal;
  widgets: CardWidget[];
  // Recebe o callback genérico em vez de uma closure pré-aplicada — assim o
  // prop tem referência estável (vem de useCallback no FunisPage) e o memo
  // realmente pula re-renders.
  onCardClick: (deal: Deal) => void;
  onForcedAction?: (deal: Deal, step: Exclude<ForcedStep, null>) => void;
}

const KanbanCardBase = ({ deal, widgets, onCardClick, onForcedAction }: KanbanCardProps) => {
  const tags = deal.tags ?? EMPTY_TAGS;
  const onClick = () => onCardClick(deal);
  const forcedStep = inferForcedStep({
    status: deal.status,
    lostSubstage: deal.lostSubstage,
    nextActionAt: deal.nextActionAt,
    lastActivityAt: deal.lastActivityAt,
  });

  // Selecionamos os quatro widgets mais relevantes para exibir no card compacto.
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
        className="w-full text-left rounded-md border border-border bg-card hover:bg-card/80 hover:border-primary/30 p-2 space-y-1 active:scale-[0.98] transition-all"
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
            <span className="shrink-0 inline-flex items-center text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 mr-4">
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

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-0.5">
            {tags.map(tag => (
              <div
                key={tag.id}
                className="h-4 text-[9px] rounded-full font-medium"
                style={{
                  backgroundColor: `${tag.color}1a`,
                  color: tag.color,
                }}
              >
                {tag.name}
              </div>
            ))}
          </div>
        )}
      </button>

      {forcedStep && onForcedAction && (
        <DealActivityOverlay step={forcedStep} onAction={() => onForcedAction(deal, forcedStep)} />
      )}
    </div>
  );
};

// Comparação rasa custom: re-renderiza só se algo relevante do card mudou.
// onCardClick/onForcedAction são funções estáveis (useCallback no FunisPage),
// então a referência do deal sozinha já decide. widgets vem do contexto e é
// memoizado upstream.
const KanbanCard = memo(KanbanCardBase, (prev, next) => {
  if (prev.deal !== next.deal) return false;
  if (prev.widgets !== next.widgets) return false;
  if (prev.onCardClick !== next.onCardClick) return false;
  if (prev.onForcedAction !== next.onForcedAction) return false;
  return true;
});

// ============================================================================
// VIRTUALIZED COLUMN BODY
// ============================================================================

interface VirtualColumnProps {
  deals: Deal[];
  widgets: CardWidget[];
  emptyLabel: string;
  onCardClick: (deal: Deal) => void;
  onForcedAction?: (deal: Deal, step: Exclude<ForcedStep, null>) => void;
}

// Altura estimada de cada card (px). O virtualizer mede e ajusta dinamicamente,
// mas começamos com um valor coerente com o layout compacto atual.
const ESTIMATED_CARD_HEIGHT = 84;
const CARD_GAP = 6;

const VirtualColumn = ({ deals, widgets, emptyLabel, onCardClick, onForcedAction }: VirtualColumnProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: deals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT + CARD_GAP,
    overscan: 6,
    getItemKey: (index) => deals[index].id,
  });

  if (deals.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-1.5">
        <p className="text-[11px] text-muted-foreground/50 text-center py-5">{emptyLabel}</p>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className="kanban-vscroll flex-1 overflow-y-auto p-1.5"
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
    >
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {virtualItems.map((row) => {
          const deal = deals[row.index];
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
                paddingBottom: CARD_GAP,
              }}
            >
              <KanbanCard
                deal={deal}
                widgets={widgets}
                onCardClick={onCardClick}
                onForcedAction={onForcedAction}
              />
            </div>
          );
        })}
      </div>
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
  tags?: Tag[];
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

  // O quadro inteiro e um viewport fixo: wheel/swipe DENTRO dele nunca rola
  // a pagina. Se o cursor estiver sobre uma coluna (data-kanban-column),
  // rola apenas os cards daquela coluna. Sobre os gaps entre colunas, nao
  // rola nada. preventDefault e sempre chamado para garantir.
  const handleBoardWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const column = target?.closest('[data-kanban-column]') as HTMLElement | null;
    if (column) {
      const scroller = column.querySelector<HTMLDivElement>('.kanban-vscroll');
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop += e.deltaY;
      }
    }
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col" onWheel={handleBoardWheel}>
      <HorizontalScroller>
        {columns.map((col, idx) => {
          const accent = col.accent || DEFAULT_ACCENTS[idx % DEFAULT_ACCENTS.length];
          const total = col.deals.reduce((sum, d) => sum + d.value, 0);
          return (
            <div
              key={col.key}
              data-kanban-column={col.key}
              className="w-[260px] shrink-0 rounded-md border border-border bg-secondary/40 overflow-hidden flex flex-col h-full"
              style={{ borderTop: `2px solid hsl(${accent})` }}
            >
              {/* Header — magro: 28px de altura */}
              <div className="px-2.5 h-8 flex items-center justify-between border-b border-border/60 shrink-0 bg-card/60">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold text-foreground truncate">{col.name}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground shrink-0">
                    {col.deals.length}
                  </span>
                </div>
                {total > 0 && (
                  <span className="text-[10px] font-semibold text-primary/80 shrink-0 tabular-nums">
                    {formatCurrency(total)}
                  </span>
                )}
              </div>

              {/* Cards — virtualizados (renderiza só os visíveis no viewport) */}
              <VirtualColumn
                deals={col.deals}
                widgets={widgets}
                emptyLabel={emptyLabel}
                onCardClick={onCardClick}
                onForcedAction={onForcedAction}
              />
            </div>
          );
        })}
      </HorizontalScroller>
    </div>
  );
};

export default KanbanBoard;
