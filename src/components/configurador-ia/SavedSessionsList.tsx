/**
 * SavedSessionsList — lista didática de configurações já criadas
 * pelo configurador conversacional. Permite "Ver detalhes" (resumo
 * humano + chips por tipo de artefato) e "Ajustar" (reabre o fluxo
 * conversacional pré-preenchido com a mensagem original e o trio fixo).
 *
 * Mantém-se simples e mobile-first: cards roláveis, sem edição direta
 * de SQL/JSON. Para alterações, o usuário descreve o ajuste em pt-BR
 * e o composer regenera o plano.
 */
import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, MessageSquareText, Pencil, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { FixedAnswers } from '@/hooks/useBehaviorComposer';

export interface SavedSession {
  id: string;
  created_at: string;
  original_message: string;
  human_summary: string;
  fixed_answers: FixedAnswers;
  generated_plan: {
    artifacts?: {
      leadBehaviors?: unknown[];
      iaRules?: unknown[];
      skills?: unknown[];
      playbookOverrides?: unknown[];
    };
  };
}

interface Props {
  refreshKey?: number;
  onAdjust: (session: SavedSession) => void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const ArtifactChip = ({ label, count, color }: { label: string; count: number; color: string }) => {
  if (count === 0) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {count} {label}
    </span>
  );
};

export const SavedSessionsList = ({ refreshKey = 0, onAdjust }: Props) => {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<SavedSession | null>(null);

  useEffect(() => {
    const orgId = profile?.organization_id;
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const { data, error: e } = await supabase
        .from('ia_config_sessions')
        .select('id, created_at, original_message, human_summary, fixed_answers, generated_plan')
        .eq('organization_id', orgId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancelled) return;
      if (e) setError(e.message);
      else setSessions((data ?? []) as unknown as SavedSession[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.organization_id, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
        <Loader2 size={14} className="animate-spin" /> Carregando configurações…
      </div>
    );
  }

  if (error) {
    return <div className="text-xs text-destructive py-2">Erro: {error}</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-card/50 border border-dashed border-border rounded-xl p-4 text-center">
        <MessageSquareText size={20} className="mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-foreground font-medium">Nada configurado ainda</div>
        <div className="text-xs text-muted-foreground mt-1">
          Quando você descrever um comportamento aqui em cima, ele aparece nesta lista.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {sessions.map(s => {
          const arts = s.generated_plan?.artifacts ?? {};
          return (
            <button
              key={s.id}
              onClick={() => setDetailSession(s)}
              className="w-full text-left bg-card border border-border rounded-xl p-3 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-muted-foreground mb-1">{formatDate(s.created_at)}</div>
                  <div className="text-sm text-foreground line-clamp-2 leading-snug">
                    {s.human_summary || s.original_message}
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <ArtifactChip label="comportamento(s)" count={arts.leadBehaviors?.length ?? 0} color="bg-primary/15 text-primary" />
                <ArtifactChip label="regra(s)" count={arts.iaRules?.length ?? 0} color="bg-amber-500/15 text-amber-400" />
                <ArtifactChip label="habilidade(s)" count={arts.skills?.length ?? 0} color="bg-purple-500/15 text-purple-300" />
                <ArtifactChip label="ajuste(s)" count={arts.playbookOverrides?.length ?? 0} color="bg-sky-500/15 text-sky-300" />
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={!!detailSession} onOpenChange={(o) => !o && setDetailSession(null)}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto p-0 max-w-md mx-auto">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="text-base flex items-center gap-2">
              <Sparkles size={16} className="text-primary" /> Detalhes da configuração
            </SheetTitle>
          </SheetHeader>
          {detailSession && (
            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Sua intenção original</div>
                <div className="bg-card border border-border rounded-lg p-3 text-sm text-foreground italic">
                  "{detailSession.original_message}"
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">O que a IA entendeu</div>
                <div className="text-sm text-foreground leading-relaxed">
                  {detailSession.human_summary || '—'}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">O que foi criado</div>
                <div className="grid grid-cols-2 gap-2">
                  <CountBox label="Comportamentos" count={detailSession.generated_plan?.artifacts?.leadBehaviors?.length ?? 0} color="text-primary" />
                  <CountBox label="Regras" count={detailSession.generated_plan?.artifacts?.iaRules?.length ?? 0} color="text-amber-400" />
                  <CountBox label="Habilidades" count={detailSession.generated_plan?.artifacts?.skills?.length ?? 0} color="text-purple-300" />
                  <CountBox label="Ajustes de etapa" count={detailSession.generated_plan?.artifacts?.playbookOverrides?.length ?? 0} color="text-sky-300" />
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-3">
                Pra alterar essa configuração, toque em <strong>Ajustar</strong>: você descreve a mudança em português e a IA refaz o plano sem você precisar mexer em nada técnico.
              </div>

              <button
                onClick={() => { onAdjust(detailSession); setDetailSession(null); }}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Pencil size={14} /> Ajustar essa configuração
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const CountBox = ({ label, count, color }: { label: string; count: number; color: string }) => (
  <div className="bg-card border border-border rounded-lg p-2.5">
    <div className={`text-xl font-bold ${color}`}>{count}</div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
  </div>
);
