-- ============================================================================
-- Fix 1.3 — Automações N1/N2/N3 por etapa (conceito CRM Enermac Mod8)
-- Omnimob v3. Idempotente + atômica.
--
-- N1: ao ENTRAR na etapa, registra a próxima ação (tarefa) automaticamente.
-- N2: alerta de estagnação se o card ficar parado além do prazo DA ETAPA.
-- N3: escala ao gestor se passar do prazo N3 da etapa.
-- Reusa peças existentes (deals.next_action_*, check_stalled_deals_cron,
-- notify_deal_owners). Prazos passam a ser POR ETAPA (fallback global).
-- ============================================================================
BEGIN;

-- ---- 1. Campos de automação por etapa ---------------------------------------
ALTER TABLE public.funnel_stages
  ADD COLUMN IF NOT EXISTS n1_task text,           -- tarefa criada ao entrar (N1)
  ADD COLUMN IF NOT EXISTS n2_days integer,         -- dias p/ alerta de estagnação (N2)
  ADD COLUMN IF NOT EXISTS n3_days integer;         -- dias p/ escalar ao gestor (N3)

-- ---- 2. check_stalled_deals_cron: prazo POR ETAPA (fallback global) ---------
-- N2 = notificação de estagnação (usa n2_days da etapa, senão p_threshold_days).
-- N3 = escala ao gestor (usa n3_days da etapa). Notificações distintas por nível.
CREATE OR REPLACE FUNCTION public.check_stalled_deals_cron(p_org uuid DEFAULT NULL, p_threshold_days integer DEFAULT 3)
RETURNS TABLE(deal_id text, lead_name text, stage_name text, days_stalled numeric, notification_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_org uuid; v_rec record; v_nc boolean; v_n2 int; v_n3 int; v_level text;
BEGIN
  v_org := COALESCE(p_org, public.current_org_id());
  FOR v_rec IN
    SELECT d.id, d.lead_name, d.stage_id, d.updated_at,
           EXTRACT(EPOCH FROM (now()-d.updated_at))/86400.0 AS ds,
           fs.n2_days, fs.n3_days
      FROM public.deals d
      LEFT JOIN public.funnel_stages fs
        ON fs.funnel_id = d.funnel_id AND fs.stage_id = d.stage_id AND fs.organization_id = d.organization_id
     WHERE d.organization_id = v_org
       AND d.status = 'open'
  LOOP
    v_n2 := COALESCE(v_rec.n2_days, p_threshold_days);
    v_n3 := COALESCE(v_rec.n3_days, p_threshold_days * 2);

    -- decide o nível: N3 (escala) tem prioridade sobre N2 (alerta).
    IF v_rec.ds > v_n3 THEN v_level := 'n3';
    ELSIF v_rec.ds > v_n2 THEN v_level := 'n2';
    ELSE CONTINUE; END IF;

    -- evita repetir o mesmo nível no mesmo dia
    IF EXISTS (SELECT 1 FROM public.internal_notifications n
                WHERE n.deal_id = v_rec.id AND n.kind = 'stalled_deal_'||v_level
                  AND n.created_at > now() - interval '1 day') THEN
      CONTINUE;
    END IF;

    v_nc := false;
    BEGIN
      INSERT INTO public.internal_notifications(organization_id,kind,deal_id,payload,status)
      VALUES(v_org,'stalled_deal_'||v_level,v_rec.id,
             jsonb_build_object('lead_name',v_rec.lead_name,'days_stalled',ROUND(v_rec.ds,1),
                                'level',v_level,'n2_days',v_n2,'n3_days',v_n3),'pending');
      v_nc := true;
    EXCEPTION WHEN OTHERS THEN v_nc := false; END;

    BEGIN
      PERFORM public.notify_deal_owners(
        v_rec.id, CASE WHEN v_level='n3' THEN 'deal_escalated' ELSE 'deal_stalled' END,
        CASE WHEN v_level='n3'
             THEN 'ESCALADA: deal parado ha '||ROUND(v_rec.ds,0)::text||' dias'
             ELSE 'Deal parado ha '||ROUND(v_rec.ds,0)::text||' dias' END,
        COALESCE(v_rec.lead_name,'Lead')||CASE WHEN v_level='n3' THEN ' — escalado ao gestor.' ELSE ' esta sem movimento.' END,
        jsonb_build_object('deal_id',v_rec.id,'days_stalled',ROUND(v_rec.ds,1),'stage_id',v_rec.stage_id,'level',v_level));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN QUERY SELECT v_rec.id, v_rec.lead_name, v_rec.stage_id, ROUND(v_rec.ds,1), v_nc;
  END LOOP;
END; $fn$;

-- ---- 3. N1: ao ENTRAR numa etapa com n1_task, registra a próxima ação --------
-- Embutido em move_deal_stage_internal (caminho das transições) — SEM trigger,
-- p/ evitar conflito com os triggers AFTER existentes (assign correspondent /
-- start scheduling). Ao mover, busca o n1_task da nova etapa e seta next_action.
CREATE OR REPLACE FUNCTION public.move_deal_stage_internal(p_deal_id text, p_new_stage_id text, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(deal_id text, from_stage_id text, to_stage_id text, moved_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_locked_deal record;
  v_now timestamptz := now();
  v_n1 text;
BEGIN
  BEGIN
    SELECT id, funnel_id, stage_id, status, organization_id
      INTO v_locked_deal
    FROM public.deals WHERE id = p_deal_id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'deal_bloqueado_por_outra_transacao';
  END;

  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;
  IF v_locked_deal.organization_id IS NULL THEN RAISE EXCEPTION 'deal_sem_organizacao'; END IF;

  IF v_locked_deal.stage_id = p_new_stage_id THEN
    deal_id := v_locked_deal.id; from_stage_id := v_locked_deal.stage_id;
    to_stage_id := p_new_stage_id; moved_at := v_now; RETURN NEXT; RETURN;
  END IF;

  -- N1: tarefa da nova etapa (se houver).
  SELECT fs.n1_task INTO v_n1
    FROM public.funnel_stages fs
   WHERE fs.funnel_id = v_locked_deal.funnel_id AND fs.stage_id = p_new_stage_id
     AND fs.organization_id = v_locked_deal.organization_id LIMIT 1;

  UPDATE public.deals
     SET stage_id = p_new_stage_id,
         updated_at = v_now,
         status_reason = COALESCE(
           p_reason,
           CASE WHEN p_actor_id IS NOT NULL THEN 'transição IA (ator ' || p_actor_id::text || ')' END,
           status_reason)
   WHERE id = p_deal_id;

  -- N1: insere a atividade da etapa (scheduled_at=now). O trigger
  -- sync_deal_next_action (em deal_activities) popula deals.next_action_* a partir
  -- dela — por isso NÃO setamos next_action no UPDATE acima (evita ser sobrescrito).
  IF v_n1 IS NOT NULL AND btrim(v_n1) <> '' THEN
    BEGIN
      INSERT INTO public.deal_activities(deal_id,organization_id,type_code,title,description,scheduled_at,next_action_required)
      VALUES(p_deal_id, v_locked_deal.organization_id, 'n1_task', 'Tarefa da etapa (N1)', v_n1, v_now, true);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  deal_id := v_locked_deal.id; from_stage_id := v_locked_deal.stage_id;
  to_stage_id := p_new_stage_id; moved_at := v_now; RETURN NEXT;
END;
$fn$;

COMMIT;
