-- ============================================================================
-- Fase A — Reconciliação de modelo (parte 1: status + reprovado→perdido)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- Objetivos desta migration:
--  1. Seed de status_archetypes (open/won/lost) — base do "perdido = status" (§4.4).
--  2. Helper interno set_deal_lost_internal(): marca deal como lost + registra
--     evento, sem depender de auth.uid()/current_org_id() (roda dentro de
--     SECURITY DEFINER chamado por trigger/RPC do servidor).
--  3. submit_credit_devolutiva: ao REPROVAR, marca o deal como LOST com o motivo
--     da devolutiva (em vez de mover p/ etapa 'ia-reprovado'). Gancho de nutrição
--     deixado preparado (lost_substage = motivo) p/ a Fase F plugar o funil.
-- ============================================================================

-- ---- 1. status_archetypes (open/won/lost) ---------------------------------
INSERT INTO public.status_archetypes (code, name, is_active)
VALUES
  ('open', 'Em aberto', true),
  ('won',  'Ganho',     true),
  ('lost', 'Perdido',   true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, is_active = EXCLUDED.is_active, updated_at = now();

-- ---- 2. helper interno: marcar deal como lost -----------------------------
-- Diferente de change_deal_status (que valida current_org_id()/auth.uid() para
-- uso via PostgREST), este é p/ uso SERVIDOR (dentro de SECURITY DEFINER), com
-- a org derivada do próprio deal. p_lost_substage carrega o MOTIVO (gancho da
-- nutrição: na Fase F vira a etapa de origem no funil de Nutrição).
CREATE OR REPLACE FUNCTION public.set_deal_lost_internal(
  p_deal_id text,
  p_reason text DEFAULT NULL,
  p_lost_substage text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS TABLE(deal_id text, from_status text, to_status text, changed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_locked record;
  v_now timestamptz := now();
BEGIN
  SELECT id, status, organization_id INTO v_locked
  FROM public.deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;
  IF v_locked.organization_id IS NULL THEN RAISE EXCEPTION 'deal_sem_organizacao'; END IF;

  -- No-op se já está lost (evita evento duplicado), mas atualiza motivo.
  UPDATE public.deals
     SET status = 'lost',
         status_reason = COALESCE(p_reason, status_reason),
         lost_substage = COALESCE(p_lost_substage, lost_substage),
         status_changed_at = v_now,
         won_date = NULL,
         updated_at = v_now
   WHERE id = p_deal_id;

  IF v_locked.status IS DISTINCT FROM 'lost' THEN
    INSERT INTO public.deal_status_events
      (deal_id, organization_id, from_status, to_status, reason, lost_substage, changed_by, changed_at)
    VALUES
      (p_deal_id, v_locked.organization_id, v_locked.status, 'lost', p_reason, p_lost_substage, p_actor_id, v_now);
  END IF;

  deal_id := p_deal_id;
  from_status := v_locked.status;
  to_status := 'lost';
  changed_at := v_now;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_deal_lost_internal(text, text, text, uuid) FROM anon, authenticated, public;

-- ---- 3. submit_credit_devolutiva: reprovado → LOST (não mais ia-reprovado) --
-- Mudança cirúrgica: aprovado/condicionado seguem p/ 'ia-aprovado-aguardando';
-- REPROVADO vira status=lost com o motivo (set_deal_lost_internal), saindo do
-- funil da IA. Resto da função idêntico ao vigente.
CREATE OR REPLACE FUNCTION public.submit_credit_devolutiva(
  p_analysis_id uuid,
  p_result text,
  p_conditions text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_retomada_prazo_dias integer DEFAULT NULL,
  p_approved_financing_amount numeric DEFAULT NULL,
  p_requires_entry boolean DEFAULT NULL,
  p_custom_fields_response jsonb DEFAULT NULL
)
RETURNS TABLE(analysis_id uuid, status text, result text, deal_id text, new_stage_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
      'devolutiva do correspondente: ' || p_result, NULL);
    new_stage_id := v_target_stage;
  END IF;

  analysis_id := p_analysis_id;
  status := 'returned';
  result := p_result;
  deal_id := v_locked.deal_id;
  RETURN NEXT;
END;
$fn$;

-- ---- 4. Funil IA 10→9 etapas: remover 'ia-reprovado' ----------------------
-- §4.2: etapa 10 (reprovado) deixa de ser etapa da IA (virou status lost→nutrição).
-- Guarda: só remove se NENHUM deal estiver nessa etapa (evita órfãos).
DO $do$
DECLARE
  v_funnel_id text;
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_count int;
BEGIN
  SELECT id INTO v_funnel_id FROM public.funnels
   WHERE organization_id = v_org AND is_ai_funnel = true LIMIT 1;
  IF v_funnel_id IS NULL THEN RAISE NOTICE 'funil IA não encontrado; pulando'; RETURN; END IF;

  SELECT count(*) INTO v_count FROM public.deals
   WHERE funnel_id = v_funnel_id AND stage_id = 'ia-reprovado';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'há % deal(s) em ia-reprovado; mover antes de remover a etapa', v_count;
  END IF;

  -- Remove a linha da etapa em funnel_stages.
  DELETE FROM public.funnel_stages
   WHERE funnel_id = v_funnel_id AND stage_id = 'ia-reprovado';

  -- Remove do array stages (jsonb) em funnels.
  UPDATE public.funnels
     SET stages = (
       SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
       FROM jsonb_array_elements(stages) elem
       WHERE elem->>'id' <> 'ia-reprovado'
     ),
     updated_at = now()
   WHERE id = v_funnel_id;

  RAISE NOTICE 'ia-reprovado removido do funil % (9 etapas)', v_funnel_id;
END
$do$;
