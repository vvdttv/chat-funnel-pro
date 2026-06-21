-- ============================================================================
-- Fase E — Lastro bidirecional entre funil IA e funil do corretor (§4.3)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- Hoje transfer_deal_to_broker_internal grava mirror_deal_id no card do CORRETOR
-- apontando p/ o deal-IA (corretor→IA), mas o deal-IA NÃO aponta de volta. §4.3
-- pede vínculo nos DOIS lados (transferência mantém card como lastro + cria nova
-- oportunidade no corretor). Esta migration adiciona o UPDATE de volta no deal-IA.
-- Resto da função idêntico ao vigente.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_deal_to_broker_internal(
  p_ia_deal_id text, p_broker_id uuid, p_target_corretor_stage text,
  p_reason text, p_appointment_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(broker_deal_id text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org uuid;
  v_deal record;
  v_new_id text;
  v_existing text;
BEGIN
  SELECT d.organization_id, d.lead_id, d.lead_name, d.property, d.property_code, d.value
    INTO v_deal
  FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  v_org := v_deal.organization_id;

  PERFORM pg_advisory_xact_lock(hashtext('omnimob_transfer_' || p_ia_deal_id));

  SELECT d.id INTO v_existing
  FROM public.deals d
  WHERE d.organization_id = v_org
    AND d.funnel_id = 'fun-corretor-mcmv'
    AND d.mirror_deal_id = p_ia_deal_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    broker_deal_id := v_existing;
    created := false;
    RETURN NEXT; RETURN;
  END IF;

  v_new_id := 'cordeal-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.deals
    (id, funnel_id, stage_id, lead_id, lead_name, property, property_code, value,
     status, organization_id, assigned_to, mirror_deal_id, status_reason)
  VALUES
    (v_new_id, 'fun-corretor-mcmv', p_target_corretor_stage, v_deal.lead_id, v_deal.lead_name,
     v_deal.property, v_deal.property_code, v_deal.value, 'open', v_org,
     (SELECT user_id FROM public.broker_profiles WHERE id = p_broker_id),
     p_ia_deal_id, p_reason);

  -- §4.3 LASTRO BIDIRECIONAL: o deal-IA aponta de volta p/ o card do corretor.
  -- Permite navegar IA→corretor (antes só corretor→IA). NÃO muda etapa/status do
  -- deal-IA (ele permanece como lastro na sua etapa atual).
  UPDATE public.deals
     SET mirror_deal_id = v_new_id, updated_at = now()
   WHERE id = p_ia_deal_id;

  BEGIN
    PERFORM public.generate_broker_briefing_internal(
      p_ia_deal_id, v_new_id, p_broker_id, p_appointment_id,
      CASE WHEN p_target_corretor_stage = 'cor-agendar-visita' THEN 'troca_voz' ELSE 'agendamento' END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'falha ao gerar briefing p/ deal %: %', p_ia_deal_id, SQLERRM;
  END;

  broker_deal_id := v_new_id;
  created := true;
  RETURN NEXT;
END;
$fn$;
