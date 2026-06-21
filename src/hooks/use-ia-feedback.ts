import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FeedbackInterpretation {
  summary: string;
  payload: Record<string, unknown>;
  funnel_id: string;
  stage_id: string;
}

interface UseIAFeedbackResult {
  busy: boolean;
  error: string | null;
  /** Interpreta o feedback (não grava). Retorna a interpretação p/ confirmação. */
  interpret: (args: { feedbackText: string; funnelId: string; stageId: string; dealId?: string; sourceDecisionLogId?: string }) => Promise<FeedbackInterpretation | null>;
  /** Aplica (grava o override) após confirmação do usuário. */
  apply: (args: { feedbackText: string; interpretedSummary: string; funnelId: string; stageId: string; payload: Record<string, unknown>; dealId?: string }) => Promise<boolean>;
}

/** Modo Treinador — Canal 1 (painel). Conversa com a edge ia-feedback. */
export function useIAFeedback(): UseIAFeedbackResult {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const interpret = useCallback(async (args: { feedbackText: string; funnelId: string; stageId: string; dealId?: string; sourceDecisionLogId?: string }): Promise<FeedbackInterpretation | null> => {
    setBusy(true); setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('ia-feedback', {
        body: {
          action: 'interpret',
          feedback_text: args.feedbackText,
          funnel_id: args.funnelId,
          stage_id: args.stageId,
          deal_id: args.dealId ?? null,
          source_decision_log_id: args.sourceDecisionLogId ?? null,
          channel: 'painel',
        },
      });
      if (err) throw err;
      if (!data?.ok || !data?.interpreted) throw new Error(data?.error ?? 'falha ao interpretar');
      return { summary: data.summary, payload: data.payload, funnel_id: data.funnel_id, stage_id: data.stage_id };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro'); return null;
    } finally { setBusy(false); }
  }, []);

  const apply = useCallback(async (args: { feedbackText: string; interpretedSummary: string; funnelId: string; stageId: string; payload: Record<string, unknown>; dealId?: string }): Promise<boolean> => {
    setBusy(true); setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('ia-feedback', {
        body: {
          action: 'apply',
          feedback_text: args.feedbackText,
          interpreted_summary: args.interpretedSummary,
          funnel_id: args.funnelId,
          stage_id: args.stageId,
          payload: args.payload,
          deal_id: args.dealId ?? null,
          channel: 'painel',
        },
      });
      if (err) throw err;
      if (!data?.ok || !data?.applied) throw new Error(data?.error ?? 'falha ao salvar');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro'); return false;
    } finally { setBusy(false); }
  }, []);

  return { busy, error, interpret, apply };
}
