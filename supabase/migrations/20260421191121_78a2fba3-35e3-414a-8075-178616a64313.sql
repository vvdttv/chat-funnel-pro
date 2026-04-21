-- ============================================================================
-- Camada comportamental da IA — tabelas, RLS e índices
-- ============================================================================

-- ============================================================================
-- 1) ia_rules — regras universais e por etapa (DO / DONT / ASK / NOASK)
-- ============================================================================
CREATE TABLE public.ia_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                     -- ex.: IA-DO-001, E1-DONT-003
  kind TEXT NOT NULL CHECK (kind IN ('do','dont','ask','noask')),
  scope TEXT NOT NULL,                    -- 'universal' ou 'E0' | 'E1' | 'E2' | 'E3' | 'E4a' | 'E4b'
  text TEXT NOT NULL,
  meta TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_ia_rules_org ON public.ia_rules(organization_id);
CREATE INDEX idx_ia_rules_org_scope ON public.ia_rules(organization_id, scope);
CREATE INDEX idx_ia_rules_org_kind ON public.ia_rules(organization_id, kind);

ALTER TABLE public.ia_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem regras da org"
  ON public.ia_rules FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "Admins criam regras"
  ON public.ia_rules FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins atualizam regras"
  ON public.ia_rules FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins excluem regras"
  ON public.ia_rules FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE TRIGGER trg_ia_rules_updated_at
  BEFORE UPDATE ON public.ia_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2) lead_behaviors — catálogo de comportamentos do lead (LB-xxx)
-- ============================================================================
CREATE TABLE public.lead_behaviors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                                 -- ex.: LB-001
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('positive','neutral','evasive','negative','objection')),
  typical_stages JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array de etapas ('*' | 'E0'..'E4b')
  detection_hints JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de strings
  default_reaction TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_lead_behaviors_org ON public.lead_behaviors(organization_id);
CREATE INDEX idx_lead_behaviors_org_category ON public.lead_behaviors(organization_id, category);

ALTER TABLE public.lead_behaviors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem comportamentos da org"
  ON public.lead_behaviors FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "Admins criam comportamentos"
  ON public.lead_behaviors FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins atualizam comportamentos"
  ON public.lead_behaviors FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins excluem comportamentos"
  ON public.lead_behaviors FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE TRIGGER trg_lead_behaviors_updated_at
  BEFORE UPDATE ON public.lead_behaviors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 3) followup_ladders — escadas de follow-up
-- ============================================================================
CREATE TABLE public.followup_ladders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                       -- ex.: LADDER-FAST
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de { afterHours, tone, sampleMessage }
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_followup_ladders_org ON public.followup_ladders(organization_id);

ALTER TABLE public.followup_ladders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem escadas da org"
  ON public.followup_ladders FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "Admins criam escadas"
  ON public.followup_ladders FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins atualizam escadas"
  ON public.followup_ladders FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins excluem escadas"
  ON public.followup_ladders FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE TRIGGER trg_followup_ladders_updated_at
  BEFORE UPDATE ON public.followup_ladders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 4) handoff_triggers — gatilhos de transferência humana
-- ============================================================================
CREATE TABLE public.handoff_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                       -- ex.: HT-P0-001
  priority TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),
  label TEXT NOT NULL,
  stage TEXT NOT NULL,                      -- '*' | 'E0' .. 'E4b'
  condition TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_handoff_triggers_org ON public.handoff_triggers(organization_id);
CREATE INDEX idx_handoff_triggers_org_priority ON public.handoff_triggers(organization_id, priority);

ALTER TABLE public.handoff_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem gatilhos da org"
  ON public.handoff_triggers FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "Admins criam gatilhos"
  ON public.handoff_triggers FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins atualizam gatilhos"
  ON public.handoff_triggers FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins excluem gatilhos"
  ON public.handoff_triggers FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE TRIGGER trg_handoff_triggers_updated_at
  BEFORE UPDATE ON public.handoff_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 5) stage_playbooks — playbooks por etapa (E0…E4b)
-- ============================================================================
CREATE TABLE public.stage_playbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                                  -- ex.: E0, E1, E2, E3, E4a, E4b
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de strings
  failure_criteria JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de strings
  default_ladder_code TEXT,
  identity JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { aiName, persona, lgpdScript }
  typical_behavior_codes JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de LB-xxx
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_stage_playbooks_org ON public.stage_playbooks(organization_id);

ALTER TABLE public.stage_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem playbooks da org"
  ON public.stage_playbooks FOR SELECT
  USING (organization_id = public.current_org_id());

CREATE POLICY "Admins criam playbooks"
  ON public.stage_playbooks FOR INSERT
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins atualizam playbooks"
  ON public.stage_playbooks FOR UPDATE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Admins excluem playbooks"
  ON public.stage_playbooks FOR DELETE
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE TRIGGER trg_stage_playbooks_updated_at
  BEFORE UPDATE ON public.stage_playbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 6) ia_decision_logs — auditoria de decisões da IA
-- ============================================================================
CREATE TABLE public.ia_decision_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id TEXT,
  funnel_id TEXT,
  stage_id TEXT,
  playbook_code TEXT,
  detected_behavior_codes JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de LB-xxx
  applied_rule_codes JSONB NOT NULL DEFAULT '[]'::jsonb,      -- array de IA-* / E*-*
  intent TEXT,
  tone TEXT,
  action_taken TEXT NOT NULL DEFAULT '',
  outcome TEXT,                                                -- 'success' | 'fallback' | 'handoff' | 'silence'
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ia_decision_logs_org ON public.ia_decision_logs(organization_id);
CREATE INDEX idx_ia_decision_logs_org_deal ON public.ia_decision_logs(organization_id, deal_id);
CREATE INDEX idx_ia_decision_logs_org_stage ON public.ia_decision_logs(organization_id, stage_id);
CREATE INDEX idx_ia_decision_logs_created_at ON public.ia_decision_logs(created_at DESC);

ALTER TABLE public.ia_decision_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todos os logs da org"
  ON public.ia_decision_logs FOR SELECT
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

CREATE POLICY "Corretores veem logs dos seus deals"
  ON public.ia_decision_logs FOR SELECT
  USING (
    organization_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = ia_decision_logs.deal_id
        AND d.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Membros inserem logs da org"
  ON public.ia_decision_logs FOR INSERT
  WITH CHECK (organization_id = public.current_org_id());
