-- ============================================================================
-- OmniMob — Fase 6: Correção de get_deals_for_kanban (mesmo bug 3C)
-- ----------------------------------------------------------------------------
-- PROBLEMA: o join de etapa usava fs.id::text (uuid) = d.stage_id (chave text
-- 'ia-novo-lead') -> nunca casava -> stage_name/stage_position retornavam NULL.
-- E as tags vinham fixas como '[]'::jsonb.
-- (Mesma classe do bug corrigido no get_dashboard_metrics na Fase 5.)
--
-- CORRECAO: join por fs.stage_id (chave text) e popular tags via
-- get_deal_tags_json(). Sem mudanca de assinatura (mesma RETURNS TABLE).
-- Nenhum componente do frontend chama essa RPC hoje (RPC latente), mas fica
-- correta para uso futuro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_deals_for_kanban(p_funnel_id text DEFAULT NULL::text)
RETURNS TABLE(id text, funnel_id text, stage_id text, stage_name text, stage_position integer,
              lead_id text, lead_name text, property text, property_code text, value numeric,
              status text, assigned_to uuid, last_activity_at timestamp with time zone,
              last_activity_summary text, days_in_stage numeric, tags jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_admin boolean;
BEGIN
  v_org := public.current_org_id();
  v_admin := public.is_org_admin() OR public.is_superadmin(auth.uid());
  RETURN QUERY
  WITH si AS (
    SELECT fs.stage_id AS sid, sa.name AS sn, fs.position AS sp
    FROM public.funnel_stages fs
    JOIN public.stage_archetypes sa ON sa.id = fs.stage_archetype_id
    WHERE fs.organization_id = v_org
  )
  SELECT d.id, d.funnel_id, d.stage_id, si.sn, si.sp,
         d.lead_id, d.lead_name, d.property, d.property_code, d.value,
         d.status, d.assigned_to, d.last_activity_at, d.last_activity_summary,
         EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400.0 AS dis,
         public.get_deal_tags_json(d.id) AS tags
  FROM public.deals d
  LEFT JOIN si ON si.sid = d.stage_id
  WHERE d.organization_id = v_org
    AND (v_admin OR d.assigned_to = auth.uid())
    AND (p_funnel_id IS NULL OR d.funnel_id = p_funnel_id)
  ORDER BY si.sp, d.updated_at DESC;
END;
$function$;
