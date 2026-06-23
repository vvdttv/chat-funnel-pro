-- =====================================================================
-- OmniMob — Fase J-2b-1b: Funil do corretor de locacao + roteamento por funil
-- Cria fun-corretor-locacao (7 etapas dedicadas, decisao B) e corrige o BUG
-- LATENTE: confirm_appointment_internal e transfer_deal_to_broker_internal
-- cravavam ia-transferido / cor-visita-agendada / fun-corretor-mcmv -> deal de
-- locacao iria p/ etapa fantasma. Agora roteiam PELO FUNIL usando os papeis da
-- 0a (transferido / corretor_inicial) + a roleta com acesso por funil da 1a.
-- ATOMICA + idempotente + nao-destrutiva (vendas inalterado).
-- =====================================================================
BEGIN;

-- 1) Funil do corretor de locacao (espelho conceitual do fun-corretor-mcmv).
INSERT INTO public.funnels (id, name, description, icon, color, position, is_default, context_tags, is_ai_funnel, segment_code, organization_id, stages)
VALUES (
  'fun-corretor-locacao',
  'Funil do Corretor — Locação',
  'Funil operado pelo corretor de locação após a garantia aprovada (7 etapas).',
  'UserRound', 'hsl(var(--primary))', 5, false,
  '["locacao", "corretor"]'::jsonb, false, 'locacao',
  '11111111-1111-1111-1111-111111111111',
  '[
    {"id":"corloc-visita-agendada","name":"Visita agendada","probability":40,"maxDaysInStage":3,"touchpoints":[],"role":"corretor_inicial"},
    {"id":"corloc-negociacao","name":"Em negociação","probability":55,"maxDaysInStage":5,"touchpoints":[]},
    {"id":"corloc-vistoria-entrada","name":"Vistoria de entrada","probability":65,"maxDaysInStage":5,"touchpoints":[],"role":"vistoria_entrada"},
    {"id":"corloc-contrato","name":"Contrato em elaboração","probability":75,"maxDaysInStage":4,"touchpoints":[],"role":"contrato"},
    {"id":"corloc-assinatura","name":"Assinatura do contrato","probability":85,"maxDaysInStage":3,"touchpoints":[]},
    {"id":"corloc-ativo","name":"Locação ativa","probability":95,"maxDaysInStage":30,"touchpoints":[]},
    {"id":"corloc-encerramento","name":"Encerramento + vistoria de saída","probability":100,"maxDaysInStage":30,"touchpoints":[]}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 2) Etapas fisicas (tabela do motor). ai_autonomy_mode='disabled' (corretor humano).
INSERT INTO public.funnel_stages (organization_id, funnel_id, stage_id, position, purpose, role, ai_autonomy_mode)
VALUES
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-visita-agendada',1,'Visita marcada, ainda nao realizada.','corretor_inicial','disabled'),
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-negociacao',2,'Negociacao de termos da locacao.',NULL,'disabled'),
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-vistoria-entrada',3,'Vistoria de entrada (operada pelo administrativo).','vistoria_entrada','disabled'),
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-contrato',4,'Elaboracao do contrato de locacao (exige garantia aprovada).','contrato','disabled'),
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-assinatura',5,'Assinatura do contrato pelas partes.',NULL,'disabled'),
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-ativo',6,'Locacao ativa.',NULL,'disabled'),
  ('11111111-1111-1111-1111-111111111111','fun-corretor-locacao','corloc-encerramento',7,'Encerramento + vistoria de saida.',NULL,'disabled')
ON CONFLICT (funnel_id, stage_id) DO NOTHING;

-- 3) transfer_deal_to_broker_internal CIENTE DO FUNIL de destino.
--    Novo param p_target_funnel (default 'fun-corretor-mcmv' = compat vendas).
--    Parametriza os 2 pontos que cravavam 'fun-corretor-mcmv' (busca de card
--    existente + INSERT). DROP da versao 5-arg (muda assinatura).
DROP FUNCTION IF EXISTS public.transfer_deal_to_broker_internal(text,uuid,text,text,uuid);
CREATE OR REPLACE FUNCTION public.transfer_deal_to_broker_internal(
  p_ia_deal_id text, p_broker_id uuid, p_target_corretor_stage text, p_reason text,
  p_appointment_id uuid DEFAULT NULL::uuid, p_target_funnel text DEFAULT 'fun-corretor-mcmv')
  RETURNS TABLE(broker_deal_id text, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    AND d.funnel_id = p_target_funnel
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
    (v_new_id, p_target_funnel, p_target_corretor_stage, v_deal.lead_id, v_deal.lead_name,
     v_deal.property, v_deal.property_code, v_deal.value, 'open', v_org,
     (SELECT user_id FROM public.broker_profiles WHERE id = p_broker_id),
     p_ia_deal_id, p_reason);

  UPDATE public.deals
     SET mirror_deal_id = v_new_id, updated_at = now()
   WHERE id = p_ia_deal_id;

  BEGIN
    PERFORM public.generate_broker_briefing_internal(
      p_ia_deal_id, v_new_id, p_broker_id, p_appointment_id,
      CASE WHEN p_target_corretor_stage IN ('cor-agendar-visita') THEN 'troca_voz' ELSE 'agendamento' END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'falha ao gerar briefing p/ deal %: %', p_ia_deal_id, SQLERRM;
  END;

  broker_deal_id := v_new_id;
  created := true;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_deal_to_broker_internal(text,uuid,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_deal_to_broker_internal(text,uuid,text,text,uuid,text) TO service_role;

-- 4) Mapa IA-funnel -> corretor-funnel (qual funil de corretor recebe a
--    transferencia de cada funil de IA). Tabela pequena, configuravel.
CREATE TABLE IF NOT EXISTS public.funnel_handoff_map (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_funnel   text NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  target_funnel   text NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_funnel)
);
ALTER TABLE public.funnel_handoff_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omni_handoff_select ON public.funnel_handoff_map;
CREATE POLICY omni_handoff_select ON public.funnel_handoff_map FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS omni_handoff_write ON public.funnel_handoff_map;
CREATE POLICY omni_handoff_write ON public.funnel_handoff_map FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

INSERT INTO public.funnel_handoff_map (organization_id, source_funnel, target_funnel) VALUES
  ('11111111-1111-1111-1111-111111111111','fun-ia-mcmv','fun-corretor-mcmv'),
  ('11111111-1111-1111-1111-111111111111','fun-ia-locacao','fun-corretor-locacao')
ON CONFLICT (organization_id, source_funnel) DO NOTHING;

-- 5) confirm_appointment_internal ROTEANDO POR FUNIL via papeis + handoff map.
--    Resolve o funil do deal, o destino (transferido) pelo papel no MESMO funil,
--    o funil do corretor (handoff map) e a etapa inicial dele (corretor_inicial).
--    Passa o funil de IA a roleta (corretores com acesso). Fallback ao
--    comportamento de vendas se algo nao resolver (nao quebra o fluxo atual).
CREATE OR REPLACE FUNCTION public.confirm_appointment_internal(
  p_ia_deal_id text, p_scheduled_at timestamp with time zone,
  p_channel text DEFAULT 'presencial'::text, p_location text DEFAULT NULL::text)
  RETURNS TABLE(appointment_id uuid, broker_deal_id text, broker_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_funnel text;
  v_appt_id uuid;
  v_appt_broker_id uuid;
  v_broker_id uuid;
  v_now timestamptz := now();
  v_transfer_deal text;
  v_transferido_stage text;
  v_target_funnel text;
  v_corretor_stage text;
BEGIN
  SELECT d.organization_id, d.funnel_id INTO v_org, v_funnel FROM public.deals d WHERE d.id = p_ia_deal_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  IF p_channel NOT IN ('presencial','video','ligacao') THEN
    RAISE EXCEPTION 'canal_invalido';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_confirm_' || p_ia_deal_id));

  -- Resolve roteamento por papel/funil (com fallbacks p/ o comportamento atual).
  v_transferido_stage := COALESCE(public.stage_id_for_role(v_funnel, 'transferido', v_org), 'ia-transferido');
  SELECT target_funnel INTO v_target_funnel FROM public.funnel_handoff_map
    WHERE organization_id = v_org AND source_funnel = v_funnel;
  v_target_funnel := COALESCE(v_target_funnel, 'fun-corretor-mcmv');
  v_corretor_stage := COALESCE(public.stage_id_for_role(v_target_funnel, 'corretor_inicial', v_org), 'cor-visita-agendada');

  -- appointment aberto (ou cria), com roleta CIENTE DO FUNIL de IA.
  SELECT a.id, a.broker_id INTO v_appt_id, v_appt_broker_id
  FROM public.appointments a
  WHERE a.ia_deal_id = p_ia_deal_id AND a.status IN ('proposed','confirmed')
  LIMIT 1;
  IF v_appt_id IS NOT NULL THEN
    v_broker_id := v_appt_broker_id;
  ELSE
    v_broker_id := public.assign_broker_internal(v_org, v_funnel);
    INSERT INTO public.appointments
      (organization_id, ia_deal_id, broker_id, kind, channel, status, first_attempt_at)
    VALUES (v_org, p_ia_deal_id, v_broker_id, 'visita', p_channel, 'proposed', v_now)
    RETURNING id INTO v_appt_id;
  END IF;
  IF v_broker_id IS NULL THEN
    v_broker_id := public.assign_broker_internal(v_org, v_funnel);
  END IF;
  v_broker_id := COALESCE(v_appt_broker_id, v_broker_id);

  UPDATE public.appointments
     SET status = 'confirmed', scheduled_at = p_scheduled_at, channel = p_channel,
         location = p_location, broker_id = v_broker_id, confirmed_at = v_now, updated_at = v_now
   WHERE id = v_appt_id;
  IF v_broker_id IS NULL THEN
    RAISE WARNING 'confirm_appointment: nenhum corretor com acesso ao funil % p/ deal % (org %) — appointment % confirmado sem corretor; redistribuir no painel', v_funnel, p_ia_deal_id, v_org, v_appt_id;
  END IF;

  -- Move o deal-IA p/ a etapa 'transferido' DO SEU funil (resolvida por papel).
  PERFORM public.move_deal_stage_internal(
    p_ia_deal_id, v_transferido_stage,
    'agendamento confirmado: ' || to_char(p_scheduled_at, 'DD/MM HH24:MI'), NULL, false);

  -- Cria o card no funil do corretor CERTO, na etapa inicial dele.
  SELECT t.broker_deal_id INTO v_transfer_deal
  FROM public.transfer_deal_to_broker_internal(
    p_ia_deal_id, v_broker_id, v_corretor_stage,
    'transferência por agendamento bem-sucedido', v_appt_id, v_target_funnel) t;

  appointment_id := v_appt_id;
  broker_deal_id := v_transfer_deal;
  broker_id := v_broker_id;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_appointment_internal(text,timestamptz,text,text) TO service_role;
-- REVOKE por ULTIMO: event triggers do Supabase (ddl_command_end) reconcedem
-- authenticated a cada DDL; garantir que o REVOKE seja a ultima palavra.
REVOKE ALL ON FUNCTION public.confirm_appointment_internal(text,timestamptz,text,text) FROM PUBLIC, anon, authenticated;

COMMIT;
