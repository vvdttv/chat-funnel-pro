-- ============================================================================
-- Reativação Nutrição → IA (§4.5)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- Quando um lead que está no funil de nutrição (deal de origem lost + card-espelho
-- em fun-nutricao-mcmv) RESPONDE no WhatsApp, ele deve VOLTAR para a IA — tipicamente
-- a etapa 2 (ia-atendimento), com contexto preservado. Esta RPC reabre o deal de
-- origem e encerra o card de nutrição. Chamada pelo whatsapp-webhook ao detectar
-- inbound de um deal lost.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reactivate_deal_from_nurture_internal(
  p_deal_id text,
  p_target_stage text DEFAULT 'ia-atendimento'
)
RETURNS TABLE(deal_id text, reactivated boolean, from_status text, nurture_closed text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_deal record;
  v_now timestamptz := now();
  v_nurture text;
  v_ai_funnel text;
BEGIN
  SELECT id, status, organization_id, funnel_id, stage_id
    INTO v_deal
  FROM public.deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;

  -- Só reativa se está LOST (perdido). Outros status: no-op (não é reativação).
  IF v_deal.status IS DISTINCT FROM 'lost' THEN
    deal_id := p_deal_id; reactivated := false; from_status := v_deal.status; nurture_closed := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- Resolve o funil de IA da org (o deal de origem normalmente já é do funil IA).
  SELECT id INTO v_ai_funnel FROM public.funnels
   WHERE organization_id = v_deal.organization_id AND is_ai_funnel = true LIMIT 1;

  -- Reabre o deal de origem: status open + volta p/ a etapa-alvo no funil da IA.
  -- Se o deal de origem JÁ é do funil IA, mantém o funil; senão aponta p/ o funil IA.
  UPDATE public.deals
     SET status = 'open',
         funnel_id = COALESCE(v_ai_funnel, funnel_id),
         stage_id = p_target_stage,
         status_reason = 'reativado da nutrição (lead respondeu)',
         lost_substage = NULL,
         status_changed_at = v_now,
         updated_at = v_now
   WHERE id = p_deal_id;

  -- Registra evento de status (lost → open).
  INSERT INTO public.deal_status_events
    (deal_id, organization_id, from_status, to_status, reason, changed_at)
  VALUES
    (p_deal_id, v_deal.organization_id, 'lost', 'open', 'reativação da nutrição', v_now);

  -- Encerra o card de nutrição espelho (se existir) — marca won? não: cancela via
  -- status lost com motivo de reativação, ou remove da operação. Usamos status
  -- 'won' não cabe; marcamos status_reason e movemos p/ fora do fluxo ativo.
  -- Abordagem: marca o card de nutrição como 'lost' com motivo 'reativado' (sai
  -- do fluxo de cadência) — o histórico fica preservado e o lastro continua.
  SELECT id INTO v_nurture FROM public.deals
   WHERE organization_id = v_deal.organization_id
     AND funnel_id = 'fun-nutricao-mcmv'
     AND mirror_deal_id = p_deal_id
   LIMIT 1;
  IF v_nurture IS NOT NULL THEN
    UPDATE public.deals
       SET status = 'won',   -- "ganho" no contexto da nutrição = resgatou o lead
           status_reason = 'lead reativado → devolvido à IA',
           status_changed_at = v_now, updated_at = v_now
     WHERE id = v_nurture;
    INSERT INTO public.deal_status_events
      (deal_id, organization_id, from_status, to_status, reason, changed_at)
    VALUES (v_nurture, v_deal.organization_id, 'open', 'won', 'lead resgatado da nutrição', v_now);
  END IF;

  deal_id := p_deal_id; reactivated := true; from_status := 'lost'; nurture_closed := v_nurture;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reactivate_deal_from_nurture_internal(text, text) FROM anon, authenticated, public;
