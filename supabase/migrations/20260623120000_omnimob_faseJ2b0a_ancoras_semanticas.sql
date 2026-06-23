-- =====================================================================
-- OmniMob — Fase J-2b-0a: Ancoras semanticas de etapa (funnel_stages.role)
-- Objetivo: desacoplar as automacoes do texto cravado do stage_id, para
-- viabilizar CRUD/reordenacao de etapas (decisao 1) sem quebrar o motor.
-- Cada etapa-chave ganha um PAPEL (role); as automacoes disparam pelo papel.
-- Escopo desta fatia: papeis + 2 helpers + refatorar os 4 pontos que movem
-- DENTRO do mesmo funil (2 triggers + 2 devolutivas). O par cross-funnel
-- (confirm_appointment/transfer) entra na J-2b-1 com o funil de corretor loc.
-- ATOMICA (BEGIN/COMMIT) + idempotente + nao-destrutiva.
-- =====================================================================
BEGIN;

-- 1) Coluna de papel semantico. NULL = etapa sem automacao amarrada.
ALTER TABLE public.funnel_stages ADD COLUMN IF NOT EXISTS role text;

COMMENT ON COLUMN public.funnel_stages.role IS
  'Papel semantico da etapa para as automacoes (analise_credito, analise_garantia, '
  'aprovado_aguardando, transferido, corretor_inicial, vistoria_entrada, contrato, '
  'troca_voz). As automacoes disparam pelo papel, nao pelo stage_id literal. '
  'Permite renomear/reordenar etapas sem quebrar o motor.';

-- 2) Seed dos papeis nas etapas-chave existentes (idempotente).
UPDATE public.funnel_stages SET role = 'analise_credito'
  WHERE funnel_id = 'fun-ia-mcmv' AND stage_id = 'ia-analise' AND role IS DISTINCT FROM 'analise_credito';
UPDATE public.funnel_stages SET role = 'analise_garantia'
  WHERE funnel_id = 'fun-ia-locacao' AND stage_id = 'loc-analise-garantia' AND role IS DISTINCT FROM 'analise_garantia';
UPDATE public.funnel_stages SET role = 'aprovado_aguardando'
  WHERE stage_id IN ('ia-aprovado-aguardando','loc-aprovado-aguardando') AND role IS DISTINCT FROM 'aprovado_aguardando';
UPDATE public.funnel_stages SET role = 'transferido'
  WHERE stage_id IN ('ia-transferido','loc-transferido') AND role IS DISTINCT FROM 'transferido';
UPDATE public.funnel_stages SET role = 'troca_voz'
  WHERE stage_id IN ('ia-troca-voz','loc-troca-voz') AND role IS DISTINCT FROM 'troca_voz';
UPDATE public.funnel_stages SET role = 'corretor_inicial'
  WHERE funnel_id = 'fun-corretor-mcmv' AND stage_id = 'cor-visita-agendada' AND role IS DISTINCT FROM 'corretor_inicial';

-- 3a) Helper: resolve o stage_id que tem um dado papel dentro de um funil/org.
CREATE OR REPLACE FUNCTION public.stage_id_for_role(
  p_funnel_id text, p_role text, p_org uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT fs.stage_id
  FROM public.funnel_stages fs
  WHERE fs.funnel_id = p_funnel_id
    AND fs.organization_id = p_org
    AND fs.role = p_role
  ORDER BY fs.position ASC
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.stage_id_for_role(text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_id_for_role(text,text,uuid) TO service_role;

-- 3b) Helper inverso: papel de um stage dentro de um funil/org.
CREATE OR REPLACE FUNCTION public.role_for_stage(
  p_funnel_id text, p_stage_id text, p_org uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT fs.role
  FROM public.funnel_stages fs
  WHERE fs.funnel_id = p_funnel_id
    AND fs.organization_id = p_org
    AND fs.stage_id = p_stage_id
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.role_for_stage(text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.role_for_stage(text,text,uuid) TO service_role;

-- 4) Gatilho de atribuicao de analise: dispara pelo PAPEL da etapa de destino.
--    role='analise_credito' -> correspondente bancario (so funil IA de vendas).
--    role='analise_garantia' -> garantia locaticia (J-2a).
CREATE OR REPLACE FUNCTION public.tg_assign_correspondent_on_analise()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_is_ai boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;
  v_role := public.role_for_stage(NEW.funnel_id, NEW.stage_id, NEW.organization_id);
  IF v_role = 'analise_credito' THEN
    SELECT f.is_ai_funnel INTO v_is_ai FROM public.funnels f WHERE f.id = NEW.funnel_id;
    IF COALESCE(v_is_ai, false) THEN
      PERFORM public.assign_credit_analysis_internal(NEW.id, NEW.organization_id, 'entrada em etapa de analise de credito');
    END IF;
  ELSIF v_role = 'analise_garantia' THEN
    PERFORM public.assign_guarantee_analysis_internal(NEW.id, NEW.organization_id, 'entrada em etapa de analise de garantia');
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Gatilho de agendamento: dispara pelo PAPEL 'aprovado_aguardando' (vendas+loc).
CREATE OR REPLACE FUNCTION public.tg_start_scheduling_on_approved()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_broker_id uuid;
  v_channel_id uuid;
  v_now timestamptz := now();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;
  v_role := public.role_for_stage(NEW.funnel_id, NEW.stage_id, NEW.organization_id);
  IF v_role IS DISTINCT FROM 'aprovado_aguardando' THEN
    RETURN NEW;
  END IF;

  -- Cria appointment 'proposed' (idempotente pelo indice parcial). Roleta define
  -- o corretor que vai receber a transferencia ao fim do agendamento.
  v_broker_id := public.assign_broker_internal(NEW.organization_id);
  BEGIN
    INSERT INTO public.appointments
      (organization_id, ia_deal_id, broker_id, kind, channel, status, first_attempt_at, attempts)
    VALUES
      (NEW.organization_id, NEW.id, v_broker_id, 'visita', 'presencial', 'proposed', v_now, 0);
  EXCEPTION WHEN unique_violation THEN
    NULL; -- ja ha appointment aberto p/ este deal
  END;

  SELECT id INTO v_channel_id FROM public.lead_channels
  WHERE deal_id = NEW.id AND is_active ORDER BY created_at LIMIT 1;

  INSERT INTO public.ai_response_queue
    (organization_id, deal_id, funnel_id, stage_id, lead_channel_id,
     lead_message, status, autonomy_mode, context)
  VALUES
    (NEW.organization_id, NEW.id, NEW.funnel_id, NEW.stage_id, v_channel_id,
     '[gatilho interno: aprovado — iniciar tratativas de agendamento]',
     'pending', 'suggest_only',
     jsonb_build_object('trigger', 'scheduling_kickoff', 'broker_id', v_broker_id))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 6) Devolutiva de credito: destino resolvido pelo PAPEL 'aprovado_aguardando'
--    dentro do funil do proprio deal (fallback ao literal por seguranca).
CREATE OR REPLACE FUNCTION public.submit_credit_devolutiva(p_analysis_id uuid, p_result text, p_conditions text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_retomada_prazo_dias integer DEFAULT NULL::integer, p_approved_financing_amount numeric DEFAULT NULL::numeric, p_requires_entry boolean DEFAULT NULL::boolean, p_custom_fields_response jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(analysis_id uuid, status text, result text, deal_id text, new_stage_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_allowed boolean;
  v_target_stage text;
  v_funnel text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF p_result NOT IN ('approved','approved_conditioned','rejected') THEN
    RAISE EXCEPTION 'resultado_invalido';
  END IF;
  SELECT ca.id, ca.status, ca.attendant_id, ca.organization_id, ca.deal_id
    INTO v_locked
  FROM public.credit_analyses ca
  WHERE ca.id = p_analysis_id AND ca.organization_id = v_org
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
    PERFORM public.set_deal_lost_internal(
      v_locked.deal_id,
      'credito reprovado: ' || COALESCE(p_reason, 'sem motivo informado'),
      COALESCE(p_reason, 'credito_reprovado'), NULL);
    new_stage_id := NULL;
  ELSE
    SELECT d.funnel_id INTO v_funnel FROM public.deals d WHERE d.id = v_locked.deal_id;
    v_target_stage := COALESCE(
      public.stage_id_for_role(v_funnel, 'aprovado_aguardando', v_org),
      'ia-aprovado-aguardando');
    PERFORM public.move_deal_stage_internal(
      v_locked.deal_id, v_target_stage,
      'devolutiva do correspondente: ' || p_result, NULL, false);
    new_stage_id := v_target_stage;
  END IF;
  analysis_id := p_analysis_id; status := 'returned'; result := p_result;
  deal_id := v_locked.deal_id; RETURN NEXT;
END;
$function$;

-- 7) Devolutiva de garantia: idem, destino pelo PAPEL no funil do deal.
CREATE OR REPLACE FUNCTION public.submit_guarantee_devolutiva(
  p_analysis_id uuid, p_result text, p_guarantee_type text DEFAULT NULL::text,
  p_conditions text DEFAULT NULL::text, p_reason text DEFAULT NULL::text,
  p_retomada_prazo_dias integer DEFAULT NULL::integer,
  p_custom_fields_response jsonb DEFAULT NULL::jsonb)
  RETURNS TABLE(analysis_id uuid, status text, result text, deal_id text, new_stage_id text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_allowed boolean;
  v_target_stage text;
  v_funnel text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF p_result NOT IN ('approved','approved_conditioned','rejected') THEN
    RAISE EXCEPTION 'resultado_invalido';
  END IF;
  SELECT ga.id, ga.status, ga.analyst_id, ga.organization_id, ga.deal_id
    INTO v_locked
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.analyst_id = auth.uid();
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_locked.status <> 'in_analysis' THEN
    RAISE EXCEPTION 'analise_nao_esta_em_andamento';
  END IF;
  UPDATE public.guarantee_analyses
     SET status = 'returned', result = p_result,
         guarantee_type = COALESCE(p_guarantee_type, guarantee_type),
         result_conditions = CASE WHEN p_result = 'approved_conditioned' THEN p_conditions ELSE NULL END,
         result_reason = p_reason,
         retomada_prazo_dias = p_retomada_prazo_dias,
         custom_fields_response = COALESCE(p_custom_fields_response, custom_fields_response),
         returned_at = v_now, updated_at = v_now
   WHERE id = p_analysis_id;
  IF p_result = 'rejected' THEN
    PERFORM public.set_deal_lost_internal(
      v_locked.deal_id,
      'garantia reprovada: ' || COALESCE(p_reason, 'sem motivo informado'),
      COALESCE(p_reason, 'garantia_reprovada'), NULL);
    new_stage_id := NULL;
  ELSE
    SELECT d.funnel_id INTO v_funnel FROM public.deals d WHERE d.id = v_locked.deal_id;
    v_target_stage := COALESCE(
      public.stage_id_for_role(v_funnel, 'aprovado_aguardando', v_org),
      'loc-aprovado-aguardando');
    PERFORM public.move_deal_stage_internal(
      v_locked.deal_id, v_target_stage,
      'devolutiva da garantia: ' || p_result, NULL, false);
    new_stage_id := v_target_stage;
  END IF;
  analysis_id := p_analysis_id; status := 'returned'; result := p_result;
  deal_id := v_locked.deal_id; RETURN NEXT;
END;
$function$;

-- 8) Hardening: devolutivas nunca devem ser chamaveis por anon (usuario nao
--    autenticado). O anon=X em submit_credit_devolutiva e heranca antiga
--    (presente em producao antes desta fatia); revogamos agora que tocamos nela.
REVOKE ALL ON FUNCTION public.submit_credit_devolutiva(uuid,text,text,text,integer,numeric,boolean,jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_credit_devolutiva(uuid,text,text,text,integer,numeric,boolean,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_guarantee_devolutiva(uuid,text,text,text,text,integer,jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_guarantee_devolutiva(uuid,text,text,text,text,integer,jsonb) TO authenticated, service_role;

COMMIT;
