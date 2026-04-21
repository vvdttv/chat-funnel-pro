/**
 * Banner que exibe o status do dataset comportamental da IA (na nuvem x seed local)
 * e oferece a admins o botão de semear/atualizar a partir do iaBehavior.ts.
 */

import { useState } from 'react';
import { Sparkles, Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useIABehavior } from '@/hooks/useIABehavior';
import { useAuth } from '@/hooks/useAuth';

export const IABehaviorSeedBanner = () => {
  const { isAdmin } = useAuth();
  const { fromCloud, loading, rules, behaviors, ladders, triggers, playbooks, seedFromDefaults } = useIABehavior();
  const [seeding, setSeeding] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const counts = `${rules.length} regras · ${behaviors.length} comportamentos · ${ladders.length} escadas · ${triggers.length} gatilhos · ${playbooks.length} playbooks`;

  const handleSeed = async (overwrite: boolean) => {
    setSeeding(true);
    setFeedback(null);
    const res = await seedFromDefaults(overwrite);
    setSeeding(false);
    setFeedback(res.ok
      ? { kind: 'ok', text: overwrite ? 'Dataset sobrescrito com sucesso.' : 'Dataset semeado com sucesso.' }
      : { kind: 'err', text: res.error ?? 'Falha ao semear.' });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-3 mb-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-[hsl(270,40%,25%)]/50 border border-[hsl(270,40%,35%)] flex items-center justify-center shrink-0">
          <Sparkles size={14} className="text-[hsl(270,60%,70%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-foreground">Comportamento da IA</span>
            {loading ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 size={10} className="animate-spin" /> carregando…
              </span>
            ) : fromCloud ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-success">
                <Cloud size={10} /> na nuvem
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                <CloudOff size={10} /> usando seed local
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{counts}</p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-1.5 mt-2">
          {!fromCloud && (
            <button
              onClick={() => handleSeed(false)}
              disabled={seeding}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold active:scale-95 disabled:opacity-50"
            >
              {seeding ? <Loader2 size={11} className="animate-spin" /> : <Cloud size={11} />}
              Semear dataset padrão
            </button>
          )}
          {fromCloud && (
            <button
              onClick={() => handleSeed(true)}
              disabled={seeding}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-[11px] font-semibold active:scale-95 disabled:opacity-50"
            >
              {seeding ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Restaurar do padrão
            </button>
          )}
        </div>
      )}

      {feedback && (
        <p className={`mt-2 text-[10px] ${feedback.kind === 'ok' ? 'text-success' : 'text-destructive'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  );
};
