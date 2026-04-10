import { useState, useCallback, useRef } from 'react';
import { GripVertical, Eye, EyeOff, LayoutGrid, RotateCcw, Check } from 'lucide-react';
import { formatCurrency } from '@/data/mockData';

// ========== WIDGET DEFINITIONS ==========

export interface CardWidget {
  id: string;
  label: string;
  type: 'header' | 'stat' | 'badge' | 'text' | 'contacts';
  size: 'full' | 'half'; // full = 2 cols, half = 1 col
  enabled: boolean;
}

const ALL_WIDGETS: CardWidget[] = [
  { id: 'avatar_name', label: 'Avatar + Nome', type: 'header', size: 'full', enabled: true },
  { id: 'property', label: 'Imóvel', type: 'text', size: 'full', enabled: true },
  { id: 'value', label: 'Valor', type: 'stat', size: 'half', enabled: true },
  { id: 'probability', label: 'Probabilidade', type: 'stat', size: 'half', enabled: true },
  { id: 'funnel_badge', label: 'Funil', type: 'badge', size: 'half', enabled: true },
  { id: 'stage_badge', label: 'Etapa', type: 'badge', size: 'half', enabled: true },
  { id: 'contacts', label: 'Contatos Sec.', type: 'contacts', size: 'full', enabled: true },
  { id: 'phone', label: 'Telefone', type: 'text', size: 'half', enabled: false },
  { id: 'origin', label: 'Origem', type: 'badge', size: 'half', enabled: false },
  { id: 'created_at', label: 'Data Criação', type: 'text', size: 'half', enabled: false },
  { id: 'property_code', label: 'Código Imóvel', type: 'badge', size: 'half', enabled: false },
  { id: 'deal_id', label: 'ID Negócio', type: 'text', size: 'half', enabled: false },
  { id: 'lead_id', label: 'ID Lead', type: 'text', size: 'half', enabled: false },
];

export const getDefaultWidgets = (): CardWidget[] =>
  ALL_WIDGETS.map(w => ({ ...w }));

// ========== MOCK PREVIEW DATA ==========
const PREVIEW_DATA: Record<string, string> = {
  avatar_name: 'João Silva',
  property: 'Apt 302 - Ed. Solar',
  value: formatCurrency(450000),
  probability: '75%',
  funnel_badge: 'Vendas',
  stage_badge: 'Proposta',
  contacts: 'Maria (cônjuge)',
  phone: '(11) 99999-0000',
  origin: 'Site',
  created_at: '10/04/2026',
  property_code: 'AP-302',
  deal_id: 'D-001',
  lead_id: 'L-001',
};

// ========== WIDGET PREVIEW RENDERER ==========

const WidgetPreview = ({ widget }: { widget: CardWidget }) => {
  const val = PREVIEW_DATA[widget.id] || '—';

  if (widget.type === 'header') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
          JS
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{val}</p>
        </div>
      </div>
    );
  }

  if (widget.type === 'stat') {
    return (
      <div className="bg-secondary/60 rounded-lg p-2">
        <p className="text-[9px] text-muted-foreground leading-none">{widget.label}</p>
        <p className="text-xs font-bold text-primary mt-0.5">{val}</p>
      </div>
    );
  }

  if (widget.type === 'badge') {
    return (
      <span className="inline-block text-[9px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium truncate">
        {val}
      </span>
    );
  }

  if (widget.type === 'contacts') {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>👥</span>
        <span className="truncate">{val}</span>
      </div>
    );
  }

  // text
  return (
    <div>
      <p className="text-[9px] text-muted-foreground leading-none">{widget.label}</p>
      <p className="text-[11px] text-foreground mt-0.5 truncate">{val}</p>
    </div>
  );
};

// ========== LIVE CARD PREVIEW ==========

const CardPreview = ({ widgets }: { widgets: CardWidget[] }) => {
  const enabled = widgets.filter(w => w.enabled);
  if (enabled.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4 text-center">
        <p className="text-xs text-muted-foreground">Nenhum widget ativo</p>
      </div>
    );
  }

  // Build a grid: full-width items span 2 cols, half items span 1
  return (
    <div className="bg-card rounded-xl p-3">
      <div className="grid grid-cols-2 gap-1.5">
        {enabled.map(w => (
          <div
            key={w.id}
            className={w.size === 'full' ? 'col-span-2' : 'col-span-1'}
          >
            <WidgetPreview widget={w} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ========== DRAGGABLE WIDGET ROW ==========

const WidgetRow = ({
  widget,
  onToggle,
  onResize,
  dragHandlers,
  isDragging,
}: {
  widget: CardWidget;
  onToggle: () => void;
  onResize: () => void;
  dragHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  isDragging: boolean;
}) => (
  <div
    className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-all ${
      isDragging
        ? 'bg-primary/10 border border-primary/30 scale-[1.02] shadow-lg z-10'
        : widget.enabled
        ? 'bg-card border border-border'
        : 'bg-secondary/50 border border-transparent opacity-60'
    }`}
    {...dragHandlers}
  >
    <GripVertical size={14} className="text-muted-foreground shrink-0 cursor-grab" />

    <div className="flex-1 min-w-0">
      <p className={`text-xs font-medium truncate ${widget.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
        {widget.label}
      </p>
    </div>

    {/* Size toggle */}
    <button
      onClick={(e) => { e.stopPropagation(); onResize(); }}
      className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 active:scale-95 ${
        widget.size === 'full'
          ? 'bg-primary/15 text-primary'
          : 'bg-secondary text-muted-foreground'
      }`}
    >
      {widget.size === 'full' ? '100%' : '50%'}
    </button>

    {/* Enable/disable */}
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="p-1 shrink-0 active:scale-95"
    >
      {widget.enabled ? (
        <Eye size={14} className="text-primary" />
      ) : (
        <EyeOff size={14} className="text-muted-foreground" />
      )}
    </button>
  </div>
);

// ========== MAIN COMPONENT ==========

const CardWidgetConfig = ({
  widgets,
  onChange,
}: {
  widgets: CardWidget[];
  onChange: (w: CardWidget[]) => void;
}) => {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const startY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleWidget = useCallback(
    (id: string) => {
      onChange(widgets.map(w => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
    },
    [widgets, onChange]
  );

  const resizeWidget = useCallback(
    (id: string) => {
      onChange(
        widgets.map(w =>
          w.id === id ? { ...w, size: w.size === 'full' ? 'half' : 'full' } : w
        )
      );
    },
    [widgets, onChange]
  );

  const resetWidgets = useCallback(() => {
    onChange(getDefaultWidgets());
  }, [onChange]);

  // Simple touch-based reorder
  const handleTouchStart = (idx: number) => (e: React.TouchEvent) => {
    setDraggingIdx(idx);
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (idx: number) => (e: React.TouchEvent) => {
    if (draggingIdx === null || !listRef.current) return;
    const deltaY = e.touches[0].clientY - startY.current;
    const rowH = 44; // approx row height
    const steps = Math.round(deltaY / rowH);
    if (steps === 0) return;
    const newIdx = Math.max(0, Math.min(widgets.length - 1, idx + steps));
    if (newIdx !== idx) {
      const updated = [...widgets];
      const [moved] = updated.splice(idx, 1);
      updated.splice(newIdx, 0, moved);
      onChange(updated);
      setDraggingIdx(newIdx);
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = () => {
    setDraggingIdx(null);
  };

  const enabledCount = widgets.filter(w => w.enabled).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <LayoutGrid size={14} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">Layout do Card</span>
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {enabledCount} widgets
          </span>
        </div>
        <button
          onClick={resetWidgets}
          className="flex items-center gap-1 text-[10px] text-muted-foreground active:scale-95"
        >
          <RotateCcw size={10} /> Resetar
        </button>
      </div>

      {/* Live Preview */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Preview</p>
        <CardPreview widgets={widgets} />
      </div>

      {/* Widget list */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
          Arraste para reordenar · Toque no 👁 para ativar/desativar
        </p>
        <div ref={listRef} className="space-y-1">
          {widgets.map((w, i) => (
            <WidgetRow
              key={w.id}
              widget={w}
              onToggle={() => toggleWidget(w.id)}
              onResize={() => resizeWidget(w.id)}
              isDragging={draggingIdx === i}
              dragHandlers={{
                onTouchStart: handleTouchStart(i),
                onTouchMove: handleTouchMove(i),
                onTouchEnd: handleTouchEnd,
              }}
            />
          ))}
        </div>
      </div>

      {/* Save indicator */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Check size={10} className="text-primary" />
        <span>Alterações salvas automaticamente</span>
      </div>
    </div>
  );
};

export default CardWidgetConfig;
export type { CardWidget as CardWidgetType };
