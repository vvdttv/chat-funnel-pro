import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StageMetrics } from '@/data/mockData';

const EMPTY: StageMetrics = {
  totalValue: 0,
  dealCount: 0,
  closeProbability: 0,
  advanceProbability: 0,
  avgDaysToAdvance: 0,
  avgDaysToClose: 0,
};

/**
 * Busca métricas reais de uma etapa (calculadas no banco a partir do
 * histórico em deal_stage_events). Retorna { metrics, loading }.
 */
export function useStageMetrics(funnelId: string | undefined, stageId: string | undefined, refreshKey: number = 0) {
  const [metrics, setMetrics] = useState<StageMetrics>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!funnelId || !stageId) {
      setMetrics(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_stage_metrics', {
        p_funnel_id: funnelId,
        p_stage_id: stageId,
      });
      if (cancelled) return;
      if (error) {
        console.error('[useStageMetrics] erro', error);
        setMetrics(EMPTY);
        setLoading(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setMetrics(EMPTY);
      } else {
        setMetrics({
          totalValue: Number(row.total_value) || 0,
          dealCount: Number(row.deal_count) || 0,
          closeProbability: Number(row.close_probability) || 0,
          advanceProbability: Number(row.advance_probability) || 0,
          avgDaysToAdvance: Number(row.avg_days_to_advance) || 0,
          avgDaysToClose: Number(row.avg_days_to_close) || 0,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [funnelId, stageId, refreshKey]);

  return { metrics, loading };
}
