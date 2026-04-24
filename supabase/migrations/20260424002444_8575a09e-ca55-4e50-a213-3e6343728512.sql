-- ============================================================
-- ACTIVITY TYPES (customizable per organization)
-- ============================================================

CREATE TABLE public.activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'Circle',
  color text NOT NULL DEFAULT 'hsl(var(--primary))',
  default_duration_min integer NOT NULL DEFAULT 30,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_activity_types_org ON public.activity_types (organization_id, position);

ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem tipos da org"
  ON public.activity_types FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "Admins criam tipos"
  ON public.activity_types FOR INSERT
  WITH CHECK (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Admins atualizam tipos"
  ON public.activity_types FOR UPDATE
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Admins excluem tipos não-sistema"
  ON public.activity_types FOR DELETE
  USING (organization_id = current_org_id() AND is_org_admin() AND is_system = false);

CREATE TRIGGER trg_activity_types_updated_at
  BEFORE UPDATE ON public.activity_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed tipos do sistema para todas as organizações existentes
INSERT INTO public.activity_types (organization_id, code, label, icon, color, default_duration_min, is_system, position)
SELECT o.id, t.code, t.label, t.icon, t.color, t.dur, true, t.pos
FROM public.organizations o
CROSS JOIN (VALUES
  ('call',     'Ligar',           'Phone',         'hsl(145,63%,49%)', 15, 0),
  ('visit',    'Visita',          'MapPin',        'hsl(210,80%,55%)', 60, 1),
  ('proposal', 'Enviar Proposta', 'FileText',      'hsl(38,92%,50%)',  30, 2),
  ('followup', 'Follow-up',       'MessageCircle', 'hsl(270,60%,65%)', 10, 3)
) AS t(code, label, icon, color, dur, pos);

-- ============================================================
-- DEAL ACTIVITIES (histórico estruturado)
-- ============================================================

CREATE TABLE public.deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text NOT NULL,
  organization_id uuid NOT NULL,
  type_code text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  done_at timestamptz,
  outcome_summary text NOT NULL DEFAULT '',
  next_action_required boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_activities_deal ON public.deal_activities (deal_id, scheduled_at DESC);
CREATE INDEX idx_deal_activities_org_pending ON public.deal_activities (organization_id, scheduled_at)
  WHERE done_at IS NULL;

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todas as atividades da org"
  ON public.deal_activities FOR SELECT
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Corretores veem atividades dos seus deals"
  ON public.deal_activities FOR SELECT
  USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_activities.deal_id AND d.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Admins inserem atividades"
  ON public.deal_activities FOR INSERT
  WITH CHECK (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Corretores inserem atividades dos seus deals"
  ON public.deal_activities FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_activities.deal_id AND d.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Admins atualizam atividades"
  ON public.deal_activities FOR UPDATE
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE POLICY "Corretores atualizam atividades dos seus deals"
  ON public.deal_activities FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_activities.deal_id AND d.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Admins excluem atividades"
  ON public.deal_activities FOR DELETE
  USING (organization_id = current_org_id() AND is_org_admin());

CREATE TRIGGER trg_deal_activities_updated_at
  BEFORE UPDATE ON public.deal_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- COLUNAS DE ATALHO em deals (para regras de bloqueio rápidas)
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS next_action_type text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_summary text NOT NULL DEFAULT '';

-- Trigger: sincroniza colunas de atalho em deals quando uma atividade é criada/atualizada
CREATE OR REPLACE FUNCTION public.sync_deal_next_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next record;
  v_last record;
BEGIN
  -- Próxima atividade pendente (mais antiga futura ou vencida)
  SELECT type_code, scheduled_at, description
    INTO v_next
  FROM public.deal_activities
  WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
    AND done_at IS NULL
    AND scheduled_at IS NOT NULL
  ORDER BY scheduled_at ASC
  LIMIT 1;

  -- Última atividade concluída
  SELECT done_at, outcome_summary
    INTO v_last
  FROM public.deal_activities
  WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
    AND done_at IS NOT NULL
  ORDER BY done_at DESC
  LIMIT 1;

  UPDATE public.deals
     SET next_action_type        = v_next.type_code,
         next_action_at          = v_next.scheduled_at,
         next_action_description = COALESCE(v_next.description, ''),
         last_activity_at        = v_last.done_at,
         last_activity_summary   = COALESCE(v_last.outcome_summary, '')
   WHERE id = COALESCE(NEW.deal_id, OLD.deal_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_deal_next_action
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_activities
  FOR EACH ROW EXECUTE FUNCTION public.sync_deal_next_action();

-- ============================================================
-- RPC: registra resultado + agenda próxima atividade em uma transação
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_deal_activity(
  p_deal_id text,
  p_done_activity_id uuid,
  p_outcome_summary text,
  p_next_type_code text,
  p_next_scheduled_at timestamptz,
  p_next_description text,
  p_new_stage_id text DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_loss_reason text DEFAULT NULL,
  p_archive boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_now timestamptz := now();
  v_new_activity_id uuid;
  v_deal record;
BEGIN
  v_org := public.current_org_id();
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;

  SELECT id, assigned_to, organization_id, stage_id, status
    INTO v_deal
  FROM public.deals
  WHERE id = p_deal_id AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;
  IF NOT public.is_org_admin() AND v_deal.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  -- Marca atividade pendente como feita (se houver)
  IF p_done_activity_id IS NOT NULL THEN
    UPDATE public.deal_activities
       SET done_at = v_now,
           outcome_summary = COALESCE(p_outcome_summary, outcome_summary)
     WHERE id = p_done_activity_id AND deal_id = p_deal_id;
  ELSIF p_outcome_summary IS NOT NULL AND p_outcome_summary <> '' THEN
    -- Cria registro avulso de atividade já concluída
    INSERT INTO public.deal_activities (deal_id, organization_id, type_code, scheduled_at, done_at, outcome_summary, created_by)
    VALUES (p_deal_id, v_org, COALESCE(p_next_type_code, 'followup'), v_now, v_now, p_outcome_summary, auth.uid());
  END IF;

  -- Próxima atividade (se solicitada e não arquivado)
  IF NOT p_archive AND p_next_type_code IS NOT NULL AND p_next_scheduled_at IS NOT NULL THEN
    INSERT INTO public.deal_activities
      (deal_id, organization_id, type_code, scheduled_at, description, next_action_required, created_by)
    VALUES
      (p_deal_id, v_org, p_next_type_code, p_next_scheduled_at, COALESCE(p_next_description, ''), true, auth.uid())
    RETURNING id INTO v_new_activity_id;
  END IF;

  -- Mudança de etapa
  IF p_new_stage_id IS NOT NULL AND p_new_stage_id <> v_deal.stage_id THEN
    PERFORM public.move_deal_stage(p_deal_id, p_new_stage_id, NULL);
  END IF;

  -- Mudança de status
  IF p_archive THEN
    UPDATE public.deals
       SET status = 'lost',
           status_reason = COALESCE(p_loss_reason, 'arquivado'),
           lost_substage = 'arquivado',
           status_changed_at = v_now,
           updated_at = v_now
     WHERE id = p_deal_id;
  ELSIF p_new_status IS NOT NULL AND p_new_status <> v_deal.status THEN
    PERFORM public.change_deal_status(p_deal_id, p_new_status, p_loss_reason, NULL);
  END IF;

  RETURN v_new_activity_id;
END;
$$;