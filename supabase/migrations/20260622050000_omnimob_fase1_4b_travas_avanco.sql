-- ====================================================================
-- Migration 20260622050000_omnimob_fase1_4b_travas_avanco.sql
-- Fase 1.4b — Travas de avanço por campos obrigatórios da etapa.
-- Bloqueia AVANÇO (to.position > from.position, mesmo funil) quando há
-- campos is_required=true sem valor em deal_field_values, separados por owner:
--   move_deal_stage (humano)          -> owners {corretor, ambos}
--   move_deal_stage_internal (IA/sist)-> owners {ia, ambos}, salvo p_enforce_required=false
-- NÃO trava: retrocesso, no-op, mudança de STATUS (lost via change_deal_status).
-- As 3 funções de sistema (devolutiva/agendamento/escalada) passam enforce=false:
--   o evento concreto (aprovação/confirmação/timeout) já é a prova.
-- "Campo preenchido" = linha em deal_field_values com value não-nulo, não 'null'
--   jsonb, não array vazio e não string vazia/só espaços.
-- ====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.list_missing_required_fields(
  p_deal_id text, p_funnel_id text, p_stage_id text, p_org uuid, p_owners text[]
) RETURNS text[]
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $LMF$
  SELECT COALESCE(array_agg(c.label ORDER BY c.position, c.key), ARRAY[]::text[])
  FROM public.stage_qualification_criteria c
  WHERE c.organization_id = p_org
    AND c.funnel_id = p_funnel_id
    AND c.stage_id  = p_stage_id
    AND c.is_active
    AND c.is_required
    AND c.owner = ANY(p_owners)
    AND NOT EXISTS (
      SELECT 1 FROM public.deal_field_values v
      WHERE v.deal_id = p_deal_id
        AND (v.field_key = c.key OR v.criterion_id = c.id)
        AND v.value IS NOT NULL
        AND v.value <> 'null'::jsonb
        AND NOT (jsonb_typeof(v.value) = 'array'  AND jsonb_array_length(v.value) = 0)
        AND NOT (jsonb_typeof(v.value) = 'string' AND btrim(v.value #>> '{}') = '')
    );
$LMF$;
REVOKE ALL ON FUNCTION public.list_missing_required_fields(text,text,text,uuid,text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.move_deal_stage(p_deal_id text, p_new_stage_id text, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(deal_id text, from_stage_id text, to_stage_id text, moved_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $MDS$
DECLARE
  v_org uuid; v_is_admin boolean; v_locked_deal record;
  v_now timestamptz := now(); v_from_pos int; v_to_pos int; v_missing text[];
BEGIN
  v_org := public.current_org_id();
  v_is_admin := public.is_org_admin();
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;

  SELECT id, funnel_id, stage_id, status, assigned_to, organization_id
    INTO v_locked_deal
  FROM public.deals WHERE id = p_deal_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;

  IF NOT v_is_admin AND v_locked_deal.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  IF v_locked_deal.stage_id = p_new_stage_id THEN
    deal_id := v_locked_deal.id; from_stage_id := v_locked_deal.stage_id;
    to_stage_id := p_new_stage_id; moved_at := v_now; RETURN NEXT; RETURN;
  END IF;

  -- 1.4b: só trava AVANÇO (to.position > from.position). Retrocesso/no-op não travam.
  SELECT position INTO v_from_pos FROM public.funnel_stages
    WHERE organization_id=v_org AND funnel_id=v_locked_deal.funnel_id AND stage_id=v_locked_deal.stage_id;
  SELECT position INTO v_to_pos FROM public.funnel_stages
    WHERE organization_id=v_org AND funnel_id=v_locked_deal.funnel_id AND stage_id=p_new_stage_id;
  IF v_from_pos IS NOT NULL AND v_to_pos IS NOT NULL AND v_to_pos > v_from_pos THEN
    v_missing := public.list_missing_required_fields(
      v_locked_deal.id, v_locked_deal.funnel_id, v_locked_deal.stage_id, v_org, ARRAY['corretor','ambos']);
    IF array_length(v_missing,1) > 0 THEN
      RAISE EXCEPTION 'campos_obrigatorios_pendentes: preencha antes de avancar: %', array_to_string(v_missing, ', ');
    END IF;
  END IF;

  UPDATE public.deals
     SET stage_id = p_new_stage_id, updated_at = v_now,
         status_reason = COALESCE(p_reason, status_reason)
   WHERE id = p_deal_id;

  deal_id := v_locked_deal.id; from_stage_id := v_locked_deal.stage_id;
  to_stage_id := p_new_stage_id; moved_at := v_now; RETURN NEXT;
END;
$MDS$;

DROP FUNCTION IF EXISTS public.move_deal_stage_internal(text,text,text,uuid);
CREATE OR REPLACE FUNCTION public.move_deal_stage_internal(
  p_deal_id text, p_new_stage_id text, p_reason text DEFAULT NULL::text,
  p_actor_id uuid DEFAULT NULL::uuid, p_enforce_required boolean DEFAULT true)
 RETURNS TABLE(deal_id text, from_stage_id text, to_stage_id text, moved_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $MDSI$
DECLARE
  v_locked_deal record; v_now timestamptz := now(); v_n1 text;
  v_from_pos int; v_to_pos int; v_missing text[];
BEGIN
  BEGIN
    SELECT id, funnel_id, stage_id, status, organization_id
      INTO v_locked_deal FROM public.deals WHERE id = p_deal_id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'deal_bloqueado_por_outra_transacao';
  END;

  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;
  IF v_locked_deal.organization_id IS NULL THEN RAISE EXCEPTION 'deal_sem_organizacao'; END IF;

  IF v_locked_deal.stage_id = p_new_stage_id THEN
    deal_id := v_locked_deal.id; from_stage_id := v_locked_deal.stage_id;
    to_stage_id := p_new_stage_id; moved_at := v_now; RETURN NEXT; RETURN;
  END IF;

  -- 1.4b: trava AVANÇO (owner ia/ambos), salvo bypass das transições de sistema.
  IF p_enforce_required THEN
    SELECT position INTO v_from_pos FROM public.funnel_stages
      WHERE organization_id=v_locked_deal.organization_id AND funnel_id=v_locked_deal.funnel_id AND stage_id=v_locked_deal.stage_id;
    SELECT position INTO v_to_pos FROM public.funnel_stages
      WHERE organization_id=v_locked_deal.organization_id AND funnel_id=v_locked_deal.funnel_id AND stage_id=p_new_stage_id;
    IF v_from_pos IS NOT NULL AND v_to_pos IS NOT NULL AND v_to_pos > v_from_pos THEN
      v_missing := public.list_missing_required_fields(
        v_locked_deal.id, v_locked_deal.funnel_id, v_locked_deal.stage_id,
        v_locked_deal.organization_id, ARRAY['ia','ambos']);
      IF array_length(v_missing,1) > 0 THEN
        RAISE EXCEPTION 'campos_obrigatorios_pendentes: preencha antes de avancar: %', array_to_string(v_missing, ', ');
      END IF;
    END IF;
  END IF;

  SELECT fs.n1_task INTO v_n1 FROM public.funnel_stages fs
   WHERE fs.funnel_id = v_locked_deal.funnel_id AND fs.stage_id = p_new_stage_id
     AND fs.organization_id = v_locked_deal.organization_id LIMIT 1;

  UPDATE public.deals
     SET stage_id = p_new_stage_id, updated_at = v_now,
         status_reason = COALESCE(p_reason,
           CASE WHEN p_actor_id IS NOT NULL THEN 'transição IA (ator ' || p_actor_id::text || ')' END,
           status_reason)
   WHERE id = p_deal_id;

  IF v_n1 IS NOT NULL AND btrim(v_n1) <> '' THEN
    BEGIN
      INSERT INTO public.deal_activities(deal_id,organization_id,type_code,title,description,scheduled_at,next_action_required)
      VALUES(p_deal_id, v_locked_deal.organization_id, 'n1_task', 'Tarefa da etapa (N1)', v_n1, v_now, true);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  deal_id := v_locked_deal.id; from_stage_id := v_locked_deal.stage_id;
  to_stage_id := p_new_stage_id; moved_at := v_now; RETURN NEXT;
END;
$MDSI$;
REVOKE ALL ON FUNCTION public.move_deal_stage_internal(text,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_deal_stage_internal(text,text,text,uuid,boolean) TO service_role;

-- ====================================================================
-- 3 funções de sistema: corpo IDÊNTICO ao atual, mudando SÓ a linha do
-- PERFORM move_deal_stage_internal(...) para acrescentar ", false" (bypass).
-- Recriadas via CREATE OR REPLACE a partir do corpo capturado do banco.
-- ====================================================================

-- ---- submit_credit_devolutiva (PERFORM ... , false) ----
CREATE OR REPLACE FUNCTION public.submit_credit_devolutiva(p_analysis_id uuid, p_result text, p_conditions text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_retomada_prazo_dias integer DEFAULT NULL::integer, p_approved_financing_amount numeric DEFAULT NULL::numeric, p_requires_entry boolean DEFAULT NULL::boolean, p_custom_fields_response jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(analysis_id uuid, status text, result text, deal_id text, new_stage_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_allowed boolean;
  v_target_stage text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF p_result NOT IN ('approved','approved_conditioned','rejected') THEN
    RAISE EXCEPTION 'resultado_invalido';
  END IF;
  SELECT ca.id, ca.status, ca.attendant_id, ca.organization_id, ca.deal_id
    INTO v_locked
  FROM public.credit_analyses ca
  WHERE ca.id = p_analysis_id
    AND ca.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.attendant_id IN (SELECT public.current_attendant_ids());
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_locked.status <> 'in_analysis' THEN
    RAISE EXCEPTION 'analise_nao_esta_em_andamento';
  END IF;
  UPDATE public.credit_analyses
     SET status = 'returned',
         result = p_result,
         result_conditions = CASE WHEN p_result = 'approved_conditioned' THEN p_conditions ELSE NULL END,
         result_reason = p_reason,
         retomada_prazo_dias = p_retomada_prazo_dias,
         approved_financing_amount = CASE WHEN p_result IN ('approved','approved_conditioned')
                                          THEN p_approved_financing_amount ELSE NULL END,
         requires_entry = p_requires_entry,
         custom_fields_response = COALESCE(p_custom_fields_response, custom_fields_response),
         returned_at = v_now,
         updated_at = v_now
   WHERE id = p_analysis_id;
  IF p_result = 'rejected' THEN
    -- §4.4: reprovado = PERDIDO. Sai do funil da IA; entra no fluxo de nutrição.
    -- lost_substage carrega o motivo (gancho p/ a etapa de origem no funil de
    -- Nutrição — ligado na Fase F). Mensagem padrão se não houver motivo escrito.
    PERFORM public.set_deal_lost_internal(
      v_locked.deal_id,
      'crédito reprovado: ' || COALESCE(p_reason, 'sem motivo informado'),
      COALESCE(p_reason, 'credito_reprovado'),
      NULL
    );
    new_stage_id := NULL;  -- não muda de etapa; muda de STATUS (lost)
  ELSE
    v_target_stage := 'ia-aprovado-aguardando';
    PERFORM public.move_deal_stage_internal(
      v_locked.deal_id, v_target_stage,
      'devolutiva do correspondente: ' || p_result, NULL, false);
    new_stage_id := v_target_stage;
  END IF;
  analysis_id := p_analysis_id;
  status := 'returned';
  result := p_result;
  deal_id := v_locked.deal_id;
  RETURN NEXT;
END;
$function$
;

-- ---- confirm_appointment_internal (PERFORM ... , false) ----
CREATE OR REPLACE FUNCTION public.confirm_appointment_internal(p_ia_deal_id text, p_scheduled_at timestamp with time zone, p_channel text DEFAULT 'presencial'::text, p_location text DEFAULT NULL::text)
 RETURNS TABLE(appointment_id uuid, broker_deal_id text, broker_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_appt_id uuid;          -- C1: escalares separados em vez de record parcial
  v_appt_broker_id uuid;
  v_broker_id uuid;
  v_now timestamptz := now();
  v_transfer_deal text;
BEGIN
  SELECT d.organization_id INTO v_org FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  IF p_channel NOT IN ('presencial','video','ligacao') THEN
    RAISE EXCEPTION 'canal_invalido';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_confirm_' || p_ia_deal_id));
  -- Pega (ou cria) o appointment aberto do deal.
  SELECT a.id, a.broker_id INTO v_appt_id, v_appt_broker_id
  FROM public.appointments a
  WHERE a.ia_deal_id = p_ia_deal_id AND a.status IN ('proposed','confirmed')
  LIMIT 1;
  IF v_appt_id IS NOT NULL THEN
    v_broker_id := v_appt_broker_id;
  ELSE
    v_broker_id := public.assign_broker_internal(v_org);
    INSERT INTO public.appointments
      (organization_id, ia_deal_id, broker_id, kind, channel, status, first_attempt_at)
    VALUES (v_org, p_ia_deal_id, v_broker_id, 'visita', p_channel, 'proposed', v_now)
    RETURNING id INTO v_appt_id;
  END IF;
  -- Se ainda não há corretor (roleta vazia no 1º caminho), tenta atribuir agora.
  IF v_broker_id IS NULL THEN
    v_broker_id := public.assign_broker_internal(v_org);
  END IF;
  -- Resolve o corretor final ANTES do UPDATE (evita referência à coluna
  -- broker_id no SET, que colide com a variável de saída da RETURNS TABLE).
  v_broker_id := COALESCE(v_appt_broker_id, v_broker_id);
  -- Confirma o appointment. Não referencia a coluna broker_id no lado direito
  -- do SET — usa só a variável já resolvida.
  UPDATE public.appointments
     SET status = 'confirmed',
         scheduled_at = p_scheduled_at,
         channel = p_channel,
         location = p_location,
         broker_id = v_broker_id,
         confirmed_at = v_now,
         updated_at = v_now
   WHERE id = v_appt_id;
  -- M1: sem corretor disponível mesmo após roleta — sinaliza p/ admin redistribuir.
  IF v_broker_id IS NULL THEN
    RAISE WARNING 'confirm_appointment: nenhum corretor disponível p/ deal % (org %) — appointment % confirmado sem corretor; redistribuir no painel', p_ia_deal_id, v_org, v_appt_id;
  END IF;
  -- Move o deal-IA para 'ia-transferido' (etapa 8).
  PERFORM public.move_deal_stage_internal(
    p_ia_deal_id, 'ia-transferido',
    'agendamento confirmado: ' || to_char(p_scheduled_at, 'DD/MM HH24:MI'), NULL, false);
  -- Cria o card no funil do corretor (etapa 2 = visita agendada) + lastro + briefing.
  SELECT t.broker_deal_id INTO v_transfer_deal
  FROM public.transfer_deal_to_broker_internal(
    p_ia_deal_id, v_broker_id, 'cor-visita-agendada',
    'transferência por agendamento bem-sucedido', v_appt_id) t;
  appointment_id := v_appt_id;
  broker_deal_id := v_transfer_deal;
  broker_id := v_broker_id;
  RETURN NEXT;
END;
$function$
;

-- ---- escalate_to_broker_internal (PERFORM ... , false) ----
CREATE OR REPLACE FUNCTION public.escalate_to_broker_internal(p_ia_deal_id text, p_reason text DEFAULT 'cadência de agendamento esgotada'::text)
 RETURNS TABLE(broker_deal_id text, broker_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_broker_id uuid;
  v_transfer record;
BEGIN
  SELECT d.organization_id INTO v_org FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_escalate_' || p_ia_deal_id));
  v_broker_id := public.assign_broker_internal(v_org);
  -- Marca o appointment aberto como cancelado (tentativas esgotadas).
  UPDATE public.appointments
     SET status = 'cancelled', updated_at = now(),
         metadata = metadata || jsonb_build_object('escalated_reason', p_reason)
   WHERE ia_deal_id = p_ia_deal_id AND status IN ('proposed','confirmed');
  PERFORM public.move_deal_stage_internal(p_ia_deal_id, 'ia-troca-voz', p_reason, NULL, false);
  SELECT t.broker_deal_id INTO v_transfer
  FROM public.transfer_deal_to_broker_internal(
    p_ia_deal_id, v_broker_id, 'cor-agendar-visita', p_reason, NULL) t;
  broker_deal_id := v_transfer.broker_deal_id;
  broker_id := v_broker_id;
  RETURN NEXT;
END;
$function$
;

COMMIT;
