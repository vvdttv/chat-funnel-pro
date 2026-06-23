-- =====================================================================
-- OmniMob — Fase J-2a: Garantia Locaticia (equiv. correspondente bancario)
-- Espelha credit_analyses para a etapa loc-analise-garantia (fun-ia-locacao).
-- Decisoes do cliente: 1) reusar lifecycle, SEM roleta (fila do admin);
-- 2) criar tabelas-filhas docs+comments agora; 3) painel novo (front, fora);
-- 4) incluir SLA agora; 5) seed de criterios 1.4 como ponto de partida.
-- ATOMICA (BEGIN/COMMIT) + idempotente + nao-destrutiva.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.guarantee_analyses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id                text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  guarantee_type         text,
  analyst_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider_name          text,
  status                 text NOT NULL DEFAULT 'received',
  result                 text,
  result_conditions      text,
  result_reason          text,
  retomada_prazo_dias    integer,
  custom_fields_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at            timestamptz NOT NULL DEFAULT now(),
  analysis_started_at    timestamptz,
  returned_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guarantee_analyses DROP CONSTRAINT IF EXISTS guarantee_analyses_status_chk;
ALTER TABLE public.guarantee_analyses ADD CONSTRAINT guarantee_analyses_status_chk
  CHECK (status = ANY (ARRAY['received','in_analysis','returned','cancelled']));
ALTER TABLE public.guarantee_analyses DROP CONSTRAINT IF EXISTS guarantee_analyses_result_chk;
ALTER TABLE public.guarantee_analyses ADD CONSTRAINT guarantee_analyses_result_chk
  CHECK (result IS NULL OR result = ANY (ARRAY['approved','approved_conditioned','rejected']));
ALTER TABLE public.guarantee_analyses DROP CONSTRAINT IF EXISTS guarantee_analyses_type_chk;
ALTER TABLE public.guarantee_analyses ADD CONSTRAINT guarantee_analyses_type_chk
  CHECK (guarantee_type IS NULL OR guarantee_type = ANY (ARRAY['fiador','caucao','seguro_fianca','titulo_capitalizacao']));
ALTER TABLE public.guarantee_analyses DROP CONSTRAINT IF EXISTS guarantee_analyses_retomada_chk;
ALTER TABLE public.guarantee_analyses ADD CONSTRAINT guarantee_analyses_retomada_chk
  CHECK (retomada_prazo_dias IS NULL OR retomada_prazo_dias > 0);

CREATE UNIQUE INDEX IF NOT EXISTS guarantee_one_open_per_deal
  ON public.guarantee_analyses (deal_id)
  WHERE status = ANY (ARRAY['received','in_analysis']);
CREATE INDEX IF NOT EXISTS idx_guarantee_analyses_deal       ON public.guarantee_analyses (deal_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_analyses_org_status ON public.guarantee_analyses (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_guarantee_analyses_analyst    ON public.guarantee_analyses (analyst_id, status);

DROP TRIGGER IF EXISTS trg_guarantee_analyses_updated ON public.guarantee_analyses;
CREATE TRIGGER trg_guarantee_analyses_updated BEFORE UPDATE ON public.guarantee_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.guarantee_analysis_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  analysis_id     uuid NOT NULL REFERENCES public.guarantee_analyses(id) ON DELETE CASCADE,
  file_url        text NOT NULL,
  file_name       text,
  mime_type       text,
  source          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guarantee_docs_analysis ON public.guarantee_analysis_documents (analysis_id);

CREATE TABLE IF NOT EXISTS public.guarantee_analysis_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  analysis_id     uuid NOT NULL REFERENCES public.guarantee_analyses(id) ON DELETE CASCADE,
  document_id     uuid REFERENCES public.guarantee_analysis_documents(id) ON DELETE SET NULL,
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guarantee_comments_analysis ON public.guarantee_analysis_comments (analysis_id);

ALTER TABLE public.guarantee_analyses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantee_analysis_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantee_analysis_comments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omni_ga_select ON public.guarantee_analyses;
CREATE POLICY omni_ga_select ON public.guarantee_analyses FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR analyst_id = auth.uid()));
DROP POLICY IF EXISTS omni_ga_update ON public.guarantee_analyses;
CREATE POLICY omni_ga_update ON public.guarantee_analyses FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR analyst_id = auth.uid()))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid()) OR analyst_id = auth.uid()));
DROP POLICY IF EXISTS omni_ga_insert ON public.guarantee_analyses;
CREATE POLICY omni_ga_insert ON public.guarantee_analyses FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());
DROP POLICY IF EXISTS omni_ga_delete ON public.guarantee_analyses;
CREATE POLICY omni_ga_delete ON public.guarantee_analyses FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

DROP POLICY IF EXISTS omni_gad_select ON public.guarantee_analysis_documents;
CREATE POLICY omni_gad_select ON public.guarantee_analysis_documents FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id AND ga.analyst_id = auth.uid())));
DROP POLICY IF EXISTS omni_gad_write ON public.guarantee_analysis_documents;
CREATE POLICY omni_gad_write ON public.guarantee_analysis_documents FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id AND ga.analyst_id = auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id AND ga.analyst_id = auth.uid())));

DROP POLICY IF EXISTS omni_gac_select ON public.guarantee_analysis_comments;
CREATE POLICY omni_gac_select ON public.guarantee_analysis_comments FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id AND ga.analyst_id = auth.uid())));
DROP POLICY IF EXISTS omni_gac_write ON public.guarantee_analysis_comments;
CREATE POLICY omni_gac_write ON public.guarantee_analysis_comments FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id AND ga.analyst_id = auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.guarantee_analyses ga
                         WHERE ga.id = analysis_id AND ga.analyst_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.assign_guarantee_analysis_internal(
  p_deal_id text, p_org uuid, p_reason text DEFAULT NULL::text)
  RETURNS TABLE(analysis_id uuid, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_analysis_id uuid;
  v_existing record;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'org_obrigatoria'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_guarantee_' || p_deal_id));
  SELECT ga.id INTO v_existing
  FROM public.guarantee_analyses ga
  WHERE ga.deal_id = p_deal_id AND ga.status IN ('received','in_analysis')
  LIMIT 1;
  IF FOUND THEN
    analysis_id := v_existing.id; created := false; RETURN NEXT; RETURN;
  END IF;
  BEGIN
    INSERT INTO public.guarantee_analyses
      (organization_id, deal_id, status, received_at, metadata)
    VALUES
      (p_org, p_deal_id, 'received', now(),
       jsonb_build_object('assign_reason', COALESCE(p_reason, 'entrada em loc-analise-garantia')))
    RETURNING id INTO v_analysis_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT ga.id INTO v_existing
    FROM public.guarantee_analyses ga
    WHERE ga.deal_id = p_deal_id AND ga.status IN ('received','in_analysis')
    LIMIT 1;
    analysis_id := v_existing.id; created := false; RETURN NEXT; RETURN;
  END;
  INSERT INTO public.guarantee_analysis_documents
    (organization_id, analysis_id, file_url, file_name, mime_type, source)
  SELECT p_org, v_analysis_id, ld.file_url, ld.file_name, ld.mime_type, ld.source
  FROM public.lead_documents ld
  WHERE ld.deal_id = p_deal_id;
  INSERT INTO public.internal_notifications
    (organization_id, kind, deal_id, analysis_id, payload, status)
  VALUES
    (p_org, 'new_guarantee_analysis', p_deal_id, v_analysis_id, '{}'::jsonb, 'pending');
  analysis_id := v_analysis_id; created := true; RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_guarantee_analysis_internal(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_guarantee_analysis_internal(text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.start_guarantee_analysis(p_analysis_id uuid)
  RETURNS TABLE(analysis_id uuid, status text, analysis_started_at timestamptz)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_allowed boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  SELECT ga.id, ga.status, ga.analyst_id, ga.organization_id, ga.analysis_started_at
    INTO v_locked
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.analyst_id = auth.uid();
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF v_locked.status <> 'received' THEN
    analysis_id := v_locked.id; status := v_locked.status;
    analysis_started_at := v_locked.analysis_started_at;
    RETURN NEXT; RETURN;
  END IF;
  UPDATE public.guarantee_analyses
     SET status = 'in_analysis',
         analysis_started_at = v_now,
         analyst_id = COALESCE(analyst_id, auth.uid()),
         updated_at = v_now
   WHERE id = p_analysis_id;
  analysis_id := p_analysis_id; status := 'in_analysis'; analysis_started_at := v_now;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_guarantee_analysis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_guarantee_analysis(uuid) TO authenticated;

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
  SELECT ga.id, ga.status, ga.analyst_id, ga.organization_id, ga.deal_id
    INTO v_locked
  FROM public.guarantee_analyses ga
  WHERE ga.id = p_analysis_id AND ga.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.analyst_id = auth.uid();
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
GRANT EXECUTE ON FUNCTION public.submit_guarantee_devolutiva(uuid,text,text,text,text,integer,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.flag_guarantee_analysis_sla(p_hours integer DEFAULT 24)
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT ga.id, ga.organization_id, ga.deal_id, ga.analyst_id
    FROM public.guarantee_analyses ga
    WHERE ga.status = 'in_analysis'
      AND ga.analysis_started_at < now() - make_interval(hours => GREATEST(p_hours, 1))
      AND NOT (ga.metadata ? 'sla_notified_at')
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.internal_notifications
      (organization_id, kind, deal_id, analysis_id, payload, status)
    VALUES
      (r.organization_id, 'guarantee_sla_overdue', r.deal_id, r.id,
       jsonb_build_object('hours', p_hours), 'pending');
    UPDATE public.guarantee_analyses
       SET metadata = metadata || jsonb_build_object('sla_notified_at', now()),
           updated_at = now()
     WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.flag_guarantee_analysis_sla(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_guarantee_analysis_sla(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_assign_correspondent_on_analise()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_ai boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;
  IF NEW.stage_id = 'ia-analise' THEN
    SELECT f.is_ai_funnel INTO v_is_ai FROM public.funnels f WHERE f.id = NEW.funnel_id;
    IF COALESCE(v_is_ai, false) THEN
      PERFORM public.assign_credit_analysis_internal(NEW.id, NEW.organization_id, 'entrada em ia-analise');
    END IF;
  END IF;
  IF NEW.stage_id = 'loc-analise-garantia' THEN
    PERFORM public.assign_guarantee_analysis_internal(NEW.id, NEW.organization_id, 'entrada em loc-analise-garantia');
  END IF;
  RETURN NEW;
END;
$function$;

-- Reescreve o gatilho de agendamento: agora cobre vendas (ia-aprovado-aguardando)
-- E locacao (loc-aprovado-aguardando). A propria etapa e a prova => nao exige
-- is_ai_funnel (funil de locacao e is_ai_funnel=false por design J-1). Usa
-- NEW.stage_id dinamicamente (nao mais literal hardcoded).
CREATE OR REPLACE FUNCTION public.tg_start_scheduling_on_approved()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_broker_id uuid;
  v_channel_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Early return: UPDATE que nao mexe na etapa nao interessa.
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  -- So as etapas de "aprovado, aguardando agendamento" (vendas + locacao).
  IF NEW.stage_id NOT IN ('ia-aprovado-aguardando','loc-aprovado-aguardando') THEN
    RETURN NEW;
  END IF;

  -- Cria appointment 'proposed' (idempotente pelo indice parcial). Roleta define
  -- o corretor que vai receber a transferencia ao fim do agendamento.
  v_broker_id := public.assign_broker_internal(NEW.organization_id);
  BEGIN
    INSERT INTO public.appointments
      (organization_id, ia_deal_id, broker_id, kind, channel, status, first_attempt_at, attempts)
    VALUES
      (NEW.organization_id, NEW.id, v_broker_id, 'visita', 'presencial', 'proposed', v_now, 0);
  EXCEPTION WHEN unique_violation THEN
    NULL; -- ja ha appointment aberto p/ este deal
  END;

  -- Enfileira a 1a resposta de agendamento (suggest_only; worker gera o texto).
  SELECT id INTO v_channel_id FROM public.lead_channels
  WHERE deal_id = NEW.id AND is_active ORDER BY created_at LIMIT 1;

  INSERT INTO public.ai_response_queue
    (organization_id, deal_id, funnel_id, stage_id, lead_channel_id,
     lead_message, status, autonomy_mode, context)
  VALUES
    (NEW.organization_id, NEW.id, NEW.funnel_id, NEW.stage_id, v_channel_id,
     '[gatilho interno: aprovado — iniciar tratativas de agendamento]',
     'pending', 'suggest_only',
     jsonb_build_object('trigger', 'scheduling_kickoff', 'broker_id', v_broker_id))
  ON CONFLICT DO NOTHING; -- H2: nao duplica se ja ha item pending p/ o deal

  RETURN NEW;
END;
$function$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'guarantee-analysis-sla') THEN
    PERFORM cron.schedule('guarantee-analysis-sla', '*/15 * * * *',
      'SELECT public.flag_guarantee_analysis_sla(24);');
  END IF;
END
$do$;

INSERT INTO public.stage_qualification_criteria
  (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111','fun-ia-locacao','loc-analise-garantia',
   'tipo_garantia','Tipo de garantia','select_single','ambos',
   jsonb_build_object('options', jsonb_build_array(
     jsonb_build_object('value','fiador','label','Fiador'),
     jsonb_build_object('value','caucao','label','Caucao'),
     jsonb_build_object('value','seguro_fianca','label','Seguro-fianca'),
     jsonb_build_object('value','titulo_capitalizacao','label','Titulo de capitalizacao'))),
   'Qual a modalidade de garantia escolhida pelo locatario?', true, 1, true),
  ('11111111-1111-1111-1111-111111111111','fun-ia-locacao','loc-analise-garantia',
   'renda_comprovada','Renda comprovada (R$)','threshold','ia',
   '{}'::jsonb,
   'Qual a renda mensal comprovada do locatario (ou do fiador)?', true, 2, true),
  ('11111111-1111-1111-1111-111111111111','fun-ia-locacao','loc-analise-garantia',
   'documentos_recebidos','Documentos recebidos','boolean','corretor',
   '{}'::jsonb,
   'Os documentos da garantia foram recebidos e conferidos?', true, 3, true)
ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

COMMIT;
