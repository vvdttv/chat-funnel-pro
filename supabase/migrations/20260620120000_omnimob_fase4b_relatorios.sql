-- OmniMob Fase 4B — Relatórios
-- RPCs de relatório agregado + série temporal + motivos de perda + resumo p/ digest.
-- Padrão de segurança: SECURITY DEFINER, search_path fixo, filtro org + (is_org_admin OR assigned_to=auth.uid()).
-- NOTA schema real: deals.stage_id e funnel_stages.stage_id guardam chaves text (ex 'ia-novo-lead').
--   O join correto de etapa é por funnel_stages.stage_id (NAO pelo uuid fs.id).
-- NOTA: existem 2 triggers (trg_deals_stage_events + trg_record_deal_stage_event) chamando a
--   mesma funcao -> cada transicao grava 2 linhas em deal_stage_events. Por isso usamos
--   sempre COUNT(DISTINCT) / dedupe por (deal_id,to_stage_id,entered_at).

-- ============================================================================
-- 1. get_funnel_report(p_org, p_from, p_to, p_funnel_id)
--    Resumo agregado do periodo + breakdown por etapa.
--    Retorna 1 linha de resumo (scope='summary') + N linhas por etapa (scope='stage').
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_funnel_report(
  p_org uuid DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_funnel_id text DEFAULT NULL
)
RETURNS TABLE(
  scope text,
  stage_id text,
  stage_name text,
  stage_position int,
  total_leads bigint,
  won_count bigint,
  lost_count bigint,
  open_count bigint,
  won_value numeric,
  total_value numeric,
  avg_ticket numeric,
  conversion_rate numeric,
  avg_cycle_days numeric,
  entered_count bigint,
  conversion_to_next numeric,
  avg_days_in_stage numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid;
  v_admin boolean;
BEGIN
  v_org := COALESCE(p_org, public.current_org_id());
  v_admin := public.is_org_admin();

  -- ---- Linha de resumo do periodo ----
  RETURN QUERY
  WITH base AS (
    SELECT d.id, d.status, d.value, d.created_at, d.won_date, d.status_changed_at
    FROM public.deals d
    WHERE d.organization_id = v_org
      AND (v_admin OR d.assigned_to = auth.uid())
      AND (p_funnel_id IS NULL OR d.funnel_id = p_funnel_id)
      AND d.created_at >= p_from AND d.created_at < p_to
  )
  SELECT
    'summary'::text,
    NULL::text, NULL::text, NULL::int,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status = 'won')::bigint,
    COUNT(*) FILTER (WHERE status = 'lost')::bigint,
    COUNT(*) FILTER (WHERE status = 'open')::bigint,
    COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0)::numeric,
    COALESCE(SUM(value), 0)::numeric,
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ROUND(COALESCE(SUM(value), 0)::numeric / COUNT(*), 2) END,
    CASE WHEN COUNT(*) FILTER (WHERE status IN ('won','lost')) = 0 THEN 0
         ELSE ROUND(
           COUNT(*) FILTER (WHERE status = 'won')::numeric
           / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')), 0) * 100, 1) END,
    COALESCE(ROUND(AVG(
      EXTRACT(EPOCH FROM (COALESCE(won_date, status_changed_at) - created_at)) / 86400.0
    ) FILTER (WHERE status IN ('won','lost')
      AND COALESCE(won_date, status_changed_at) IS NOT NULL)::numeric, 1), 0),
    0::bigint, 0::numeric, 0::numeric
  FROM base;

  -- ---- Linhas por etapa ----
  RETURN QUERY
  WITH stages AS (
    SELECT fs.stage_id AS sid, sa.name AS sname, fs.position AS spos
    FROM public.funnel_stages fs
    LEFT JOIN public.stage_archetypes sa ON sa.id = fs.stage_archetype_id
    WHERE fs.organization_id = v_org
      AND (p_funnel_id IS NULL OR fs.funnel_id = p_funnel_id)
  ),
  ev AS (
    SELECT DISTINCT e.deal_id, e.to_stage_id, e.entered_at
    FROM public.deal_stage_events e
    JOIN public.deals d ON d.id = e.deal_id
    WHERE e.organization_id = v_org
      AND (v_admin OR d.assigned_to = auth.uid())
      AND (p_funnel_id IS NULL OR e.funnel_id = p_funnel_id)
      AND e.entered_at >= p_from AND e.entered_at < p_to
  ),
  entered AS (
    SELECT to_stage_id, COUNT(DISTINCT deal_id)::bigint AS cnt
    FROM ev GROUP BY to_stage_id
  ),
  advanced AS (
    SELECT e.to_stage_id, COUNT(DISTINCT e.deal_id)::bigint AS cnt
    FROM ev e
    WHERE EXISTS (
      SELECT 1 FROM public.deal_stage_events n
      WHERE n.deal_id = e.deal_id AND n.entered_at > e.entered_at
    )
    GROUP BY e.to_stage_id
  ),
  dwell AS (
    SELECT e.to_stage_id,
      AVG(EXTRACT(EPOCH FROM (
        COALESCE((SELECT MIN(n.entered_at) FROM public.deal_stage_events n
                  WHERE n.deal_id = e.deal_id AND n.entered_at > e.entered_at), now())
        - e.entered_at)) / 86400.0) AS d
    FROM ev e GROUP BY e.to_stage_id
  )
  SELECT
    'stage'::text,
    s.sid, COALESCE(s.sname, s.sid), s.spos,
    0::bigint, 0::bigint, 0::bigint, 0::bigint,
    0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
    COALESCE(en.cnt, 0)::bigint,
    CASE WHEN COALESCE(en.cnt, 0) = 0 THEN 0
         ELSE ROUND(COALESCE(ad.cnt, 0)::numeric / NULLIF(en.cnt, 0) * 100, 1) END,
    COALESCE(ROUND(dw.d::numeric, 1), 0)
  FROM stages s
  LEFT JOIN entered en ON en.to_stage_id = s.sid
  LEFT JOIN advanced ad ON ad.to_stage_id = s.sid
  LEFT JOIN dwell dw ON dw.to_stage_id = s.sid
  ORDER BY s.spos;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_funnel_report(uuid,timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_funnel_report(uuid,timestamptz,timestamptz,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_funnel_report(uuid,timestamptz,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_report(uuid,timestamptz,timestamptz,text) TO service_role;

-- ============================================================================
-- 2. get_deals_timeseries(p_org, p_from, p_to, p_granularity, p_funnel_id)
--    Serie temporal: novos leads / ganhos / perdidos por bucket (day|week|month).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_deals_timeseries(
  p_org uuid DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_granularity text DEFAULT 'day',
  p_funnel_id text DEFAULT NULL
)
RETURNS TABLE(
  bucket date,
  new_leads bigint,
  won_count bigint,
  lost_count bigint,
  won_value numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid;
  v_admin boolean;
  v_trunc text;
BEGIN
  v_org := COALESCE(p_org, public.current_org_id());
  v_admin := public.is_org_admin();
  v_trunc := CASE lower(p_granularity)
               WHEN 'week' THEN 'week'
               WHEN 'month' THEN 'month'
               ELSE 'day' END;

  RETURN QUERY
  WITH series AS (
    SELECT generate_series(
      date_trunc(v_trunc, p_from),
      date_trunc(v_trunc, p_to),
      ('1 ' || v_trunc)::interval
    )::date AS b
  ),
  d AS (
    SELECT date_trunc(v_trunc, created_at)::date AS cb, created_at, won_date, status_changed_at, status, value
    FROM public.deals
    WHERE organization_id = v_org
      AND (v_admin OR assigned_to = auth.uid())
      AND (p_funnel_id IS NULL OR funnel_id = p_funnel_id)
  ),
  new_b AS (
    SELECT cb AS b, COUNT(*)::bigint AS c FROM d
    WHERE created_at >= p_from AND created_at < p_to GROUP BY cb
  ),
  won_b AS (
    SELECT date_trunc(v_trunc, COALESCE(won_date, status_changed_at))::date AS b,
           COUNT(*)::bigint AS c, COALESCE(SUM(value),0)::numeric AS v
    FROM d
    WHERE status = 'won' AND COALESCE(won_date, status_changed_at) >= p_from
      AND COALESCE(won_date, status_changed_at) < p_to
    GROUP BY 1
  ),
  lost_b AS (
    SELECT date_trunc(v_trunc, status_changed_at)::date AS b, COUNT(*)::bigint AS c
    FROM d
    WHERE status = 'lost' AND status_changed_at >= p_from AND status_changed_at < p_to
    GROUP BY 1
  )
  SELECT s.b,
    COALESCE(n.c, 0)::bigint,
    COALESCE(w.c, 0)::bigint,
    COALESCE(l.c, 0)::bigint,
    COALESCE(w.v, 0)::numeric
  FROM series s
  LEFT JOIN new_b n ON n.b = s.b
  LEFT JOIN won_b w ON w.b = s.b
  LEFT JOIN lost_b l ON l.b = s.b
  ORDER BY s.b;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_deals_timeseries(uuid,timestamptz,timestamptz,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_deals_timeseries(uuid,timestamptz,timestamptz,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_deals_timeseries(uuid,timestamptz,timestamptz,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deals_timeseries(uuid,timestamptz,timestamptz,text,text) TO service_role;

-- ============================================================================
-- 3. get_loss_reasons_report(p_org, p_from, p_to, p_funnel_id)
--    Motivos de perda reais agrupados (lost_substage + status_reason).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_loss_reasons_report(
  p_org uuid DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now(),
  p_funnel_id text DEFAULT NULL
)
RETURNS TABLE(
  reason text,
  loss_count bigint,
  lost_value numeric,
  pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid;
  v_admin boolean;
  v_total bigint;
BEGIN
  v_org := COALESCE(p_org, public.current_org_id());
  v_admin := public.is_org_admin();

  SELECT COUNT(*) INTO v_total FROM public.deals d
  WHERE d.organization_id = v_org AND (v_admin OR d.assigned_to = auth.uid())
    AND d.status = 'lost'
    AND (p_funnel_id IS NULL OR d.funnel_id = p_funnel_id)
    AND d.status_changed_at >= p_from AND d.status_changed_at < p_to;

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(trim(d.lost_substage), ''), NULLIF(trim(d.status_reason), ''), 'Nao informado')::text AS r,
    COUNT(*)::bigint,
    COALESCE(SUM(d.value), 0)::numeric,
    CASE WHEN v_total = 0 THEN 0 ELSE ROUND(COUNT(*)::numeric / v_total * 100, 1) END
  FROM public.deals d
  WHERE d.organization_id = v_org AND (v_admin OR d.assigned_to = auth.uid())
    AND d.status = 'lost'
    AND (p_funnel_id IS NULL OR d.funnel_id = p_funnel_id)
    AND d.status_changed_at >= p_from AND d.status_changed_at < p_to
  GROUP BY r
  ORDER BY 2 DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_loss_reasons_report(uuid,timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_loss_reasons_report(uuid,timestamptz,timestamptz,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_loss_reasons_report(uuid,timestamptz,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_loss_reasons_report(uuid,timestamptz,timestamptz,text) TO service_role;

-- ============================================================================
-- 4. get_org_digest_summary(p_org, p_days)
--    Resumo p/ e-mail digest: contagens do periodo + deals parados.
--    service_role only (chamado pela edge function send-report-digest).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_org_digest_summary(
  p_org uuid,
  p_days int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_from timestamptz := now() - (p_days || ' days')::interval;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'organization_id', p_org,
    'period_days', p_days,
    'period_from', v_from,
    'period_to', now(),
    'new_leads', (SELECT COUNT(*) FROM public.deals
                  WHERE organization_id = p_org AND created_at >= v_from),
    'won', (SELECT COUNT(*) FROM public.deals
            WHERE organization_id = p_org AND status = 'won'
              AND COALESCE(won_date, status_changed_at) >= v_from),
    'lost', (SELECT COUNT(*) FROM public.deals
             WHERE organization_id = p_org AND status = 'lost'
               AND status_changed_at >= v_from),
    'won_value', (SELECT COALESCE(SUM(value),0) FROM public.deals
                  WHERE organization_id = p_org AND status = 'won'
                    AND COALESCE(won_date, status_changed_at) >= v_from),
    'open_total', (SELECT COUNT(*) FROM public.deals
                   WHERE organization_id = p_org AND status = 'open'),
    'stalled', (SELECT COUNT(*) FROM public.deals
                WHERE organization_id = p_org AND status = 'open'
                  AND EXTRACT(EPOCH FROM (now() - updated_at))/86400.0 > 3)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_org_digest_summary(uuid,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_org_digest_summary(uuid,int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_org_digest_summary(uuid,int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_digest_summary(uuid,int) TO service_role;
