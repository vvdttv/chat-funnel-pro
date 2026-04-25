/**
 * Trio fixo de perguntas estruturadas que precedem as perguntas customizadas:
 * abrangência, gatilho e polaridade. Usa chips touch-friendly e mostra
 * indicador "↻ da última vez" para reuso quando o usuário já configurou antes.
 */
import { ArrowRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { FixedAnswers, Polarity, Scope } from '@/hooks/useBehaviorComposer';
import { useFunnelsContext } from '@/hooks/useFunnels';
import type { IaConfigPrefs } from '@/hooks/useIaConfigPrefs';

interface Props {
  prefs: IaConfigPrefs | null;
  onSubmit: (answers: FixedAnswers) => void;
}

const SCOPE_OPTIONS: Array<{ value: Scope; label: string; hint: string }> = [
  { value: 'universal', label: 'Toda a IA', hint: 'vale para todos os funis e etapas' },
  { value: 'funnel', label: 'Um funil específico', hint: 'só dentro de um funil' },
  { value: 'stage', label: 'Uma etapa específica', hint: 'só em uma etapa de um funil' },
  { value: 'multi', label: 'Várias etapas', hint: 'escolho onde aplicar' },
];

const TRIGGER_OPTIONS: Array<{ value: FixedAnswers['trigger']; label: string; hint: string }> = [
  { value: 'always', label: 'Sempre', hint: 'a IA aplica essa configuração o tempo todo' },
  { value: 'lead_action', label: 'Quando o lead faz algo', hint: 'reação a uma ação específica do lead' },
  { value: 'message_moment', label: 'Em um momento da conversa', hint: 'gatilho ligado ao fluxo da conversa' },
];

const POLARITY_OPTIONS: Array<{ value: Polarity; label: string; hint: string }> = [
  { value: 'do', label: 'A IA DEVE fazer', hint: 'quando essa situação ocorrer, faça isto' },
  { value: 'dont', label: 'A IA NÃO PODE fazer', hint: 'nunca faça isso' },
  { value: 'ask', label: 'A IA DEVE perguntar', hint: 'sempre que possível, pergunte' },
  { value: 'noask', label: 'A IA NÃO PODE perguntar', hint: 'nunca pergunte sobre isso' },
];

export const FixedTrioQuestions = ({ prefs, onSubmit }: Props) => {
  const { funnels } = useFunnelsContext();
  const [scope, setScope] = useState<Scope | null>(prefs?.last_scope as Scope ?? null);
  const [scopeIds, setScopeIds] = useState<string[]>(prefs?.last_scope_ids ?? []);
  const [trigger, setTrigger] = useState<FixedAnswers['trigger'] | null>(prefs?.last_trigger as FixedAnswers['trigger'] ?? null);
  const [triggerDescription, setTriggerDescription] = useState('');
  const [polarity, setPolarity] = useState<Polarity | null>(prefs?.last_polarity as Polarity ?? null);

  const reusedScope = !!prefs?.last_scope && scope === prefs.last_scope;
  const reusedTrigger = !!prefs?.last_trigger && trigger === prefs.last_trigger;
  const reusedPolarity = !!prefs?.last_polarity && polarity === prefs.last_polarity;

  const canSubmit =
    !!scope && !!trigger && !!polarity &&
    (scope === 'universal' || scopeIds.length > 0) &&
    (trigger === 'always' || triggerDescription.trim().length > 0);

  const stageOptions: Array<{ id: string; label: string }> = [];
  for (const f of funnels) {
    const stages = (f as unknown as { stages?: Array<{ id: string; name: string }> }).stages ?? [];
    for (const s of stages) stageOptions.push({ id: `${f.id}::${s.id}`, label: `${f.name} → ${s.name}` });
  }

  return (
    <div className="space-y-5 bg-card border border-border rounded-xl p-4">
      <div>
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          Onde isso vale? {reusedScope && <RotateCcw size={12} className="text-primary" aria-label="da última vez" />}
        </label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {SCOPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setScope(opt.value); if (opt.value === 'universal') setScopeIds([]); }}
              className={`text-left px-3 py-2 rounded-lg border transition-colors active:scale-95 ${
                scope === opt.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[11px] opacity-70">{opt.hint}</div>
            </button>
          ))}
        </div>
        {(scope === 'funnel' || scope === 'stage' || scope === 'multi') && (
          <div className="mt-3">
            <label className="text-xs text-muted-foreground">Selecione {scope === 'funnel' ? 'o funil' : scope === 'stage' ? 'a etapa' : 'as etapas'}:</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {(scope === 'funnel' ? funnels.map(f => ({ id: f.id, label: f.name })) : stageOptions).map(opt => {
                const selected = scopeIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (scope === 'funnel' || scope === 'stage') setScopeIds([opt.id]);
                      else setScopeIds(selected ? scopeIds.filter(i => i !== opt.id) : [...scopeIds, opt.id]);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-full border ${selected ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground'}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          Quando a IA dispara isso? {reusedTrigger && <RotateCcw size={12} className="text-primary" aria-label="da última vez" />}
        </label>
        <div className="space-y-1.5 mt-2">
          {TRIGGER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTrigger(opt.value)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors active:scale-95 ${
                trigger === opt.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[11px] opacity-70">{opt.hint}</div>
            </button>
          ))}
        </div>
        {trigger && trigger !== 'always' && (
          <textarea
            value={triggerDescription}
            onChange={e => setTriggerDescription(e.target.value)}
            placeholder={trigger === 'lead_action' ? 'Ex: quando o lead pedir desconto' : 'Ex: na primeira mensagem do dia'}
            className="mt-2 w-full text-sm bg-background border border-border rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            rows={2}
          />
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          Qual é a regra? {reusedPolarity && <RotateCcw size={12} className="text-primary" aria-label="da última vez" />}
        </label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {POLARITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPolarity(opt.value)}
              className={`text-left px-3 py-2 rounded-lg border transition-colors active:scale-95 ${
                polarity === opt.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground'
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[11px] opacity-70">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={!canSubmit}
        onClick={() => canSubmit && onSubmit({
          scope: scope!, scopeIds: scopeIds.length ? scopeIds : undefined,
          trigger: trigger!,
          triggerDescription: triggerDescription.trim() || undefined,
          polarity: polarity!,
        })}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        Continuar <ArrowRight size={16} />
      </button>
    </div>
  );
};
