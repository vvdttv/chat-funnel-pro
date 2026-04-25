/**
 * Hook que invoca a edge `ia-respond-to-lead`.
 * Suporta modo `dryRun` para o simulador (não loga nem envia).
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface IaRespondInput {
  dealId?: string;
  funnelId: string;
  stageId: string;
  dealStatus?: 'open' | 'won' | 'lost';
  leadMessage: string;
  conversationHistory?: Array<{ role: 'lead' | 'agent' | 'ai'; content: string }>;
  dryRun?: boolean;
}

export interface IaRespondResult {
  detectedBehaviorCodes: string[];
  activatedSkillCode: string | null;
  handoff: { triggered: boolean; reason?: string; priority?: string; code?: string | null };
  response: string | null;
  appliedRuleCodes: string[];
  appliedOverrideIds: string[];
  archetypeCode: string | null;
  statusOverlayCode: string | null;
  contextTags: string[];
  systemPrompt: string;
  logId: string | null;
  dryRun: boolean;
}

export function useIaRespondToLead() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = useCallback(async (input: IaRespondInput): Promise<IaRespondResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ia-respond-to-lead', {
        body: {
          deal_id: input.dealId,
          funnel_id: input.funnelId,
          stage_id: input.stageId,
          deal_status: input.dealStatus ?? 'open',
          lead_message: input.leadMessage,
          conversation_history: input.conversationHistory ?? [],
          dry_run: input.dryRun === true,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as IaRespondResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao gerar resposta';
      setError(msg);
      console.error('[useIaRespondToLead]', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { respond, loading, error };
}
