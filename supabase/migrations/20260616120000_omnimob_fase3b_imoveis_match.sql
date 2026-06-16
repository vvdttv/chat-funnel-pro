-- ============================================================
-- OMNIMOB — Fase 3B: Banco de imóveis (properties) + match engine 100/80/0
--   + devolutiva estendida (valor aprovado, exige entrada, campos custom,
--     extração IA) + form-builder de campos da devolutiva
-- ============================================================
-- Cria:
--   - organizations.metadata (guarda max_projection_pct = % projeção avaliação)
--   - tabela properties (cadastro manual admin; preço + avaliação projetada)
--   - colunas novas em credit_analyses (approved_financing_amount,
--     requires_entry, custom_fields_response, extracted_data)
--   - tabela devolutiva_field_defs (form-builder por org) + seed MCMV
--   - RPC match_properties_internal (régua A: 100/80/sem-match)
--   - estende generate_broker_briefing_internal (pluga o match no briefing)
--   - estende submit_credit_devolutiva (grava valor aprovado + custom)
--   - RLS org-scoped + role-scoped
--
-- Régua A (decisão Vinícius): VA=valor aprovado, P=preço, AP=avaliação projetada.
--   100% (sem entrada): VA >= P  E  AP >= P
--   80%  (com entrada): VA <  P  E  AP >= VA   (entrada = P - VA)
--   sem match:          nenhum imóvel atende  -> captação
-- AP = COALESCE(appraisal_value, price * (1 + pct/100)).
--
-- Org de produção MCMV: 11111111-1111-1111-1111-111111111111
-- Aplicar via psql no container supabase-db. Idempotente.
-- Auth real (produção): current_org_id() lê claim JWT org_id; gate admin =
--   (is_org_admin() OR is_superadmin(auth.uid())).
-- ============================================================

-- ============================================================
-- 1) ORG SETTINGS — % de projeção de avaliação
-- ============================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- 2) TABELA — banco de imóveis (cadastro manual admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.properties (
  id text PRIMARY KEY DEFAULT ('prop-' || replace(gen_random_uuid()::text, '-', '')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL DEFAULT '',
  segment text NOT NULL DEFAULT 'mcmv',
  operation text NOT NULL DEFAULT 'venda',
  price numeric NOT NULL,
  -- Avaliação projetada: editável pelo captador; default no app = price*(1+pct).
  -- No banco pode vir NULL e o match resolve com a % da org.
  appraisal_value numeric,
  city text,
  neighborhood text,
  bedrooms integer,
  parking_spaces integer,
  status text NOT NULL DEFAULT 'disponivel',
  photo_url text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT properties_price_chk CHECK (price >= 0),
  CONSTRAINT properties_appraisal_chk CHECK (appraisal_value IS NULL OR appraisal_value >= 0),
  CONSTRAINT properties_status_chk CHECK (status IN ('disponivel','reservado','vendido','inativo'))
);
CREATE INDEX IF NOT EXISTS idx_properties_org_status
  ON public.properties (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_properties_price
  ON public.properties (organization_id, price);
-- Código único por org (idempotência de cadastro).
CREATE UNIQUE INDEX IF NOT EXISTS properties_code_uniq
  ON public.properties (organization_id, code);

DROP TRIGGER IF EXISTS trg_properties_updated ON public.properties;
CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) CREDIT_ANALYSES — colunas novas para o match e extração IA
-- ============================================================
ALTER TABLE public.credit_analyses
  ADD COLUMN IF NOT EXISTS approved_financing_amount numeric,
  ADD COLUMN IF NOT EXISTS requires_entry boolean,
  ADD COLUMN IF NOT EXISTS custom_fields_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_analyses_approved_amount_chk'
  ) THEN
    ALTER TABLE public.credit_analyses
      ADD CONSTRAINT credit_analyses_approved_amount_chk
      CHECK (approved_financing_amount IS NULL OR approved_financing_amount >= 0);
  END IF;
END $$;

-- credit_analysis_documents: permitir origem 'correspondent_upload'.
DO $$ BEGIN
  ALTER TABLE public.credit_analysis_documents DROP CONSTRAINT IF EXISTS cad_source_chk;
  ALTER TABLE public.credit_analysis_documents
    ADD CONSTRAINT cad_source_chk
    CHECK (source IN ('lead_whatsapp','manual_upload','correspondent_upload'));
END $$;

-- ============================================================
-- 4) FORM-BUILDER — campos extras da devolutiva (por org)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.devolutiva_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,   -- para single_select / multi_select
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,    -- semeado pelo sistema (MCMV)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devo_field_type_chk CHECK (field_type IN ('text','single_select','multi_select'))
);
CREATE INDEX IF NOT EXISTS idx_devo_field_defs_org
  ON public.devolutiva_field_defs (organization_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS devo_field_defs_key_uniq
  ON public.devolutiva_field_defs (organization_id, field_key);

DROP TRIGGER IF EXISTS trg_devo_field_defs_updated ON public.devolutiva_field_defs;
CREATE TRIGGER trg_devo_field_defs_updated BEFORE UPDATE ON public.devolutiva_field_defs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dos campos padrão MCMV (admin pode editar/excluir depois).
-- is_default=true só marca origem; não impede exclusão.
-- M4: só insere se a org de produção existe (portável p/ staging/dev).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = '11111111-1111-1111-1111-111111111111') THEN
    INSERT INTO public.devolutiva_field_defs
      (organization_id, field_key, label, field_type, options, position, is_default)
    VALUES
      ('11111111-1111-1111-1111-111111111111','banco','Banco/Instituição','text','[]'::jsonb,1,true),
      ('11111111-1111-1111-1111-111111111111','modalidade','Modalidade','single_select',
         '["SBPE","FGTS","Pró-cotista","MCMV Faixa 1","MCMV Faixa 2","MCMV Faixa 3"]'::jsonb,2,true),
      ('11111111-1111-1111-1111-111111111111','taxa_juros','Taxa de juros (% a.a.)','text','[]'::jsonb,3,true),
      ('11111111-1111-1111-1111-111111111111','prazo_meses','Prazo (meses)','text','[]'::jsonb,4,true),
      ('11111111-1111-1111-1111-111111111111','subsidio','Subsídio','single_select',
         '["Sem subsídio","Com subsídio parcial","Com subsídio total"]'::jsonb,5,true),
      ('11111111-1111-1111-1111-111111111111','pendencias','Pendências','multi_select',
         '["Documentação","Comprovante de renda","Restrição cadastral","Avaliação do imóvel","Conta no banco","Nenhuma"]'::jsonb,6,true)
    ON CONFLICT (organization_id, field_key) DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- 5) RLS
-- ============================================================
ALTER TABLE public.properties            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devolutiva_field_defs ENABLE ROW LEVEL SECURITY;

-- 5.1 properties: membros leem; admin escreve
DROP POLICY IF EXISTS "Membros veem imoveis"    ON public.properties;
DROP POLICY IF EXISTS "Admins criam imoveis"    ON public.properties;
DROP POLICY IF EXISTS "Admins atualizam imoveis" ON public.properties;
DROP POLICY IF EXISTS "Admins excluem imoveis"  ON public.properties;
CREATE POLICY "Membros veem imoveis"
  ON public.properties FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam imoveis"
  ON public.properties FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins atualizam imoveis"
  ON public.properties FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins excluem imoveis"
  ON public.properties FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 5.2 devolutiva_field_defs: membros leem (correspondente precisa renderizar); admin escreve
DROP POLICY IF EXISTS "Membros veem campos devo"    ON public.devolutiva_field_defs;
DROP POLICY IF EXISTS "Admins criam campos devo"    ON public.devolutiva_field_defs;
DROP POLICY IF EXISTS "Admins atualizam campos devo" ON public.devolutiva_field_defs;
DROP POLICY IF EXISTS "Admins excluem campos devo"  ON public.devolutiva_field_defs;
CREATE POLICY "Membros veem campos devo"
  ON public.devolutiva_field_defs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam campos devo"
  ON public.devolutiva_field_defs FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins atualizam campos devo"
  ON public.devolutiva_field_defs FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins excluem campos devo"
  ON public.devolutiva_field_defs FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- ============================================================
-- 6) RPC — match engine (régua A). M2M (service_role) + uso interno.
-- ============================================================
-- Retorna jsonb com tiers 100/80, flag has_match e o valor aprovado usado.
-- p_pct: % de projeção de avaliação da org (0–100). AP do imóvel =
--   COALESCE(appraisal_value, price*(1+p_pct/100)).
CREATE OR REPLACE FUNCTION public.match_properties_internal(
  p_org uuid,
  p_approved_amount numeric,
  p_pct integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pct numeric := COALESCE(p_pct, 0);
  v_tier100 jsonb;
  v_tier80 jsonb;
BEGIN
  -- C2: defesa multi-tenant. service_role chama com p_org confiável (do deal);
  -- se algum dia authenticated chamar, p_org tem que bater com a org do JWT.
  IF auth.uid() IS NOT NULL AND p_org <> public.current_org_id() THEN
    RAISE EXCEPTION 'org_mismatch';
  END IF;

  IF p_approved_amount IS NULL OR p_approved_amount <= 0 THEN
    RETURN jsonb_build_object(
      'has_match', false,
      'approved_amount', p_approved_amount,
      'pending_value', true,
      'tier_100', '[]'::jsonb,
      'tier_80', '[]'::jsonb
    );
  END IF;

  -- tier 100: VA >= P E AP >= P  (banco cobre, sem entrada)
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_tier100
  FROM (
    SELECT jsonb_build_object(
             'id', p.id, 'code', p.code, 'title', p.title,
             'price', p.price,
             'appraisal_value', round(COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)), 2),
             'city', p.city, 'neighborhood', p.neighborhood
           ) AS t
    FROM public.properties p
    WHERE p.organization_id = p_org
      AND p.is_active
      AND p.status = 'disponivel'
      AND p_approved_amount >= p.price
      AND COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)) >= p.price
    ORDER BY p.price
    LIMIT 10
  ) s;

  -- tier 80: lead paga entrada. Cobre 2 casos (H4):
  --   (a) VA < P E AP >= VA       -> entrada = P - VA (avaliação cobre o aprovado)
  --   (b) VA >= P E AP < P        -> banco aprovou o preço mas avaliação ficou
  --       abaixo: viável COM RESSALVA (flag avaliacao_baixa); entrada = P - AP.
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_tier80
  FROM (
    SELECT jsonb_build_object(
             'id', p.id, 'code', p.code, 'title', p.title,
             'price', p.price,
             'appraisal_value', round(COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)), 2),
             'entrada', CASE
                          WHEN p_approved_amount < p.price
                            THEN round(p.price - p_approved_amount, 2)
                          ELSE round(p.price - COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)), 2)
                        END,
             'avaliacao_baixa', (COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)) < p.price),
             'city', p.city, 'neighborhood', p.neighborhood
           ) AS t
    FROM public.properties p
    WHERE p.organization_id = p_org
      AND p.is_active
      AND p.status = 'disponivel'
      -- exclui o que já é tier_100 (VA>=P E AP>=P)
      AND NOT (p_approved_amount >= p.price
               AND COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)) >= p.price)
      AND (
        -- (a) avaliação cobre o aprovado e preço acima do aprovado
        (p_approved_amount < p.price
         AND COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)) >= p_approved_amount)
        OR
        -- (b) banco cobre o preço mas avaliação abaixo do preço (ressalva)
        (p_approved_amount >= p.price
         AND COALESCE(p.appraisal_value, p.price * (1 + v_pct/100.0)) < p.price)
      )
    ORDER BY p.price
    LIMIT 10
  ) s;

  RETURN jsonb_build_object(
    'has_match', (jsonb_array_length(v_tier100) + jsonb_array_length(v_tier80)) > 0,
    'approved_amount', p_approved_amount,
    'projection_pct', v_pct,
    'captacao', (jsonb_array_length(v_tier100) + jsonb_array_length(v_tier80)) = 0,
    'tier_100', v_tier100,
    'tier_80', v_tier80
  );
END;
$$;
REVOKE ALL ON FUNCTION public.match_properties_internal(uuid, numeric, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_properties_internal(uuid, numeric, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_properties_internal(uuid, numeric, integer) TO service_role;

-- ============================================================
-- 7) ESTENDE generate_broker_briefing_internal — pluga o match no briefing
-- ============================================================
-- Substitui o placeholder property_match='a_definir_fase3b' pelo resultado do
-- match_properties_internal, usando o valor aprovado da análise de crédito mais
-- recente devolvida (approved/approved_conditioned) do deal-IA + a % da org.
CREATE OR REPLACE FUNCTION public.generate_broker_briefing_internal(
  p_ia_deal_id text,
  p_broker_deal_id text,
  p_broker_id uuid,
  p_appointment_id uuid,
  p_reason text DEFAULT 'agendamento'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_deal record;
  v_appt record;
  v_fields jsonb;
  v_briefing_id uuid;
  v_approved numeric;
  v_pct integer;
  v_match jsonb;
BEGIN
  SELECT d.organization_id, d.lead_name, d.lead_id, d.value, d.property, d.property_code,
         d.funnel_id, d.stage_id, d.last_activity_summary
    INTO v_deal
  FROM public.deals d
  WHERE d.id = p_ia_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_ia_nao_encontrado'; END IF;
  v_org := v_deal.organization_id;

  -- M3: consistência referencial — broker_deal_id (se informado) tem que ser da
  -- mesma org do deal-IA.
  IF p_broker_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals d2
    WHERE d2.id = p_broker_deal_id AND d2.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'broker_deal_org_mismatch';
  END IF;

  SELECT a.scheduled_at, a.channel, a.location, a.kind, a.attempts
    INTO v_appt
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  -- Valor aprovado: análise de crédito mais recente devolvida e aprovada deste deal.
  SELECT ca.approved_financing_amount
    INTO v_approved
  FROM public.credit_analyses ca
  WHERE ca.deal_id = p_ia_deal_id
    AND ca.organization_id = v_org
    AND ca.status = 'returned'
    AND ca.result IN ('approved','approved_conditioned')
  ORDER BY ca.returned_at DESC NULLS LAST
  LIMIT 1;

  -- % de projeção de avaliação da org (default 0 se ausente). Lê como numeric
  -- e arredonda (M1: evita erro de cast e trunca decimal de forma controlada).
  SELECT COALESCE(round((o.metadata ->> 'max_projection_pct')::numeric)::integer, 0)
    INTO v_pct
  FROM public.organizations o
  WHERE o.id = v_org;

  -- Roda o match (régua A). Se valor aprovado nulo, retorna pending_value=true.
  v_match := public.match_properties_internal(v_org, v_approved, COALESCE(v_pct, 0));

  v_fields := jsonb_build_object(
    'lead_name', COALESCE(v_deal.lead_name, ''),
    'lead_phone', (
      SELECT lc.phone_e164 FROM public.lead_channels lc
      WHERE lc.deal_id = p_ia_deal_id AND lc.is_active
      ORDER BY lc.created_at LIMIT 1
    ),
    'value', v_deal.value,
    'property', v_deal.property,
    'property_code', v_deal.property_code,
    'summary', COALESCE(v_deal.last_activity_summary, ''),
    'reason', p_reason,
    'appointment', CASE WHEN v_appt IS NOT NULL THEN jsonb_build_object(
        'scheduled_at', v_appt.scheduled_at,
        'channel', v_appt.channel,
        'location', v_appt.location,
        'kind', v_appt.kind,
        'attempts', v_appt.attempts
      ) ELSE NULL END,
    -- Fase 3B: resultado real do match de imóveis (régua A).
    'property_match', v_match,
    'history_link', '/?deal=' || p_ia_deal_id
  );

  INSERT INTO public.broker_briefings
    (organization_id, ia_deal_id, broker_deal_id, broker_id, appointment_id, reason, fields, channels_sent)
  VALUES
    (v_org, p_ia_deal_id, p_broker_deal_id, p_broker_id, p_appointment_id, p_reason, v_fields, '[]'::jsonb)
  RETURNING id INTO v_briefing_id;

  INSERT INTO public.internal_notifications
    (organization_id, kind, deal_id, attendant_id, payload, status)
  VALUES
    (v_org, 'broker_briefing', p_ia_deal_id, NULL,
     jsonb_build_object('briefing_id', v_briefing_id, 'broker_id', p_broker_id), 'pending');

  RETURN v_briefing_id;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_broker_briefing_internal(text, text, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_broker_briefing_internal(text, text, uuid, uuid, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.generate_broker_briefing_internal(text, text, uuid, uuid, text) TO service_role;

-- ============================================================
-- 8) ESTENDE submit_credit_devolutiva — grava valor aprovado + custom fields
-- ============================================================
-- C1: a versão original tem 5 params; a nova tem 8. CREATE OR REPLACE com
-- assinatura diferente criaria uma SOBRECARGA (a antiga sobreviveria com seus
-- grants). DROP da assinatura antiga antes de recriar.
DROP FUNCTION IF EXISTS public.submit_credit_devolutiva(uuid, text, text, text, integer);
-- Nova assinatura (params novos com DEFAULT preservam compatibilidade de chamada).
CREATE OR REPLACE FUNCTION public.submit_credit_devolutiva(
  p_analysis_id uuid,
  p_result text,
  p_conditions text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_retomada_prazo_dias integer DEFAULT NULL,
  p_approved_financing_amount numeric DEFAULT NULL,
  p_requires_entry boolean DEFAULT NULL,
  p_custom_fields_response jsonb DEFAULT NULL
) RETURNS TABLE (
  analysis_id uuid,
  status text,
  result text,
  deal_id text,
  new_stage_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  v_target_stage := CASE WHEN p_result = 'rejected' THEN 'ia-reprovado'
                         ELSE 'ia-aprovado-aguardando' END;

  PERFORM public.move_deal_stage_internal(
    v_locked.deal_id, v_target_stage,
    'devolutiva do correspondente: ' || p_result, NULL);

  analysis_id := p_analysis_id;
  status := 'returned';
  result := p_result;
  deal_id := v_locked.deal_id;
  new_stage_id := v_target_stage;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_credit_devolutiva(uuid, text, text, text, integer, numeric, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_credit_devolutiva(uuid, text, text, text, integer, numeric, boolean, jsonb) TO authenticated;

-- ============================================================
-- 9) RPC — gravar extração IA (chamada pela edge extract-devolutiva-attachment)
-- ============================================================
-- M2M (service_role): grava o que a IA extraiu do anexo em extracted_data.
-- NÃO submete a devolutiva (o correspondente confirma/edita e submete depois).
CREATE OR REPLACE FUNCTION public.save_devolutiva_extraction_internal(
  p_analysis_id uuid,
  p_org uuid,
  p_extracted jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.credit_analyses
     SET extracted_data = COALESCE(p_extracted, '{}'::jsonb),
         updated_at = now()
   WHERE id = p_analysis_id
     AND organization_id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_devolutiva_extraction_internal(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_devolutiva_extraction_internal(uuid, uuid, jsonb) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.save_devolutiva_extraction_internal(uuid, uuid, jsonb) TO service_role;
