
-- ============================================================================
-- S27 — Camada de Skills da IA (3 tabelas + coluna em ia_decision_logs)
-- ============================================================================

-- 1) ia_skills — uma skill = unidade reutilizável de comportamento da IA
CREATE TABLE public.ia_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scope_type TEXT NOT NULL DEFAULT 'universal', -- 'universal' | 'stage' | 'context'
  scope_id TEXT,                                 -- ex.: 'E2' ou 'real-estate'
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_auto_suggested BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_ia_skills_org_active ON public.ia_skills(organization_id, is_active);
CREATE INDEX idx_ia_skills_scope ON public.ia_skills(organization_id, scope_type, scope_id);

ALTER TABLE public.ia_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem skills da org"
  ON public.ia_skills FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "Admins criam skills"
  ON public.ia_skills FOR INSERT
  WITH CHECK ((organization_id = current_org_id()) AND is_org_admin());

CREATE POLICY "Admins atualizam skills"
  ON public.ia_skills FOR UPDATE
  USING ((organization_id = current_org_id()) AND is_org_admin());

CREATE POLICY "Admins excluem skills"
  ON public.ia_skills FOR DELETE
  USING ((organization_id = current_org_id()) AND is_org_admin());

CREATE TRIGGER trg_ia_skills_updated
  BEFORE UPDATE ON public.ia_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) ia_skill_nodes — nós do canvas (árvore por parent_node_id)
CREATE TABLE public.ia_skill_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_id UUID NOT NULL REFERENCES public.ia_skills(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  kind TEXT NOT NULL, -- 'trigger' | 'send_message' | 'wait' | 'collect' | 'set_tone' | 'handoff' | 'apply_ladder' | 'call_skill' | 'condition'
  parent_node_id UUID REFERENCES public.ia_skill_nodes(id) ON DELETE CASCADE,
  branch_label TEXT, -- ex.: 'true' | 'false' para nó condition
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ia_skill_nodes_skill ON public.ia_skill_nodes(skill_id);
CREATE INDEX idx_ia_skill_nodes_parent ON public.ia_skill_nodes(parent_node_id);

ALTER TABLE public.ia_skill_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem nodes da org"
  ON public.ia_skill_nodes FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "Admins criam nodes"
  ON public.ia_skill_nodes FOR INSERT
  WITH CHECK ((organization_id = current_org_id()) AND is_org_admin());

CREATE POLICY "Admins atualizam nodes"
  ON public.ia_skill_nodes FOR UPDATE
  USING ((organization_id = current_org_id()) AND is_org_admin());

CREATE POLICY "Admins excluem nodes"
  ON public.ia_skill_nodes FOR DELETE
  USING ((organization_id = current_org_id()) AND is_org_admin());

CREATE TRIGGER trg_ia_skill_nodes_updated
  BEFORE UPDATE ON public.ia_skill_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) ia_skill_guardrails — M:N skill <-> rule_code (DO/DONT/ASK/NOASK)
CREATE TABLE public.ia_skill_guardrails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_id UUID NOT NULL REFERENCES public.ia_skills(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  rule_code TEXT NOT NULL, -- ex.: 'IA-DO-006', 'IA-DONT-014'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (skill_id, rule_code)
);

CREATE INDEX idx_ia_skill_guardrails_skill ON public.ia_skill_guardrails(skill_id);

ALTER TABLE public.ia_skill_guardrails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem guardrails da org"
  ON public.ia_skill_guardrails FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "Admins criam guardrails"
  ON public.ia_skill_guardrails FOR INSERT
  WITH CHECK ((organization_id = current_org_id()) AND is_org_admin());

CREATE POLICY "Admins excluem guardrails"
  ON public.ia_skill_guardrails FOR DELETE
  USING ((organization_id = current_org_id()) AND is_org_admin());

-- 4) coluna nova em ia_decision_logs para rastrear qual skill foi ativada
ALTER TABLE public.ia_decision_logs
  ADD COLUMN activated_skill_code TEXT;

CREATE INDEX idx_ia_decision_logs_skill ON public.ia_decision_logs(organization_id, activated_skill_code);
