/**
 * Indicador compacto exibido no canto superior direito do card quando
 * `inferForcedStep` retorna não-null. Apenas sinaliza que o deal precisa de
 * ação — o clique dispara o mesmo fluxo (resolveActivity / agendar próxima).
 *
 * Antes era um overlay full-card com backdrop-filter: blur(), que custava
 * uma camada de composição GPU por card. Com a virtualização rolando 10-15
 * cards visíveis e dezenas bloqueados na visão Lead, isso travava o scroll.
 */
import { Lock, AlertTriangle, Clock } from 'lucide-react';
import { type ForcedStep, FORCED_STEP_LABELS } from '@/lib/activityBlocking';

const ICONS: Record<Exclude<ForcedStep, null>, typeof Lock> = {
  resolve_overdue: AlertTriangle,
  register_outcome: Lock,
  schedule_next: Clock,
};

const TONE: Record<Exclude<ForcedStep, null>, { bg: string; text: string; ring: string }> = {
  resolve_overdue: { bg: 'bg-destructive', text: 'text-destructive-foreground', ring: 'ring-destructive/30' },
  register_outcome: { bg: 'bg-primary', text: 'text-primary-foreground', ring: 'ring-primary/30' },
  schedule_next: { bg: 'bg-warning', text: 'text-warning-foreground', ring: 'ring-warning/30' },
};

export const DealActivityOverlay = ({
  step,
  onAction,
}: {
  step: Exclude<ForcedStep, null>;
  onAction: () => void;
}) => {
  const Icon = ICONS[step];
  const meta = FORCED_STEP_LABELS[step];
  const tone = TONE[step];

  // Badge no canto: 16px, dentro do card (right-1 top-1), com tooltip nativo.
  // Não usa backdrop-blur — visual leve, sem custo de GPU por card.
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAction(); }}
      title={`${meta.title} — ${meta.cta}`}
      aria-label={`${meta.title}: ${meta.cta}`}
      className={`absolute right-1 top-1 z-20 w-4 h-4 rounded-full ${tone.bg} ${tone.text} ring-2 ${tone.ring} flex items-center justify-center shadow-sm hover:scale-110 transition-transform`}
    >
      <Icon size={9} strokeWidth={2.5} />
    </button>
  );
};
