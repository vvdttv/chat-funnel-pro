-- ============================================================================
-- Fix 2.3 — Motor da cadência de nutrição (§4.5)
-- Omnimob v3. Idempotente + atômica.
--
-- Cards no funil de nutrição têm uma cadência (followup_ladders, via
-- funnel_stages.context_tags->>'ladder'). Este motor varre os cards ativos e,
-- quando o próximo passo da escada "vence" (afterHours desde a entrada), ENFILEIRA
-- a mensagem na ai_response_queue (modo assistido — você aprova antes de enviar).
-- NÃO envia sozinho. Roda via cron de hora em hora.
-- ============================================================================
BEGIN;

-- ---- 1. Estado da cadência por card -----------------------------------------
CREATE TABLE IF NOT EXISTS public.nurture_cadence_state (
  deal_id          text PRIMARY KEY,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ladder_code      text,
  entered_at       timestamptz NOT NULL DEFAULT now(),
  last_step_index  int NOT NULL DEFAULT -1,   -- -1 = nenhum passo enviado ainda
  last_enqueued_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nurture_cadence_state ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nurture_cadence_state' AND policyname='omni_ncs_select') THEN
    CREATE POLICY omni_ncs_select ON public.nurture_cadence_state FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
  END IF;
END $p$;

-- ---- 2. Motor: enfileira o próximo passo vencido de cada card de nutrição ----
CREATE OR REPLACE FUNCTION public.run_nurture_cadence_internal()
RETURNS TABLE(enqueued int, evaluated int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  r record;
  v_ladder text;
  v_steps jsonb;
  v_entered timestamptz;
  v_last int;
  v_next int;
  v_after numeric;
  v_msg text;
  v_enq int := 0;
  v_eval int := 0;
BEGIN
  FOR r IN
    SELECT d.id AS deal_id, d.organization_id, d.funnel_id, d.stage_id, d.lead_name,
           fs.context_tags->>'ladder' AS ladder_code,
           COALESCE(d.status_changed_at, d.updated_at) AS entered_at
    FROM public.deals d
    JOIN public.funnel_stages fs ON fs.funnel_id = d.funnel_id AND fs.stage_id = d.stage_id
    WHERE d.funnel_id = 'fun-nutricao-mcmv' AND d.status = 'open'
  LOOP
    v_eval := v_eval + 1;
    v_ladder := r.ladder_code;
    IF v_ladder IS NULL THEN CONTINUE; END IF;

    SELECT steps INTO v_steps FROM public.followup_ladders
     WHERE organization_id = r.organization_id AND code = v_ladder AND is_active LIMIT 1;
    IF v_steps IS NULL OR jsonb_array_length(v_steps) = 0 THEN CONTINUE; END IF;

    -- estado atual (cria se não existe)
    INSERT INTO public.nurture_cadence_state (deal_id, organization_id, ladder_code, entered_at)
    VALUES (r.deal_id, r.organization_id, v_ladder, r.entered_at)
    ON CONFLICT (deal_id) DO UPDATE SET ladder_code = EXCLUDED.ladder_code;

    SELECT last_step_index, entered_at INTO v_last, v_entered
      FROM public.nurture_cadence_state WHERE deal_id = r.deal_id;

    v_next := v_last + 1;
    IF v_next >= jsonb_array_length(v_steps) THEN CONTINUE; END IF;  -- cadência esgotada

    v_after := COALESCE((v_steps -> v_next ->> 'afterHours')::numeric, 0);
    -- o próximo passo só dispara se já passou afterHours desde a ENTRADA na etapa
    IF now() < v_entered + (v_after || ' hours')::interval THEN CONTINUE; END IF;

    v_msg := replace(COALESCE(v_steps -> v_next ->> 'sampleMessage',''), '[nome]', COALESCE(r.lead_name,'tudo bem?'));
    IF v_msg = '' THEN CONTINUE; END IF;

    -- enfileira como sugestão (modo assistido); o operador aprova o envio.
    INSERT INTO public.ai_response_queue
      (organization_id, deal_id, funnel_id, stage_id, lead_message, suggested_response,
       status, autonomy_mode, scheduled_send_at, context)
    VALUES
      (r.organization_id, r.deal_id, r.funnel_id, r.stage_id,
       '[cadência de nutrição — passo ' || (v_next+1) || ']', v_msg,
       'awaiting_approval', 'suggest_only', now(),
       jsonb_build_object('source','nurture_cadence','ladder',v_ladder,'step',v_next));

    UPDATE public.nurture_cadence_state
       SET last_step_index = v_next, last_enqueued_at = now(), updated_at = now()
     WHERE deal_id = r.deal_id;

    v_enq := v_enq + 1;
  END LOOP;

  enqueued := v_enq; evaluated := v_eval; RETURN NEXT;
END;
$fn$;
REVOKE ALL ON FUNCTION public.run_nurture_cadence_internal() FROM anon, authenticated, public;

COMMIT;
