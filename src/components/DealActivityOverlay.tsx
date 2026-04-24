/**
 * Overlay exibido sobre o card do deal quando `inferForcedStep` retorna não-null.
 * Bloqueia interações de avanço/movimentação até o usuário registrar a atividade.
 */
import { Lock, AlertTriangle, Clock } from 'lucide-react';
import { type ForcedStep, FORCED_STEP_LABELS } from '@/lib/activityBlocking';

const ICONS: Record<Exclude<ForcedStep, null>, typeof Lock> = {
  resolve_overdue: AlertTriangle,
  register_outcome: Lock,
  schedule_next: Clock,
};

const TONE: Record<Exclude<ForcedStep, null>, { bg: string; text: string }> = {
  resolve_overdue: { bg: 'bg-destructive/15', text: 'text-destructive' },
  register_outcome: { bg: 'bg-primary/15', text: 'text-primary' },
  schedule_next: { bg: 'bg-warning/15', text: 'text-warning' },
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

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/85 backdrop-blur-sm p-4">
      <div className="flex flex-col items-center text-center max-w-[280px]">
        <div className={`w-12 h-12 rounded-full ${tone.bg} ${tone.text} flex items-center justify-center mb-3`}>
          <Icon size={22} />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">{meta.title}</p>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{meta.description}</p>
        <button
          onClick={onAction}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${tone.bg} ${tone.text} active:scale-95 transition-transform border border-current/20`}
        >
          {meta.cta}
        </button>
      </div>
    </div>
  );
};
