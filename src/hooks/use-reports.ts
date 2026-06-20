import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ORG = '11111111-1111-1111-1111-111111111111';

export interface FunnelReportSummary {
  total_leads: number;
  won_count: number;
  lost_count: number;
  open_count: number;
  won_value: number;
  total_value: number;
  avg_ticket: number;
  conversion_rate: number;
  avg_cycle_days: number;
}

export interface FunnelReportStage {
  stage_id: string;
  stage_name: string;
  stage_position: number;
  entered_count: number;
  conversion_to_next: number;
  avg_days_in_stage: number;
}

export interface TimeseriesPoint {
  bucket: string;
  new_leads: number;
  won_count: number;
  lost_count: number;
  won_value: number;
}

export interface LossReason {
  reason: string;
  loss_count: number;
  lost_value: number;
  pct: number;
}

export type Granularity = 'day' | 'week' | 'month';

export interface ReportPeriod {
  from: Date;
  to: Date;
  granularity: Granularity;
  funnelId?: string | null;
}

interface RawRow {
  scope: string;
  stage_id: string | null;
  stage_name: string | null;
  stage_position: number | null;
  total_leads: number;
  won_count: number;
  lost_count: number;
  open_count: number;
  won_value: number;
  total_value: number;
  avg_ticket: number;
  conversion_rate: number;
  avg_cycle_days: number;
  entered_count: number;
  conversion_to_next: number;
  avg_days_in_stage: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function resolveOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.user_metadata?.organization_id as string) || DEFAULT_ORG;
}

/**
 * Hook de relatórios da Fase 4B. Busca, para o período informado:
 *  - resumo do funil (KPIs) e breakdown por etapa via get_funnel_report
 *  - série temporal via get_deals_timeseries
 *  - motivos de perda via get_loss_reasons_report
 */
export function useReports(period: ReportPeriod) {
  const [summary, setSummary] = useState<FunnelReportSummary | null>(null);
  const [stages, setStages] = useState<FunnelReportStage[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();
  const { granularity, funnelId } = period;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const org = await resolveOrgId();
      const fid = funnelId ?? null;

      const [reportRes, tsRes, lossRes] = await Promise.all([
        supabase.rpc('get_funnel_report', {
          p_org: org, p_from: fromIso, p_to: toIso, p_funnel_id: fid,
        }),
        supabase.rpc('get_deals_timeseries', {
          p_org: org, p_from: fromIso, p_to: toIso, p_granularity: granularity, p_funnel_id: fid,
        }),
        supabase.rpc('get_loss_reasons_report', {
          p_org: org, p_from: fromIso, p_to: toIso, p_funnel_id: fid,
        }),
      ]);

      if (reportRes.error) throw reportRes.error;
      if (tsRes.error) throw tsRes.error;
      if (lossRes.error) throw lossRes.error;

      const rows = (reportRes.data || []) as RawRow[];
      const summaryRow = rows.find((r) => r.scope === 'summary');
      if (summaryRow) {
        setSummary({
          total_leads: num(summaryRow.total_leads),
          won_count: num(summaryRow.won_count),
          lost_count: num(summaryRow.lost_count),
          open_count: num(summaryRow.open_count),
          won_value: num(summaryRow.won_value),
          total_value: num(summaryRow.total_value),
          avg_ticket: num(summaryRow.avg_ticket),
          conversion_rate: num(summaryRow.conversion_rate),
          avg_cycle_days: num(summaryRow.avg_cycle_days),
        });
      } else {
        setSummary(null);
      }

      setStages(
        rows
          .filter((r) => r.scope === 'stage')
          .map((r) => ({
            stage_id: r.stage_id || '',
            stage_name: r.stage_name || r.stage_id || '',
            stage_position: num(r.stage_position),
            entered_count: num(r.entered_count),
            conversion_to_next: num(r.conversion_to_next),
            avg_days_in_stage: num(r.avg_days_in_stage),
          })),
      );

      setTimeseries(
        ((tsRes.data || []) as Record<string, unknown>[]).map((r) => ({
          bucket: String(r.bucket),
          new_leads: num(r.new_leads),
          won_count: num(r.won_count),
          lost_count: num(r.lost_count),
          won_value: num(r.won_value),
        })),
      );

      setLossReasons(
        ((lossRes.data || []) as Record<string, unknown>[]).map((r) => ({
          reason: String(r.reason),
          loss_count: num(r.loss_count),
          lost_value: num(r.lost_value),
          pct: num(r.pct),
        })),
      );
    } catch (err) {
      console.error('[useReports] erro', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso, granularity, funnelId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { summary, stages, timeseries, lossReasons, loading, error, refetch: fetchAll };
}
