-- =====================================================================
-- OmniMob — Fase J-2b-2: Vistoria (entrada/saida) + cadastro de vistoriadores
-- Decisoes do cliente: vistoria operada pelo DPTO ADMINISTRATIVO (nao corretor);
-- vistoriador = perito externo OU usuario administrativo (inspectors). DOIS modos
-- de atribuicao (roleta + fila), superadmin habilita quais; DEFAULT so fila.
-- Vistoria de ENTRADA nasce automatica na etapa papel vistoria_entrada; vistoria
-- de SAIDA e manual. Escala de condicao do checklist customizavel (config).
-- ATOMICA + idempotente + nao-destrutiva.
-- =====================================================================
BEGIN;

-- 1) Vistoriadores (espelho conceitual de broker_profiles).
CREATE TABLE IF NOT EXISTS public.inspectors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name             text NOT NULL,
  email            text,
  phone_e164       text,
  inspector_type   text NOT NULL DEFAULT 'administrativo',
  distribution_pct integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  position         integer NOT NULL DEFAULT 0,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspectors DROP CONSTRAINT IF EXISTS inspectors_type_chk;
ALTER TABLE public.inspectors ADD CONSTRAINT inspectors_type_chk
  CHECK (inspector_type = ANY (ARRAY['perito_externo','administrativo']));
CREATE INDEX IF NOT EXISTS idx_inspectors_org ON public.inspectors (organization_id, is_active);
DROP TRIGGER IF EXISTS trg_inspectors_updated ON public.inspectors;
CREATE TRIGGER trg_inspectors_updated BEFORE UPDATE ON public.inspectors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Vistorias (entrada/saida).
CREATE TABLE IF NOT EXISTS public.property_inspections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id           text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  property_id       text REFERENCES public.properties(id) ON DELETE SET NULL,
  lease_contract_id uuid,  -- FK adicionada na J-2b-3 (contrato)
  inspection_type   text NOT NULL DEFAULT 'entrada',
  status            text NOT NULL DEFAULT 'pendente',
  inspector_id      uuid REFERENCES public.inspectors(id) ON DELETE SET NULL,
  scheduled_at      timestamptz,
  completed_at      timestamptz,
  report_url        text,
  general_notes     text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.property_inspections DROP CONSTRAINT IF EXISTS pinsp_type_chk;
ALTER TABLE public.property_inspections ADD CONSTRAINT pinsp_type_chk
  CHECK (inspection_type = ANY (ARRAY['entrada','saida']));
ALTER TABLE public.property_inspections DROP CONSTRAINT IF EXISTS pinsp_status_chk;
ALTER TABLE public.property_inspections ADD CONSTRAINT pinsp_status_chk
  CHECK (status = ANY (ARRAY['pendente','agendada','em_andamento','concluida','cancelada']));
-- idempotencia: 1 vistoria aberta por deal+tipo.
CREATE UNIQUE INDEX IF NOT EXISTS pinsp_one_open_per_deal_type
  ON public.property_inspections (deal_id, inspection_type)
  WHERE status = ANY (ARRAY['pendente','agendada','em_andamento']);
CREATE INDEX IF NOT EXISTS idx_pinsp_deal      ON public.property_inspections (deal_id);
CREATE INDEX IF NOT EXISTS idx_pinsp_org_status ON public.property_inspections (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pinsp_inspector ON public.property_inspections (inspector_id, status);
DROP TRIGGER IF EXISTS trg_pinsp_updated ON public.property_inspections;
CREATE TRIGGER trg_pinsp_updated BEFORE UPDATE ON public.property_inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Itens do checklist (por comodo).
CREATE TABLE IF NOT EXISTS public.property_inspection_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inspection_id   uuid NOT NULL REFERENCES public.property_inspections(id) ON DELETE CASCADE,
  room            text,
  item            text NOT NULL,
  condition       text,
  notes           text,
  photo_urls      jsonb NOT NULL DEFAULT '[]'::jsonb,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pinsp_items_inspection ON public.property_inspection_items (inspection_id);

-- 4) RLS (espelho J-2a: admin ve tudo; vistoriador atribuido ve as suas).
ALTER TABLE public.inspectors                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_inspections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_inspection_items  ENABLE ROW LEVEL SECURITY;

-- inspectors: leitura membros; escrita admin.
DROP POLICY IF EXISTS omni_inspectors_select ON public.inspectors;
CREATE POLICY omni_inspectors_select ON public.inspectors FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS omni_inspectors_write ON public.inspectors;
CREATE POLICY omni_inspectors_write ON public.inspectors FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- property_inspections: admin OU vistoriador (via inspectors.user_id) atribuido.
DROP POLICY IF EXISTS omni_pinsp_select ON public.property_inspections;
CREATE POLICY omni_pinsp_select ON public.property_inspections FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.inspectors i WHERE i.id = inspector_id AND i.user_id = auth.uid())));
DROP POLICY IF EXISTS omni_pinsp_update ON public.property_inspections;
CREATE POLICY omni_pinsp_update ON public.property_inspections FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.inspectors i WHERE i.id = inspector_id AND i.user_id = auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.inspectors i WHERE i.id = inspector_id AND i.user_id = auth.uid())));
DROP POLICY IF EXISTS omni_pinsp_insert ON public.property_inspections;
CREATE POLICY omni_pinsp_insert ON public.property_inspections FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_org_admin());
DROP POLICY IF EXISTS omni_pinsp_delete ON public.property_inspections;
CREATE POLICY omni_pinsp_delete ON public.property_inspections FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_org_admin());

-- items: idem via EXISTS na vistoria.
DROP POLICY IF EXISTS omni_pinsp_items_select ON public.property_inspection_items;
CREATE POLICY omni_pinsp_items_select ON public.property_inspection_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.property_inspections p JOIN public.inspectors i ON i.id = p.inspector_id
                         WHERE p.id = inspection_id AND i.user_id = auth.uid())));
DROP POLICY IF EXISTS omni_pinsp_items_write ON public.property_inspection_items;
CREATE POLICY omni_pinsp_items_write ON public.property_inspection_items FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.property_inspections p JOIN public.inspectors i ON i.id = p.inspector_id
                         WHERE p.id = inspection_id AND i.user_id = auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())
              OR EXISTS (SELECT 1 FROM public.property_inspections p JOIN public.inspectors i ON i.id = p.inspector_id
                         WHERE p.id = inspection_id AND i.user_id = auth.uid())));

-- 5) Config (decisao 3): DEFAULT so fila habilitada; superadmin liga roleta.
--    + escala de condicao customizavel (decisao 2). Em organizations.metadata.
UPDATE public.organizations
   SET metadata = jsonb_set(
         jsonb_set(COALESCE(metadata,'{}'::jsonb),
           '{inspection_assignment}',
           COALESCE(metadata->'inspection_assignment',
             jsonb_build_object('roleta_enabled', false, 'fila_enabled', true)), true),
         '{inspection_condition_scale}',
         COALESCE(metadata->'inspection_condition_scale',
           jsonb_build_array('otimo','bom','regular','ruim','danificado')), true)
 WHERE id = '11111111-1111-1111-1111-111111111111';

-- 6) Roleta de vistoriador (so usada se roleta_enabled). Espelho da do corretor.
CREATE OR REPLACE FUNCTION public.assign_inspector_internal(p_org uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inspector_id uuid;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'org_obrigatoria'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_assign_inspector_' || p_org::text));
  SELECT i.id INTO v_inspector_id
  FROM public.inspectors i
  LEFT JOIN (
    SELECT pi.inspector_id AS iid, count(*) AS n
    FROM public.property_inspections pi
    WHERE pi.organization_id = p_org AND pi.status IN ('pendente','agendada','em_andamento')
    GROUP BY pi.inspector_id
  ) c ON c.iid = i.id
  WHERE i.organization_id = p_org AND i.is_active AND i.distribution_pct > 0
  ORDER BY (i.distribution_pct::numeric / (1 + COALESCE(c.n,0))) DESC, i.position ASC, i.id ASC
  LIMIT 1;
  RETURN v_inspector_id;  -- pode ser NULL
END;
$function$;
GRANT EXECUTE ON FUNCTION public.assign_inspector_internal(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.assign_inspector_internal(uuid) FROM PUBLIC, anon, authenticated;

-- 7) Cria a vistoria (suporta os 2 modos). Se roleta_enabled e ha vistoriador
--    com pct, sorteia; senao nasce na FILA (inspector_id NULL). Idempotente.
CREATE OR REPLACE FUNCTION public.assign_inspection_internal(
  p_deal_id text, p_org uuid, p_type text DEFAULT 'entrada', p_reason text DEFAULT NULL)
  RETURNS TABLE(inspection_id uuid, inspector_id uuid, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_existing uuid; v_insp uuid; v_roleta boolean; v_prop text;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'org_obrigatoria'; END IF;
  IF p_type NOT IN ('entrada','saida') THEN RAISE EXCEPTION 'tipo_invalido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_inspection_' || p_deal_id || '_' || p_type));
  SELECT pi.id INTO v_existing FROM public.property_inspections pi
  WHERE pi.deal_id = p_deal_id AND pi.inspection_type = p_type
    AND pi.status IN ('pendente','agendada','em_andamento') LIMIT 1;
  IF FOUND THEN
    SELECT pi.inspector_id INTO v_insp FROM public.property_inspections pi WHERE pi.id = v_existing;
    inspection_id := v_existing; inspector_id := v_insp; created := false; RETURN NEXT; RETURN;
  END IF;
  -- modo roleta so se habilitado em config
  SELECT COALESCE((o.metadata->'inspection_assignment'->>'roleta_enabled')::boolean, false)
    INTO v_roleta FROM public.organizations o WHERE o.id = p_org;
  IF v_roleta THEN
    v_insp := public.assign_inspector_internal(p_org);
  ELSE
    v_insp := NULL;  -- fila do administrativo
  END IF;
  SELECT d.property_code INTO v_prop FROM public.deals d WHERE d.id = p_deal_id;
  BEGIN
    INSERT INTO public.property_inspections
      (organization_id, deal_id, property_id, inspection_type, status, inspector_id, metadata)
    VALUES (p_org, p_deal_id, NULL, p_type, 'pendente', v_insp,
            jsonb_build_object('assign_reason', COALESCE(p_reason, 'entrada na etapa de vistoria')))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT pi.id, pi.inspector_id INTO v_existing, v_insp FROM public.property_inspections pi
    WHERE pi.deal_id = p_deal_id AND pi.inspection_type = p_type
      AND pi.status IN ('pendente','agendada','em_andamento') LIMIT 1;
    inspection_id := v_existing; inspector_id := v_insp; created := false; RETURN NEXT; RETURN;
  END;
  INSERT INTO public.internal_notifications (organization_id, kind, deal_id, payload, status)
  VALUES (p_org, 'new_inspection', p_deal_id, jsonb_build_object('inspection_id', v_id, 'type', p_type), 'pending');
  inspection_id := v_id; inspector_id := v_insp; created := true; RETURN NEXT;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.assign_inspection_internal(text,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.assign_inspection_internal(text,uuid,text,text) FROM PUBLIC, anon, authenticated;

-- 8) Atribuicao manual (administrativo "pega"/atribui). Respeita fila_enabled.
CREATE OR REPLACE FUNCTION public.assign_inspector_to_inspection(
  p_inspection_id uuid, p_inspector_id uuid DEFAULT NULL)
  RETURNS TABLE(inspection_id uuid, inspector_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record; v_target uuid; v_fila boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  SELECT COALESCE((o.metadata->'inspection_assignment'->>'fila_enabled')::boolean, true)
    INTO v_fila FROM public.organizations o WHERE o.id = v_org;
  IF NOT v_fila THEN RAISE EXCEPTION 'fila_desabilitada'; END IF;
  SELECT pi.id, pi.organization_id INTO v_locked FROM public.property_inspections pi
  WHERE pi.id = p_inspection_id AND pi.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vistoria_nao_encontrada'; END IF;
  -- p_inspector_id NULL = o proprio usuario "pega" (se ele for um inspector)
  v_target := COALESCE(p_inspector_id,
    (SELECT i.id FROM public.inspectors i WHERE i.user_id = auth.uid() AND i.organization_id = v_org LIMIT 1));
  IF v_target IS NULL THEN RAISE EXCEPTION 'vistoriador_nao_informado'; END IF;
  UPDATE public.property_inspections SET inspector_id = v_target, updated_at = now()
  WHERE id = p_inspection_id;
  inspection_id := p_inspection_id; inspector_id := v_target; RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.assign_inspector_to_inspection(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_inspector_to_inspection(uuid,uuid) TO authenticated, service_role;

-- 9) Lifecycle: agendar / iniciar / concluir.
CREATE OR REPLACE FUNCTION public.update_inspection_status(
  p_inspection_id uuid, p_status text, p_scheduled_at timestamptz DEFAULT NULL,
  p_report_url text DEFAULT NULL, p_general_notes text DEFAULT NULL)
  RETURNS TABLE(inspection_id uuid, status text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record; v_allowed boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF p_status NOT IN ('pendente','agendada','em_andamento','concluida','cancelada') THEN
    RAISE EXCEPTION 'status_invalido';
  END IF;
  SELECT pi.id, pi.inspector_id INTO v_locked FROM public.property_inspections pi
  WHERE pi.id = p_inspection_id AND pi.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vistoria_nao_encontrada'; END IF;
  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.inspectors i WHERE i.id = v_locked.inspector_id AND i.user_id = auth.uid());
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  UPDATE public.property_inspections
     SET status = p_status,
         scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
         report_url = COALESCE(p_report_url, report_url),
         general_notes = COALESCE(p_general_notes, general_notes),
         completed_at = CASE WHEN p_status = 'concluida' THEN now() ELSE completed_at END,
         updated_at = now()
   WHERE id = p_inspection_id;
  inspection_id := p_inspection_id; status := p_status; RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_inspection_status(uuid,text,timestamptz,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inspection_status(uuid,text,timestamptz,text,text) TO authenticated, service_role;

-- 10) Gatilho: deal entra na etapa papel 'vistoria_entrada' -> cria vistoria de
--      ENTRADA automatica (decisao c=a). Saida e sempre manual (decisao 1).
CREATE OR REPLACE FUNCTION public.tg_create_inspection_on_stage()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;
  v_role := public.role_for_stage(NEW.funnel_id, NEW.stage_id, NEW.organization_id);
  IF v_role = 'vistoria_entrada' THEN
    PERFORM public.assign_inspection_internal(NEW.id, NEW.organization_id, 'entrada', 'entrada na etapa de vistoria');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_create_inspection_on_stage ON public.deals;
CREATE TRIGGER trg_create_inspection_on_stage
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_inspection_on_stage();

COMMIT;
