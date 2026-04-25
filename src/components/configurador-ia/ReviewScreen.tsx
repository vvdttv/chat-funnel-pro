/**
 * Tela de revisão do plano gerado: resumo humano em português, chips por tipo
 * de artefato (comportamento/regra/habilidade/ajuste personalizado), warnings
 * de conflito e detalhes técnicos colapsados. Botões Salvar / Ajustar / Cancelar.
 */
import { AlertTriangle, ChevronDown, ChevronUp, Save, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { ComposedPlan } from '@/hooks/useBehaviorComposer';

interface Props {
  plan: ComposedPlan;
  saving: boolean;
  onSave: () => void;
  onAdjust: () => void;
  onCancel: () => void;
}

const ARTIFACT_LABELS: Record<string, { label: string; color: string }> = {
  leadBehaviors: { label: 'Comportamento de lead', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  iaRules: { label: 'Regra de IA', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  skills: { label: 'Habilidade', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  playbookOverrides: { label: 'Ajuste personalizado', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

export const ReviewScreen = ({ plan, saving, onSave, onAdjust, onCancel }: Props) => {
  const [showTech, setShowTech] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-2 mb-3">
          <Sparkles size={18} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm text-foreground leading-relaxed">{plan.humanSummary || 'A IA preparou esta configuração.'}</div>
        </div>

        <div className="space-y-2">
          {(['leadBehaviors', 'iaRules', 'skills', 'playbookOverrides'] as const).map(key => {
            const items = (plan.artifacts[key] ?? []) as Array<Record<string, unknown>>;
            if (items.length === 0) return null;
            const meta = ARTIFACT_LABELS[key];
            return (
              <div key={key} className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{meta.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((it, i) => (
                    <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${meta.color}`}>
                      {(it.label as string) ?? (it.name as string) ?? (it.text as string)?.slice(0, 50) ?? `Item ${i + 1}`}
                      {it.reuseOf ? ' · reaproveitado' : ''}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {plan.warnings && plan.warnings.length > 0 && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-200 space-y-1">
                {plan.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowTech(s => !s)}
          className="mt-3 text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {showTech ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showTech ? 'Esconder' : 'Ver'} detalhes técnicos
        </button>
        {showTech && (
          <pre className="mt-2 text-[10px] bg-background border border-border rounded p-2 max-h-60 overflow-auto text-muted-foreground">
            {JSON.stringify(plan.artifacts, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border text-sm text-muted-foreground active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          <X size={14} /> Cancelar
        </button>
        <button
          onClick={onAdjust}
          disabled={saving}
          className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          Ajustar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          <Save size={14} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
};
