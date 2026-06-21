-- ============================================================================
-- Fase G-2 — Motor de sugestão de tags pela IA (§4.7, §4.13)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- A IA sugere a aplicação de tags (temperatura/objeções/decisão) a um deal a partir
-- da conversa. NO COMEÇO, TUDO entra como SUGESTÃO (status='suggested') — nada é
-- aplicado sem aprovação humana (validar antes de soltar). O admin aprova/rejeita.
-- Tags NOVAS (que a IA acha que faltam no catálogo) vão p/ tag_suggestions.
-- ============================================================================

-- ---- 1. deal_tag_assignments: status + origem + confiança -------------------
ALTER TABLE public.deal_tag_assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',  -- suggested | approved | rejected
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human',     -- human | ai
  ADD COLUMN IF NOT EXISTS confidence numeric,                       -- 0..1 (sugestão da IA)
  ADD COLUMN IF NOT EXISTS rationale text,                           -- por que a IA sugeriu
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dta_status_chk') THEN
    ALTER TABLE public.deal_tag_assignments ADD CONSTRAINT dta_status_chk CHECK (status IN ('suggested','approved','rejected'));
  END IF;
END $c$;

-- ---- 2. tag_suggestions: tags NOVAS que a IA propõe criar -------------------
CREATE TABLE IF NOT EXISTS public.tag_suggestions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id         text,
  group_code      text,                 -- grupo sugerido (temperatura/objecoes/...)
  proposed_name   text NOT NULL,        -- nome da tag nova proposta
  rationale       text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_suggestions_status_chk CHECK (status IN ('pending','approved','rejected'))
);
ALTER TABLE public.tag_suggestions ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tag_suggestions' AND policyname='omni_tag_suggestions_select') THEN
    CREATE POLICY omni_tag_suggestions_select ON public.tag_suggestions FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
    CREATE POLICY omni_tag_suggestions_write ON public.tag_suggestions TO authenticated
      USING (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())))
      WITH CHECK (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())));
  END IF;
END $p$;

-- ---- 3. RPC interna: IA registra sugestão de tag existente ------------------
-- Chamada pelo worker (service-role). Cria/atualiza um assignment status='suggested'
-- source='ai'. Idempotente por (deal_id, tag_id). NÃO aplica (fica pendente).
CREATE OR REPLACE FUNCTION public.suggest_deal_tag_internal(
  p_deal_id text, p_tag_id bigint, p_confidence numeric DEFAULT NULL, p_rationale text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO public.deal_tag_assignments (deal_id, tag_id, status, source, confidence, rationale)
  VALUES (p_deal_id, p_tag_id, 'suggested', 'ai', p_confidence, p_rationale)
  ON CONFLICT (deal_id, tag_id) DO UPDATE
    SET confidence = EXCLUDED.confidence, rationale = EXCLUDED.rationale
    WHERE public.deal_tag_assignments.status = 'suggested';  -- não mexe se já aprovada/rejeitada
END;
$fn$;
REVOKE ALL ON FUNCTION public.suggest_deal_tag_internal(text, bigint, numeric, text) FROM anon, authenticated, public;

-- ---- 4. RPCs de revisão humana (aprovar/rejeitar sugestão de tag) -----------
CREATE OR REPLACE FUNCTION public.review_tag_suggestion(p_assignment_id bigint, p_approve boolean)
RETURNS TABLE(assignment_id bigint, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  SELECT dta.id, dta.status, d.assigned_to, d.organization_id
    INTO v_locked
  FROM public.deal_tag_assignments dta
  JOIN public.deals d ON d.id = dta.deal_id
  WHERE dta.id = p_assignment_id AND d.organization_id = v_org
  FOR UPDATE OF dta;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestao_nao_encontrada'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR v_locked.assigned_to = auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF v_locked.status <> 'suggested' THEN RAISE EXCEPTION 'nao_esta_sugerida (status=%)', v_locked.status; END IF;

  UPDATE public.deal_tag_assignments
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_assignment_id;

  assignment_id := p_assignment_id;
  status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  RETURN NEXT;
END;
$fn$;
REVOKE ALL ON FUNCTION public.review_tag_suggestion(bigint, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.review_tag_suggestion(bigint, boolean) TO authenticated;

-- ---- 5. Lista sugestões de tag pendentes (p/ painel) ------------------------
CREATE OR REPLACE FUNCTION public.get_pending_tag_suggestions()
RETURNS TABLE(assignment_id bigint, deal_id text, lead_name text, tag_id bigint, tag_name text,
              group_name text, confidence numeric, rationale text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT dta.id, dta.deal_id, d.lead_name, t.id, t.name,
         COALESCE(g.name,'(sem grupo)'), dta.confidence, dta.rationale, dta.assigned_at
  FROM public.deal_tag_assignments dta
  JOIN public.deals d ON d.id = dta.deal_id
  JOIN public.deal_tags t ON t.id = dta.tag_id
  LEFT JOIN public.tag_groups g ON g.id = t.group_id
  WHERE d.organization_id = public.current_org_id()
    AND dta.status = 'suggested' AND dta.source = 'ai'
    AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR d.assigned_to = auth.uid())
  ORDER BY dta.assigned_at ASC;
$fn$;
REVOKE ALL ON FUNCTION public.get_pending_tag_suggestions() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_pending_tag_suggestions() TO authenticated;
