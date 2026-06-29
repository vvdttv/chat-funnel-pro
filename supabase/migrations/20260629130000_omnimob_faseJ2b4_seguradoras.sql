-- =====================================================================
-- OmniMob — Fase J-2b-4: Seguradoras (insurers + insurer_attendants) +
-- roleta deterministica + extensoes em guarantee_analyses.
-- Decisoes do cliente:
--   (G) seguradoras COM roleta+devolutiva DENTRO do sistema (correspondente bancario).
--   (B) tipo de garantia definido pelo administrativo na fila (RPC set_guarantee_type).
--       Roteamento p/ seguradora dispara IMEDIATAMENTE nessa RPC se o tipo for
--       seguro_fianca ou titulo_capitalizacao. Fiador/caucao ficam na fila do admin.
--   SLA unificado: mantem cron guarantee-analysis-sla (24h). Sem cron novo.
--   Notificacoes: reusa internal_notifications (kind new_guarantee_analysis).
-- Padrao: espelha Fase 2C (correspondent_banks/_attendants) e J-2b-2 (atribuicao manual).
-- ATOMICA (BEGIN/COMMIT) + idempotente + nao-destrutiva.
-- =====================================================================
BEGIN;

-- 1) Tabela insurers (seguradoras/emissoras)
CREATE TABLE IF NOT EXISTS public.insurers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  cnpj             text,
  contact_phone    text,
  contact_email    text,
  distribution_pct integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  position         integer NOT NULL DEFAULT 0,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insurers DROP CONSTRAINT IF EXISTS insurers_pct_chk;
ALTER TABLE public.insurers ADD CONSTRAINT insurers_pct_chk
  CHECK (distribution_pct BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS idx_insurers_org ON public.insurers (organization_id, is_active);
DROP TRIGGER IF EXISTS trg_insurers_updated ON public.insurers;
CREATE TRIGGER trg_insurers_updated BEFORE UPDATE ON public.insurers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Tabela insurer_attendants (atendentes da seguradora)
CREATE TABLE IF NOT EXISTS public.insurer_attendants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  insurer_id       uuid NOT NULL REFERENCES public.insurers(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name             text NOT NULL,
  email            text,
  phone_e164       text,
  distribution_pct integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insurer_attendants DROP CONSTRAINT IF EXISTS insurer_attendants_pct_chk;
ALTER TABLE public.insurer_attendants ADD CONSTRAINT insurer_attendants_pct_chk
  CHECK (distribution_pct BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS idx_insurer_attendants_org ON public.insurer_attendants (organization_id);
CREATE INDEX IF NOT EXISTS idx_insurer_attendants_insurer ON public.insurer_attendants (insurer_id);
CREATE UNIQUE INDEX IF NOT EXISTS insurer_attendants_user_uniq
  ON public.insurer_attendants (organization_id, user_id)
  WHERE user_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_insurer_attendants_updated ON public.insurer_attendants;
CREATE TRIGGER trg_insurer_attendants_updated BEFORE UPDATE ON public.insurer_attendants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Extensao em guarantee_analyses
ALTER TABLE public.guarantee_analyses
  ADD COLUMN IF NOT EXISTS insurer_id uuid REFERENCES public.insurers(id) ON DELETE SET NULL;
ALTER TABLE public.guarantee_analyses
  ADD COLUMN IF NOT EXISTS insurer_attendant_id uuid REFERENCES public.insurer_attendants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_guarantee_analyses_insurer ON public.guarantee_analyses (insurer_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_analyses_ins_attendant ON public.guarantee_analyses (insurer_attendant_id, status);

-- 4) RLS nas tabelas novas (admin escreve, membros leem) + helper
ALTER TABLE public.insurers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurer_attendants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omni_insurers_select ON public.insurers;
CREATE POLICY omni_insurers_select ON public.insurers FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS omni_insurers_write ON public.insurers;
CREATE POLICY omni_insurers_write ON public.insurers FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

DROP POLICY IF EXISTS omni_insurer_attendants_select ON public.insurer_attendants;
CREATE POLICY omni_insurer_attendants_select ON public.insurer_attendants FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS omni_insurer_attendants_write ON public.insurer_attendants;
CREATE POLICY omni_insurer_attendants_write ON public.insurer_attendants FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- Helper: ids dos atendentes da seguradora do usuario logado (espelho 2C)
CREATE OR REPLACE FUNCTION public.current_insurer_attendant_ids()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.id FROM public.insurer_attendants a
   WHERE a.user_id = auth.uid() AND a.organization_id = public.current_org_id()
$function$;
REVOKE ALL ON FUNCTION public.current_insurer_attendant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_insurer_attendant_ids() TO authenticated;

-- 5) Expansao das RLS de guarantee_analyses (e tabelas-filhas) para o atendente da seguradora
-- SELECT/UPDATE: admin OU superadmin OU analyst_id=uid() OU insurer_attendant_id IN current_insurer_attendant_ids()
DROP POLICY IF EXISTS omni_ga_select ON public.guarantee_analyses;
CREATE POLICY omni_ga_select ON public.guarantee_analyses FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR analyst_id = auth.uid()
              OR insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())));

DROP POLICY IF EXISTS omni_ga_update ON public.guarantee_analyses;
CREATE POLICY omni_ga_update ON public.guarantee_analyses FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR analyst_id = auth.uid()
              OR insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR analyst_id = auth.uid()
              OR insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())));

DROP POLICY IF EXISTS omni_gad_select ON public.guarantee_analysis_documents;
CREATE POLICY omni_gad_select ON public.guarantee_analysis_documents FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id
                           AND (ga.analyst_id = auth.uid()
                                OR ga.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))));

DROP POLICY IF EXISTS omni_gad_write ON public.guarantee_analysis_documents;
CREATE POLICY omni_gad_write ON public.guarantee_analysis_documents FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id
                           AND (ga.analyst_id = auth.uid()
                                OR ga.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id
                           AND (ga.analyst_id = auth.uid()
                                OR ga.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))));

DROP POLICY IF EXISTS omni_gac_select ON public.guarantee_analysis_comments;
CREATE POLICY omni_gac_select ON public.guarantee_analysis_comments FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id
                           AND (ga.analyst_id = auth.uid()
                                OR ga.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))));

DROP POLICY IF EXISTS omni_gac_write ON public.guarantee_analysis_comments;
CREATE POLICY omni_gac_write ON public.guarantee_analysis_comments FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id
                           AND (ga.analyst_id = auth.uid()
                                OR ga.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id
                           AND (ga.analyst_id = auth.uid()
                                OR ga.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids())))));

-- 6) RPC: assign_insurer_internal (roleta dupla deterministica)
-- service_role only. Idempotente: se ja ha insurer_id no analysis, retorna existente.
-- Score = distribution_pct / (1 + abertas). Maior score vence, empate por position, id.
CREATE OR REPLACE FUNCTION public.assign_insurer_internal(
  p_analysis_id uuid, p_org uuid)
  RETURNS TABLE(out_analysis_id uuid, out_insurer_id uuid, out_attendant_id uuid, out_created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_insurer uuid;
  v_attendant uuid;
  v_existing record;
BEGIN
  IF p_org IS NULL OR p_analysis_id IS NULL THEN RAISE EXCEPTION 'parametros_obrigatorios'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_insurer_assign_' || p_analysis_id::text));

  -- Idempotencia: ja roteado?
  SELECT ga.insurer_id, ga.insurer_attendant_id INTO v_existing
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  IF v_existing.insurer_id IS NOT NULL THEN
    out_analysis_id := p_analysis_id; out_insurer_id := v_existing.insurer_id;
    out_attendant_id := v_existing.insurer_attendant_id; out_created := false;
    RETURN NEXT; RETURN;
  END IF;

  -- 1) Seguradora vencedora
  SELECT b.id INTO v_insurer
  FROM public.insurers b
  LEFT JOIN (
    SELECT ga.insurer_id AS iid, count(*) AS n
    FROM public.guarantee_analyses ga
    WHERE ga.organization_id = p_org AND ga.status IN ('received','in_analysis')
    GROUP BY ga.insurer_id
  ) c ON c.iid = b.id
  WHERE b.organization_id = p_org AND b.is_active AND b.distribution_pct > 0
  ORDER BY (b.distribution_pct::numeric / (1 + COALESCE(c.n, 0))) DESC, b.position ASC, b.id ASC
  LIMIT 1;

  -- 2) Atendente vencedor dentro da seguradora
  IF v_insurer IS NOT NULL THEN
    SELECT a.id INTO v_attendant
    FROM public.insurer_attendants a
    LEFT JOIN (
      SELECT ga.insurer_attendant_id AS aid, count(*) AS n
      FROM public.guarantee_analyses ga
      WHERE ga.organization_id = p_org AND ga.status IN ('received','in_analysis')
      GROUP BY ga.insurer_attendant_id
    ) c ON c.aid = a.id
    WHERE a.organization_id = p_org AND a.insurer_id = v_insurer
      AND a.is_active AND a.distribution_pct > 0
    ORDER BY (a.distribution_pct::numeric / (1 + COALESCE(c.n, 0))) DESC, a.position ASC, a.id ASC
    LIMIT 1;
  END IF;

  -- 3) Persiste o roteamento (atendente pode ser NULL; admin redistribui depois)
  UPDATE public.guarantee_analyses
     SET insurer_id = v_insurer,
         insurer_attendant_id = v_attendant,
         updated_at = now()
   WHERE id = p_analysis_id;

  -- 4) Enfileira notificacao (reusa kind new_guarantee_analysis da J-2a)
  IF v_attendant IS NOT NULL THEN
    INSERT INTO public.internal_notifications
      (organization_id, kind, deal_id, analysis_id, payload, status)
    SELECT ga.organization_id, 'new_guarantee_analysis', ga.deal_id, ga.id,
           jsonb_build_object('insurer_id', v_insurer, 'attendant_id', v_attendant),
           'pending'
    FROM public.guarantee_analyses ga WHERE ga.id = p_analysis_id;
  END IF;

  out_analysis_id := p_analysis_id; out_insurer_id := v_insurer;
  out_attendant_id := v_attendant; out_created := true; RETURN NEXT;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.assign_insurer_internal(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.assign_insurer_internal(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- 7) RPC: set_guarantee_type (admin define o tipo; dispara roleta se aplicavel)
-- Trava: so editavel enquanto status='received' (nao deixa trocar tipo apos iniciar analise)
CREATE OR REPLACE FUNCTION public.set_guarantee_type(
  p_analysis_id uuid, p_type text)
  RETURNS TABLE(out_analysis_id uuid, out_type text, out_routed_to_insurer boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_routed boolean := false;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_type NOT IN ('fiador','caucao','seguro_fianca','titulo_capitalizacao') THEN
    RAISE EXCEPTION 'tipo_invalido' USING HINT = 'use fiador, caucao, seguro_fianca ou titulo_capitalizacao';
  END IF;
  SELECT ga.id, ga.status, ga.guarantee_type, ga.organization_id, ga.insurer_id
    INTO v_locked
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  IF v_locked.status <> 'received' THEN
    RAISE EXCEPTION 'tipo_imutavel_apos_inicio' USING HINT = 'tipo so e editavel enquanto status=received';
  END IF;

  UPDATE public.guarantee_analyses
     SET guarantee_type = p_type, updated_at = now()
   WHERE id = p_analysis_id;

  -- Roteia para seguradora se aplicavel E se nao ja foi roteada
  IF p_type IN ('seguro_fianca','titulo_capitalizacao') AND v_locked.insurer_id IS NULL THEN
    PERFORM public.assign_insurer_internal(p_analysis_id, v_org);
    v_routed := true;
  END IF;

  out_analysis_id := p_analysis_id; out_type := p_type; out_routed_to_insurer := v_routed;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_guarantee_type(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guarantee_type(uuid,text) TO authenticated, service_role;

-- 8) RPC: assign_insurer_to_analysis (admin sobrescreve manualmente)
-- Permite trocar de seguradora/atendente mesmo apos roleta, enquanto status='received' ou 'in_analysis'.
-- Valida que o atendente pertence a seguradora informada.
CREATE OR REPLACE FUNCTION public.assign_insurer_to_analysis(
  p_analysis_id uuid, p_insurer_id uuid, p_attendant_id uuid DEFAULT NULL)
  RETURNS TABLE(out_analysis_id uuid, out_insurer_id uuid, out_attendant_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_attendant_org uuid;
  v_attendant_insurer uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_insurer_id IS NULL THEN RAISE EXCEPTION 'insurer_obrigatorio'; END IF;

  SELECT ga.id, ga.status, ga.organization_id INTO v_locked
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  IF v_locked.status NOT IN ('received','in_analysis') THEN
    RAISE EXCEPTION 'analise_encerrada' USING HINT = 'so e possivel rotear analises abertas';
  END IF;

  -- Valida que a seguradora existe e pertence a org
  PERFORM 1 FROM public.insurers WHERE id = p_insurer_id AND organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'insurer_nao_encontrado'; END IF;

  -- Valida que o atendente (se informado) pertence a seguradora E a org
  IF p_attendant_id IS NOT NULL THEN
    SELECT a.organization_id, a.insurer_id INTO v_attendant_org, v_attendant_insurer
    FROM public.insurer_attendants a WHERE a.id = p_attendant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'atendente_nao_encontrado'; END IF;
    IF v_attendant_org <> v_org THEN RAISE EXCEPTION 'atendente_outra_org'; END IF;
    IF v_attendant_insurer <> p_insurer_id THEN RAISE EXCEPTION 'atendente_nao_pertence_ao_insurer'; END IF;
  END IF;

  UPDATE public.guarantee_analyses
     SET insurer_id = p_insurer_id,
         insurer_attendant_id = p_attendant_id,
         updated_at = now()
   WHERE id = p_analysis_id;

  -- Notifica se atendente setado
  IF p_attendant_id IS NOT NULL THEN
    INSERT INTO public.internal_notifications
      (organization_id, kind, deal_id, analysis_id, payload, status)
    SELECT ga.organization_id, 'new_guarantee_analysis', ga.deal_id, ga.id,
           jsonb_build_object('insurer_id', p_insurer_id, 'attendant_id', p_attendant_id, 'manual', true),
           'pending'
    FROM public.guarantee_analyses ga WHERE ga.id = p_analysis_id;
  END IF;

  out_analysis_id := p_analysis_id; out_insurer_id := p_insurer_id; out_attendant_id := p_attendant_id;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.assign_insurer_to_analysis(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_insurer_to_analysis(uuid,uuid,uuid) TO authenticated, service_role;

-- 9) submit_guarantee_devolutiva: amplia permissao para atendente da seguradora.
-- Mesma assinatura, so o corpo muda. CREATE OR REPLACE direto.
CREATE OR REPLACE FUNCTION public.submit_guarantee_devolutiva(
  p_analysis_id uuid,
  p_result text,
  p_guarantee_type text DEFAULT NULL::text,
  p_conditions text DEFAULT NULL::text,
  p_reason text DEFAULT NULL::text,
  p_retomada_prazo_dias integer DEFAULT NULL::integer,
  p_custom_fields_response jsonb DEFAULT NULL::jsonb)
  RETURNS TABLE(analysis_id uuid, status text, result text, deal_id text, new_stage_id text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT ga.id, ga.status, ga.analyst_id, ga.organization_id, ga.deal_id, ga.insurer_attendant_id
    INTO v_locked
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.analyst_id = auth.uid()
    OR v_locked.insurer_attendant_id IN (SELECT public.current_insurer_attendant_ids());
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_locked.status <> 'in_analysis' THEN
    RAISE EXCEPTION 'analise_nao_esta_em_andamento';
  END IF;
  UPDATE public.guarantee_analyses
     SET status = 'returned',
         result = p_result,
         guarantee_type = COALESCE(p_guarantee_type, guarantee_type),
         result_conditions = CASE WHEN p_result = 'approved_conditioned' THEN p_conditions ELSE NULL END,
         result_reason = p_reason,
         retomada_prazo_dias = p_retomada_prazo_dias,
         custom_fields_response = COALESCE(p_custom_fields_response, custom_fields_response),
         returned_at = v_now,
         updated_at = v_now
   WHERE id = p_analysis_id;
  IF p_result = 'rejected' THEN
    PERFORM public.set_deal_lost_internal(
      v_locked.deal_id,
      'garantia reprovada: ' || COALESCE(p_reason, 'sem motivo informado'),
      COALESCE(p_reason, 'garantia_reprovada'),
      NULL);
    new_stage_id := NULL;
  ELSE
    v_target_stage := 'loc-aprovado-aguardando';
    PERFORM public.move_deal_stage_internal(
      v_locked.deal_id, v_target_stage,
      'devolutiva da garantia: ' || p_result, NULL, false);
    new_stage_id := v_target_stage;
  END IF;
  analysis_id := p_analysis_id;
  status := 'returned';
  result := p_result;
  deal_id := v_locked.deal_id;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_guarantee_devolutiva(uuid,text,text,text,text,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_guarantee_devolutiva(uuid,text,text,text,text,integer,jsonb) TO authenticated, service_role;

COMMIT;