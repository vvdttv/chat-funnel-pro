import { Bot, BotOff, MessageCircleQuestion, ShieldCheck, Timer } from 'lucide-react';
import type { FunnelStage } from '@/data/mockData';

type AutonomyMode = NonNullable<FunnelStage['aiAutonomyMode']>;

interface Props {
  stage: FunnelStage;
  onUpdate: (s: FunnelStage) => void;
}

const MODE_OPTIONS: {
  value: AutonomyMode;
  label: string;
  description: string;
  icon: typeof Bot;
  iconClass: string;
}[] = [
  {
    value: 'autonomous',
    label: 'Autônoma',
    description: 'IA responde sozinha após o atraso configurado.',
    icon: Bot,
    iconClass: 'text-primary',
  },
  {
    value: 'approval_first_n',
    label: 'Aprovar primeiras N',
    description: 'Aprovação humana nas primeiras N respostas, depois autônoma.',
    icon: ShieldCheck,
    iconClass: 'text-amber-400',
  },
  {
    value: 'suggest_only',
    label: 'Sugerir apenas',
    description: 'IA monta a resposta; corretor sempre aprova/edita antes de enviar.',
    icon: MessageCircleQuestion,
    iconClass: 'text-blue-400',
  },
  {
    value: 'disabled',
    label: 'Desligada',
    description: 'IA não responde nesta etapa. Tudo manual.',
    icon: BotOff,
    iconClass: 'text-muted-foreground',
  },
];

export const StageAutonomyConfig = ({ stage, onUpdate }: Props) => {
  const mode: AutonomyMode = stage.aiAutonomyMode ?? 'suggest_only';
  const threshold = stage.aiApprovalThreshold ?? 3;
  const delay = stage.aiResponseDelaySeconds ?? 0;

  const setMode = (next: AutonomyMode) => onUpdate({ ...stage, aiAutonomyMode: next });

  return (
    <div className="bg-secondary rounded-lg p-2.5 mb-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Bot size={12} className="text-muted-foreground" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Autonomia da IA
        </span>
      </div>

      {/* Grid 2x2 de modos */}
      <div className="grid grid-cols-2 gap-1.5">
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={`text-left rounded-md p-2 border transition-colors active:scale-[0.99] ${
                active
                  ? 'bg-primary/15 border-primary/50'
                  : 'bg-card border-border'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon size={11} className={active ? 'text-primary' : opt.iconClass} />
                <span className={`text-[10px] font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                  {opt.label}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground leading-tight">{opt.description}</p>
            </button>
          );
        })}
      </div>

      {/* Threshold para approval_first_n */}
      {mode === 'approval_first_n' && (
        <div className="flex items-center justify-between bg-card rounded-md px-2.5 py-1.5 border border-border">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={11} className="text-amber-400" />
            <span className="text-[10px] text-foreground">Aprovar as primeiras</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={50}
              value={threshold}
              onChange={(e) =>
                onUpdate({
                  ...stage,
                  aiApprovalThreshold: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                })
              }
              className="w-12 bg-background border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground text-center outline-none focus:border-primary/50"
            />
            <span className="text-[10px] text-muted-foreground">respostas</span>
          </div>
        </div>
      )}

      {/* Delay (não se aplica quando desligada ou sugerir apenas) */}
      {(mode === 'autonomous' || mode === 'approval_first_n') && (
        <div className="flex items-center justify-between bg-card rounded-md px-2.5 py-1.5 border border-border">
          <div className="flex items-center gap-1.5">
            <Timer size={11} className="text-muted-foreground" />
            <span className="text-[10px] text-foreground">Atraso antes de enviar</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={3600}
              value={delay}
              onChange={(e) =>
                onUpdate({
                  ...stage,
                  aiResponseDelaySeconds: Math.max(0, Math.min(3600, Number(e.target.value) || 0)),
                })
              }
              className="w-14 bg-background border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground text-center outline-none focus:border-primary/50"
            />
            <span className="text-[10px] text-muted-foreground">seg</span>
          </div>
        </div>
      )}
    </div>
  );
};
