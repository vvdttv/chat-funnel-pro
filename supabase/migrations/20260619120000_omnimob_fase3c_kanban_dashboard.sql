-- OmniMob Fase 3C
-- RPCs: get_dashboard_metrics, check_stalled_deals_cron, generate_next_action_suggestion_internal, get_deals_for_kanban

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_org uuid)
RETURNS TABLE(stage_id text, stage_name text, stage_position int, deal_count bigint, total_value numeric, avg_days_in_stage numeric, conversion_to_next numeric, avg_value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_is_admin boolean;
BEGIN
  v_is_admin := public.is_org_admin();
  RETURN QUERY WITH ss AS (SELECT d.stage_id, COUNT(DISTINCT d.id)::bigint as dc, COALESCE(SUM(d.value),0) as tv, AVG(EXTRACT(EPOCH FROM(now()-d.updated_at))/86400.0) as ad FROM public.deals d WHERE d.organization_id=p_org AND(v_is_admin OR d.assigned_to=auth.uid()) GROUP BY d.stage_id),
  fso AS(SELECT fs.id::text as sid, sa.name as sn, fs.position as sp FROM public.funnel_stages fs JOIN public.stage_archetypes sa ON fs.stage_archetype_id=sa.id WHERE fs.organization_id=p_org ORDER BY fs.position),
  ec AS(SELECT e.to_stage_id, COUNT(DISTINCT e.deal_id)::bigint as cnt FROM public.deal_stage_events e WHERE e.organization_id=p_org GROUP BY e.to_stage_id),
  ac AS(SELECT e.to_stage_id, COUNT(DISTINCT e.deal_id)::bigint as cnt FROM public.deal_stage_events e WHERE e.organization_id=p_org AND EXISTS(SELECT 1 FROM public.deal_stage_events n WHERE n.deal_id=e.deal_id AND n.entered_at>e.entered_at) GROUP BY e.to_stage_id)
  SELECT fso.sid, fso.sn, fso.sp, COALESCE(ss.dc,0), COALESCE(ss.tv,0), COALESCE(ROUND(ss.ad,1),0), CASE WHEN ec.cnt IS NULL OR ec.cnt=0 THEN 0 WHEN ac.cnt IS NULL THEN 0 ELSE ROUND((ac.cnt::numeric/NULLIF(ec.cnt,0))*100,1) END, CASE WHEN ss.dc IS NULL OR ss.dc=0 THEN 0 ELSE ROUND(ss.tv::numeric/NULLIF(ss.dc,0),2) END FROM fso LEFT JOIN ss ON ss.stage_id=fso.sid LEFT JOIN ec ON ec.to_stage_id=fso.sid LEFT JOIN ac ON ac.to_stage_id=fso.sid ORDER BY fso.sp;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_stalled_deals_cron(p_org uuid DEFAULT NULL::uuid, p_threshold_days int DEFAULT 3)
RETURNS TABLE(deal_id text, lead_name text, stage_name text, days_stalled numeric, notification_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid; v_rec record; v_nc boolean;
BEGIN v_org := COALESCE(p_org, public.current_org_id());
  FOR v_rec IN SELECT d.id, d.lead_name, d.stage_id, d.updated_at, EXTRACT(EPOCH FROM(now()-d.updated_at))/86400.0 as ds FROM public.deals d WHERE d.organization_id=v_org AND d.status='open' AND EXTRACT(EPOCH FROM(now()-d.updated_at))/86400.0>p_threshold_days AND NOT EXISTS(SELECT 1 FROM public.internal_notifications n WHERE n.deal_id=d.id AND n.kind='stalled_deal' AND n.created_at>now()-interval'1 day') LOOP
    v_nc:=false;
    BEGIN INSERT INTO public.internal_notifications(organization_id,kind,deal_id,payload,status) VALUES(v_org,'stalled_deal',v_rec.id,jsonb_build_object('lead_name',v_rec.lead_name,'days_stalled',ROUND(v_rec.ds,1),'threshold_days',p_threshold_days),'pending'); v_nc:=true; EXCEPTION WHEN OTHERS THEN v_nc:=false; END;
    BEGIN INSERT INTO public.deal_activities(deal_id,organization_id,type_code,title,description,next_action_required) VALUES(v_rec.id,v_org,'stalled_alert','Deal parado detectado','Deal parado ha '||ROUND(v_rec.ds,0)::text||' dias',true); EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN QUERY SELECT v_rec.id, v_rec.lead_name, v_rec.stage_id, ROUND(v_rec.ds,1), v_nc;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_stalled_deals_cron(uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_stalled_deals_cron(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_next_action_suggestion_internal(p_deal_id text, p_lang text DEFAULT 'pt-BR')
RETURNS TABLE(action_type text, action_title text, action_description text, priority int, confidence numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_deal record; v_days numeric; v_open int;
BEGIN SELECT d.id,d.lead_name,d.stage_id,d.value,d.status,d.last_activity_at,d.updated_at INTO v_deal FROM public.deals d WHERE d.id=p_deal_id; IF NOT FOUND THEN RETURN; END IF;
  v_days:=EXTRACT(EPOCH FROM(now()-v_deal.updated_at))/86400.0;
  SELECT COUNT(*)FILTER(WHERE done_at IS NULL)INTO v_open FROM public.deal_activities WHERE deal_id=p_deal_id;
  IF v_days>3 AND v_open=0 THEN RETURN QUERY SELECT 'escalate'::text,'Escalar para analise manual'::text,'Deal parado ha mais de 3 dias'::text,1::int,0.95::numeric; RETURN; END IF;
  IF v_days>2 THEN RETURN QUERY SELECT 'send_reminder'::text,'Enviar lembrete'::text,'Cliente sem contato'::text,2::int,0.85::numeric; RETURN; END IF;
  IF v_days>1 THEN RETURN QUERY SELECT 'follow_up'::text,'Acompanhamento rotineiro'::text,'Manter contato'::text,4::int,0.70::numeric; RETURN; END IF;
  RETURN QUERY SELECT 'continue'::text,'Continuar fluxo normal'::text,'Deal em ritmo normal'::text,5::int,0.90::numeric;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_next_action_suggestion_internal(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_next_action_suggestion_internal(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_deals_for_kanban(p_funnel_id text DEFAULT NULL::text)
RETURNS TABLE(id text,funnel_id text,stage_id text,stage_name text,stage_position int,lead_id text,lead_name text,property text,property_code text,value numeric,status text,assigned_to uuid,last_activity_at timestamptz,last_activity_summary text,days_in_stage numeric,tags jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid; v_admin boolean;
BEGIN v_org:=public.current_org_id(); v_admin:=public.is_org_admin();
  RETURN QUERY WITH si AS(SELECT fs.id::text as sid,sa.name as sn,fs.position as sp FROM public.funnel_stages fs JOIN public.stage_archetypes sa ON sa.id=fs.stage_archetype_id WHERE fs.organization_id=v_org)
  SELECT d.id,d.funnel_id,d.stage_id,si.sn,si.sp,d.lead_id,d.lead_name,d.property,d.property_code,d.value,d.status,d.assigned_to,d.last_activity_at,d.last_activity_summary,EXTRACT(EPOCH FROM(now()-d.updated_at))/86400.0 as dis,'[]'::jsonb as tags
  FROM public.deals d LEFT JOIN si ON si.sid=d.stage_id
  WHERE d.organization_id=v_org AND(v_admin OR d.assigned_to=auth.uid()) AND(p_funnel_id IS NULL OR d.funnel_id=p_funnel_id)
  ORDER BY si.sp,d.updated_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_deals_for_kanban(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deals_for_kanban(text) TO service_role;
