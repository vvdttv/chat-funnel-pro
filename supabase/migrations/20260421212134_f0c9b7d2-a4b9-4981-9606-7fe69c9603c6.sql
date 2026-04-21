-- ============================================================
-- SPRINT 2 — Schema, FKs, RLS e Integridade (migrations 02 a 11)
-- ============================================================

-- ========== 02 — handoff_priority enum ==========
-- A tabela handoff_triggers está vazia (verificado no baseline). Recriamos a coluna.
DO $$ BEGIN
  CREATE TYPE public.handoff_priority AS ENUM ('P0','P1','P2','P3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.handoff_triggers DROP COLUMN IF EXISTS priority;
ALTER TABLE public.handoff_triggers ADD COLUMN priority public.handoff_priority NOT NULL DEFAULT 'P2'::public.handoff_priority;

-- ========== 03 — FKs formais de organization_id ==========
ALTER TABLE public.ia_rules         DROP CONSTRAINT IF EXISTS ia_rules_organization_id_fkey;
ALTER TABLE public.lead_behaviors   DROP CONSTRAINT IF EXISTS lead_behaviors_organization_id_fkey;
ALTER TABLE public.followup_ladders DROP CONSTRAINT IF EXISTS followup_ladders_organization_id_fkey;
ALTER TABLE public.handoff_triggers DROP CONSTRAINT IF EXISTS handoff_triggers_organization_id_fkey;
ALTER TABLE public.stage_playbooks  DROP CONSTRAINT IF EXISTS stage_playbooks_organization_id_fkey;
ALTER TABLE public.ia_decision_logs DROP CONSTRAINT IF EXISTS ia_decision_logs_organization_id_fkey;

ALTER TABLE public.ia_rules         ADD CONSTRAINT ia_rules_organization_id_fkey         FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lead_behaviors   ADD CONSTRAINT lead_behaviors_organization_id_fkey   FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.followup_ladders ADD CONSTRAINT followup_ladders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.handoff_triggers ADD CONSTRAINT handoff_triggers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.stage_playbooks  ADD CONSTRAINT stage_playbooks_organization_id_fkey  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ia_decision_logs ADD CONSTRAINT ia_decision_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ========== 04 — stage_archetypes ==========
CREATE TABLE IF NOT EXISTS public.stage_archetypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  context_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_playbook_code text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stage_archetypes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados leem arquetipos" ON public.stage_archetypes;
DROP POLICY IF EXISTS "Apenas admins criam arquetipos" ON public.stage_archetypes;
DROP POLICY IF EXISTS "Apenas admins atualizam arquetipos" ON public.stage_archetypes;
DROP POLICY IF EXISTS "Apenas admins excluem arquetipos" ON public.stage_archetypes;
CREATE POLICY "Todos autenticados leem arquetipos"  ON public.stage_archetypes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Apenas admins criam arquetipos"      ON public.stage_archetypes FOR INSERT TO authenticated WITH CHECK (public.is_org_admin());
CREATE POLICY "Apenas admins atualizam arquetipos"  ON public.stage_archetypes FOR UPDATE TO authenticated USING (public.is_org_admin());
CREATE POLICY "Apenas admins excluem arquetipos"    ON public.stage_archetypes FOR DELETE TO authenticated USING (public.is_org_admin());
DROP TRIGGER IF EXISTS trg_stage_archetypes_updated ON public.stage_archetypes;
CREATE TRIGGER trg_stage_archetypes_updated BEFORE UPDATE ON public.stage_archetypes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 05 — status_archetypes ==========
CREATE TABLE IF NOT EXISTS public.status_archetypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  default_overlay_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_archetypes_code_chk CHECK (code IN ('open','won','lost'))
);
ALTER TABLE public.status_archetypes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos autenticados leem status arq" ON public.status_archetypes;
DROP POLICY IF EXISTS "Apenas admins criam status arq" ON public.status_archetypes;
DROP POLICY IF EXISTS "Apenas admins atualizam status arq" ON public.status_archetypes;
DROP POLICY IF EXISTS "Apenas admins excluem status arq" ON public.status_archetypes;
CREATE POLICY "Todos autenticados leem status arq"   ON public.status_archetypes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Apenas admins criam status arq"       ON public.status_archetypes FOR INSERT TO authenticated WITH CHECK (public.is_org_admin());
CREATE POLICY "Apenas admins atualizam status arq"   ON public.status_archetypes FOR UPDATE TO authenticated USING (public.is_org_admin());
CREATE POLICY "Apenas admins excluem status arq"     ON public.status_archetypes FOR DELETE TO authenticated USING (public.is_org_admin());
DROP TRIGGER IF EXISTS trg_status_archetypes_updated ON public.status_archetypes;
CREATE TRIGGER trg_status_archetypes_updated BEFORE UPDATE ON public.status_archetypes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 06 — playbook_overrides ==========
CREATE TABLE IF NOT EXISTS public.playbook_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  layer text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playbook_overrides_scope_chk CHECK (scope_type IN ('funnel','stage')),
  CONSTRAINT playbook_overrides_layer_chk CHECK (layer IN ('funnel_override','stage_override'))
);
CREATE INDEX IF NOT EXISTS idx_playbook_overrides_scope ON public.playbook_overrides (organization_id, scope_type, scope_id);
ALTER TABLE public.playbook_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros veem overrides da org" ON public.playbook_overrides;
DROP POLICY IF EXISTS "Admins criam overrides" ON public.playbook_overrides;
DROP POLICY IF EXISTS "Admins atualizam overrides" ON public.playbook_overrides;
DROP POLICY IF EXISTS "Admins excluem overrides" ON public.playbook_overrides;
CREATE POLICY "Membros veem overrides da org"  ON public.playbook_overrides FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam overrides"         ON public.playbook_overrides FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Admins atualizam overrides"     ON public.playbook_overrides FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Admins excluem overrides"       ON public.playbook_overrides FOR DELETE TO authenticated USING (organization_id = public.current_org_id() AND public.is_org_admin());
DROP TRIGGER IF EXISTS trg_playbook_overrides_updated ON public.playbook_overrides;
CREATE TRIGGER trg_playbook_overrides_updated BEFORE UPDATE ON public.playbook_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 07 — deal_status_events (append-only) ==========
CREATE TABLE IF NOT EXISTS public.deal_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  lost_substage text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  CONSTRAINT deal_status_events_to_chk CHECK (to_status IN ('open','won','lost'))
);
CREATE INDEX IF NOT EXISTS idx_deal_status_events_deal ON public.deal_status_events (deal_id, changed_at DESC);
ALTER TABLE public.deal_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins veem todos os eventos de status" ON public.deal_status_events;
DROP POLICY IF EXISTS "Corretores veem eventos dos seus deals" ON public.deal_status_events;
DROP POLICY IF EXISTS "Membros inserem eventos da org" ON public.deal_status_events;
CREATE POLICY "Admins veem todos os eventos de status"  ON public.deal_status_events FOR SELECT TO authenticated USING (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Corretores veem eventos dos seus deals"  ON public.deal_status_events FOR SELECT TO authenticated USING (organization_id = public.current_org_id() AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_status_events.deal_id AND d.assigned_to = auth.uid()));
CREATE POLICY "Membros inserem eventos da org"          ON public.deal_status_events FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id());

-- ========== 08 — deals: status NOT NULL DEFAULT + colunas auxiliares ==========
UPDATE public.deals SET status='open' WHERE status IS NULL OR status NOT IN ('open','won','lost');
ALTER TABLE public.deals
  ALTER COLUMN status SET DEFAULT 'open',
  ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_substage text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS won_date timestamptz;
DO $$ BEGIN
  ALTER TABLE public.deals ADD CONSTRAINT deals_status_chk CHECK (status IN ('open','won','lost'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== 09 — funnels + funnel_stages ==========
ALTER TABLE public.funnels ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.funnels ADD COLUMN IF NOT EXISTS context_tags jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_id text NOT NULL,
  stage_id text NOT NULL,
  position int NOT NULL DEFAULT 0,
  stage_archetype_id uuid REFERENCES public.stage_archetypes(id) ON DELETE RESTRICT,
  context_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  purpose text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_id, stage_id)
);
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros veem etapas da org" ON public.funnel_stages;
DROP POLICY IF EXISTS "Admins criam etapas" ON public.funnel_stages;
DROP POLICY IF EXISTS "Admins atualizam etapas" ON public.funnel_stages;
DROP POLICY IF EXISTS "Admins excluem etapas" ON public.funnel_stages;
CREATE POLICY "Membros veem etapas da org"      ON public.funnel_stages FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam etapas"             ON public.funnel_stages FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Admins atualizam etapas"         ON public.funnel_stages FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.is_org_admin());
CREATE POLICY "Admins excluem etapas"           ON public.funnel_stages FOR DELETE TO authenticated USING (organization_id = public.current_org_id() AND public.is_org_admin());
DROP TRIGGER IF EXISTS trg_funnel_stages_updated ON public.funnel_stages;
CREATE TRIGGER trg_funnel_stages_updated BEFORE UPDATE ON public.funnel_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 10 — stage_playbooks: archetype_id, kind, status_archetype_id ==========
ALTER TABLE public.stage_playbooks ADD COLUMN IF NOT EXISTS archetype_id uuid REFERENCES public.stage_archetypes(id) ON DELETE SET NULL;
ALTER TABLE public.stage_playbooks ADD COLUMN IF NOT EXISTS status_archetype_id uuid REFERENCES public.status_archetypes(id) ON DELETE SET NULL;
ALTER TABLE public.stage_playbooks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stage';
DO $$ BEGIN
  ALTER TABLE public.stage_playbooks ADD CONSTRAINT stage_playbooks_kind_chk CHECK (kind IN ('seed','overlay','funnel','stage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== 11 — lead_behaviors: applicable_context_tags + applicable_statuses ==========
ALTER TABLE public.lead_behaviors ADD COLUMN IF NOT EXISTS applicable_context_tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.lead_behaviors ADD COLUMN IF NOT EXISTS applicable_statuses jsonb NOT NULL DEFAULT '["open"]'::jsonb;
UPDATE public.lead_behaviors SET applicable_statuses='["open"]'::jsonb
  WHERE applicable_statuses IS NULL OR jsonb_array_length(applicable_statuses) = 0;
COMMENT ON COLUMN public.lead_behaviors.typical_stages IS 'DEPRECATED: use applicable_context_tags + applicable_statuses (Sprint 2, migration 11).';