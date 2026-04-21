-- Sprint 6: instrumentação composicional + transições atômicas

-- 1) Estende ia_decision_logs com campos composicionais ---------------------
ALTER TABLE public.ia_decision_logs
  ADD COLUMN IF NOT EXISTS archetype_code text,
  ADD COLUMN IF NOT EXISTS status_overlay_code text,
  ADD COLUMN IF NOT EXISTS applied_override_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deal_status text;

CREATE INDEX IF NOT EXISTS idx_ia_decision_logs_archetype
  ON public.ia_decision_logs (archetype_code);
CREATE INDEX IF NOT EXISTS idx_ia_decision_logs_status_overlay
  ON public.ia_decision_logs (status_overlay_code);
CREATE INDEX IF NOT EXISTS idx_ia_decision_logs_deal_status
  ON public.ia_decision_logs (deal_status);

-- 2) RPC atômica de transição de etapa --------------------------------------
CREATE OR REPLACE FUNCTION public.move_deal_stage(
  p_deal_id text,
  p_new_stage_id text,
  p_reason text DEFAULT NULL
) RETURNS TABLE (
  deal_id text,
  from_stage_id text,
  to_stage_id text,
  moved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_is_admin boolean;
  v_locked_deal record;
  v_now timestamptz := now();
BEGIN
  v_org := public.current_org_id();
  v_is_admin := public.is_org_admin();

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'sem_organizacao';
  END IF;

  -- Trava a linha do deal antes de qualquer leitura/escrita derivada
  SELECT id, funnel_id, stage_id, status, assigned_to, organization_id
    INTO v_locked_deal
  FROM public.deals
  WHERE id = p_deal_id
    AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_nao_encontrado';
  END IF;

  IF NOT v_is_admin AND v_locked_deal.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  -- No-op se já está na etapa (evita evento duplicado)
  IF v_locked_deal.stage_id = p_new_stage_id THEN
    deal_id := v_locked_deal.id;
    from_stage_id := v_locked_deal.stage_id;
    to_stage_id := p_new_stage_id;
    moved_at := v_now;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atualiza o deal (o trigger record_deal_stage_event registra o evento)
  UPDATE public.deals
     SET stage_id = p_new_stage_id,
         updated_at = v_now,
         status_reason = COALESCE(p_reason, status_reason)
   WHERE id = p_deal_id;

  deal_id := v_locked_deal.id;
  from_stage_id := v_locked_deal.stage_id;
  to_stage_id := p_new_stage_id;
  moved_at := v_now;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.move_deal_stage(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_deal_stage(text, text, text) TO authenticated;

-- 3) RPC atômica de transição de status -------------------------------------
CREATE OR REPLACE FUNCTION public.change_deal_status(
  p_deal_id text,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_lost_substage text DEFAULT NULL
) RETURNS TABLE (
  deal_id text,
  from_status text,
  to_status text,
  changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_is_admin boolean;
  v_locked_deal record;
  v_now timestamptz := now();
  v_won_date timestamptz;
BEGIN
  v_org := public.current_org_id();
  v_is_admin := public.is_org_admin();

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'sem_organizacao';
  END IF;

  IF p_new_status NOT IN ('open', 'won', 'lost') THEN
    RAISE EXCEPTION 'status_invalido';
  END IF;

  SELECT id, status, assigned_to, organization_id, won_date
    INTO v_locked_deal
  FROM public.deals
  WHERE id = p_deal_id
    AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_nao_encontrado';
  END IF;

  IF NOT v_is_admin AND v_locked_deal.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  IF v_locked_deal.status = p_new_status THEN
    deal_id := v_locked_deal.id;
    from_status := v_locked_deal.status;
    to_status := p_new_status;
    changed_at := v_now;
    RETURN NEXT;
    RETURN;
  END IF;

  v_won_date := CASE
    WHEN p_new_status = 'won' THEN v_now
    WHEN p_new_status <> 'won' AND v_locked_deal.status = 'won' THEN NULL
    ELSE v_locked_deal.won_date
  END;

  UPDATE public.deals
     SET status = p_new_status,
         status_reason = p_reason,
         lost_substage = CASE WHEN p_new_status = 'lost' THEN p_lost_substage ELSE NULL END,
         status_changed_at = v_now,
         won_date = v_won_date,
         updated_at = v_now
   WHERE id = p_deal_id;

  INSERT INTO public.deal_status_events
    (deal_id, organization_id, from_status, to_status, reason, lost_substage, changed_by, changed_at)
  VALUES
    (p_deal_id, v_org, v_locked_deal.status, p_new_status, p_reason,
     CASE WHEN p_new_status = 'lost' THEN p_lost_substage ELSE NULL END,
     auth.uid(), v_now);

  deal_id := v_locked_deal.id;
  from_status := v_locked_deal.status;
  to_status := p_new_status;
  changed_at := v_now;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.change_deal_status(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_deal_status(text, text, text, text) TO authenticated;