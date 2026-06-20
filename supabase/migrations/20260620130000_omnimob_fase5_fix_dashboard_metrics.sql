-- OmniMob — Fase 5: correção do Bug 3C em get_dashboard_metrics
--
-- Problema: o CTE `fso` projetava `fs.id::text` (UUID textualizado), mas os
-- joins comparam com chaves text de etapa ('ia-novo-lead'): ss.stage_id,
-- ec.to_stage_id, ac.to_stage_id. O join nunca casava → métricas por etapa
-- sempre zeradas no MetricsPanel.
--
-- Correção: projetar `fs.stage_id` (a chave text real da etapa). Isso conserta
-- os três joins de uma vez. Demais semânticas preservadas.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_org uuid)
  RETURNS TABLE(stage_id text, stage_name text, stage_position integer, deal_count bigint, total_value numeric, avg_days_in_stage numeric, conversion_to_next numeric, avg_value numeric)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE v_is_admin boolean;
BEGIN
  v_is_admin := public.is_org_admin();
  RETURN QUERY WITH ss AS (
    SELECT d.stage_id, COUNT(DISTINCT d.id)::bigint as dc, COALESCE(SUM(d.value),0) as tv,
           AVG(EXTRACT(EPOCH FROM(now()-d.updated_at))/86400.0) as ad
    FROM public.deals d
    WHERE d.organization_id=p_org AND(v_is_admin OR d.assigned_to=auth.uid())
    GROUP BY d.stage_id),
  fso AS (
    SELECT fs.stage_id as sid, sa.name as sn, fs.position as sp
    FROM public.funnel_stages fs
    JOIN public.stage_archetypes sa ON fs.stage_archetype_id=sa.id
    WHERE fs.organization_id=p_org
    ORDER BY fs.position),
  ec AS (
    SELECT e.to_stage_id, COUNT(DISTINCT e.deal_id)::bigint as cnt
    FROM public.deal_stage_events e
    WHERE e.organization_id=p_org
    GROUP BY e.to_stage_id),
  ac AS (
    SELECT e.to_stage_id, COUNT(DISTINCT e.deal_id)::bigint as cnt
    FROM public.deal_stage_events e
    WHERE e.organization_id=p_org
      AND EXISTS(SELECT 1 FROM public.deal_stage_events n WHERE n.deal_id=e.deal_id AND n.entered_at>e.entered_at)
    GROUP BY e.to_stage_id)
  SELECT fso.sid, fso.sn, fso.sp,
         COALESCE(ss.dc,0), COALESCE(ss.tv,0), COALESCE(ROUND(ss.ad,1),0),
         CASE WHEN ec.cnt IS NULL OR ec.cnt=0 THEN 0 WHEN ac.cnt IS NULL THEN 0
              ELSE ROUND((ac.cnt::numeric/NULLIF(ec.cnt,0))*100,1) END,
         CASE WHEN ss.dc IS NULL OR ss.dc=0 THEN 0 ELSE ROUND(ss.tv::numeric/NULLIF(ss.dc,0),2) END
  FROM fso
  LEFT JOIN ss ON ss.stage_id=fso.sid
  LEFT JOIN ec ON ec.to_stage_id=fso.sid
  LEFT JOIN ac ON ac.to_stage_id=fso.sid
  ORDER BY fso.sp;
END;
$function$;
