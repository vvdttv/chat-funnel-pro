-- =====================================================================
-- OmniMob — Fase J-2b-3: Contrato de Locacao + campos customizaveis
-- Decisoes do cliente:
--   (A) tabela nova lease_contracts (nao reusar metadata).
--   (3) PRE-REQUISITO: criar contrato EXIGE guarantee_analyses com
--       result IN (approved, approved_conditioned) para o deal.
--   (H) campos do contrato CUSTOMIZAVEIS: tabela lease_contract_field_defs
--       espelha devolutiva_field_defs + coluna section (4 secoes).
--   (manual) NAO criar contrato automatico ao entrar em corloc-contrato;
--       front mostra aviso "aguardando contrato" + botao "Criar contrato".
--       Sem trigger nesta fase (apenas RPC manual).
-- ATOMICA (BEGIN/COMMIT) + idempotente + nao-destrutiva.
-- =====================================================================
BEGIN;

-- 1) Tabela lease_contracts (contrato de locacao)
CREATE TABLE IF NOT EXISTS public.lease_contracts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id                text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  property_id            text REFERENCES public.properties(id) ON DELETE SET NULL,
  guarantee_analysis_id  uuid REFERENCES public.guarantee_analyses(id) ON DELETE SET NULL,
  locador_nome           text,
  locador_doc            text,
  locatario_nome         text,
  locatario_doc          text,
  rent_value             numeric,
  condo_fee              numeric,
  iptu                   numeric,
  dia_vencimento         integer,
  start_date             date,
  end_date               date,
  duration_months        integer,
  readjustment_index     text,
  readjustment_period_months integer,
  multa_rescisoria_meses integer,
  caucao_meses           integer,
  status                 text NOT NULL DEFAULT 'rascunho',
  signed_at              timestamptz,
  activated_at           timestamptz,
  terminated_at          timestamptz,
  document_url           text,
  custom_fields_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lease_contracts DROP CONSTRAINT IF EXISTS lease_contracts_status_chk;
ALTER TABLE public.lease_contracts ADD CONSTRAINT lease_contracts_status_chk
  CHECK (status = ANY (ARRAY['rascunho','enviado','assinado','ativo','encerrado','cancelado']));

ALTER TABLE public.lease_contracts DROP CONSTRAINT IF EXISTS lease_contracts_readj_idx_chk;
ALTER TABLE public.lease_contracts ADD CONSTRAINT lease_contracts_readj_idx_chk
  CHECK (readjustment_index IS NULL OR readjustment_index = ANY (ARRAY['IGPM','IPCA','INCC','outro']));

ALTER TABLE public.lease_contracts DROP CONSTRAINT IF EXISTS lease_contracts_dia_venc_chk;
ALTER TABLE public.lease_contracts ADD CONSTRAINT lease_contracts_dia_venc_chk
  CHECK (dia_vencimento IS NULL OR (dia_vencimento BETWEEN 1 AND 31));

ALTER TABLE public.lease_contracts DROP CONSTRAINT IF EXISTS lease_contracts_valores_chk;
ALTER TABLE public.lease_contracts ADD CONSTRAINT lease_contracts_valores_chk
  CHECK ((rent_value IS NULL OR rent_value >= 0)
     AND (condo_fee  IS NULL OR condo_fee  >= 0)
     AND (iptu       IS NULL OR iptu       >= 0));

CREATE UNIQUE INDEX IF NOT EXISTS lease_contracts_one_open_per_deal
  ON public.lease_contracts (deal_id)
  WHERE status = ANY (ARRAY['rascunho','enviado','assinado','ativo']);
CREATE INDEX IF NOT EXISTS idx_lease_contracts_deal       ON public.lease_contracts (deal_id);
CREATE INDEX IF NOT EXISTS idx_lease_contracts_org_status ON public.lease_contracts (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_lease_contracts_guarantee  ON public.lease_contracts (guarantee_analysis_id);
CREATE INDEX IF NOT EXISTS idx_lease_contracts_property   ON public.lease_contracts (property_id);

DROP TRIGGER IF EXISTS trg_lease_contracts_updated ON public.lease_contracts;
CREATE TRIGGER trg_lease_contracts_updated BEFORE UPDATE ON public.lease_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) FK property_inspections.lease_contract_id -> lease_contracts(id)
ALTER TABLE public.property_inspections
  DROP CONSTRAINT IF EXISTS property_inspections_lease_contract_id_fkey;
ALTER TABLE public.property_inspections
  ADD CONSTRAINT property_inspections_lease_contract_id_fkey
  FOREIGN KEY (lease_contract_id) REFERENCES public.lease_contracts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pinsp_lease_contract ON public.property_inspections (lease_contract_id);

-- 3) Tabela lease_contract_field_defs (espelha devolutiva_field_defs + section)
CREATE TABLE IF NOT EXISTS public.lease_contract_field_defs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section         text NOT NULL,
  field_key       text NOT NULL,
  label           text NOT NULL,
  field_type      text NOT NULL DEFAULT 'text',
  options         jsonb NOT NULL DEFAULT '[]'::jsonb,
  position        integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lease_contract_field_defs DROP CONSTRAINT IF EXISTS lcfd_section_chk;
ALTER TABLE public.lease_contract_field_defs ADD CONSTRAINT lcfd_section_chk
  CHECK (section = ANY (ARRAY['dados_cliente','dados_imobiliaria','endereco_imovel','garantia']));

ALTER TABLE public.lease_contract_field_defs DROP CONSTRAINT IF EXISTS lcfd_field_type_chk;
ALTER TABLE public.lease_contract_field_defs ADD CONSTRAINT lcfd_field_type_chk
  CHECK (field_type = ANY (ARRAY['text','single_select','multi_select']));

CREATE UNIQUE INDEX IF NOT EXISTS lcfd_key_uniq
  ON public.lease_contract_field_defs (organization_id, field_key);
CREATE INDEX IF NOT EXISTS idx_lcfd_org_section
  ON public.lease_contract_field_defs (organization_id, section, position);

DROP TRIGGER IF EXISTS trg_lcfd_updated ON public.lease_contract_field_defs;
CREATE TRIGGER trg_lcfd_updated BEFORE UPDATE ON public.lease_contract_field_defs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) RLS (espelha J-2a/J-2b-2)
ALTER TABLE public.lease_contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_contract_field_defs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omni_lc_select ON public.lease_contracts;
CREATE POLICY omni_lc_select ON public.lease_contracts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS omni_lc_insert ON public.lease_contracts;
CREATE POLICY omni_lc_insert ON public.lease_contracts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id()
              AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

DROP POLICY IF EXISTS omni_lc_update ON public.lease_contracts;
CREATE POLICY omni_lc_update ON public.lease_contracts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
              AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

DROP POLICY IF EXISTS omni_lc_delete ON public.lease_contracts;
CREATE POLICY omni_lc_delete ON public.lease_contracts FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

DROP POLICY IF EXISTS omni_lcfd_select ON public.lease_contract_field_defs;
CREATE POLICY omni_lcfd_select ON public.lease_contract_field_defs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS omni_lcfd_write ON public.lease_contract_field_defs;
CREATE POLICY omni_lcfd_write ON public.lease_contract_field_defs FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
              AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 5) RPC: create_lease_contract (manual; valida pre-requisito da garantia)
CREATE OR REPLACE FUNCTION public.create_lease_contract(
  p_deal_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb)
  RETURNS TABLE(out_contract_id uuid, out_created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_existing uuid;
  v_guarantee_id uuid;
  v_property text;
  v_new_id uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_lease_' || p_deal_id));

  SELECT lc.id INTO v_existing FROM public.lease_contracts lc
   WHERE lc.deal_id = p_deal_id
     AND lc.status = ANY (ARRAY['rascunho','enviado','assinado','ativo'])
   LIMIT 1;
  IF FOUND THEN
    out_contract_id := v_existing; out_created := false; RETURN NEXT; RETURN;
  END IF;

  SELECT ga.id INTO v_guarantee_id FROM public.guarantee_analyses ga
   WHERE ga.deal_id = p_deal_id
     AND ga.organization_id = v_org
     AND ga.result = ANY (ARRAY['approved','approved_conditioned'])
   ORDER BY ga.returned_at DESC NULLS LAST, ga.created_at DESC
   LIMIT 1;
  IF v_guarantee_id IS NULL THEN
    RAISE EXCEPTION 'garantia_nao_aprovada' USING HINT = 'O deal precisa de guarantee_analyses com result approved ou approved_conditioned antes de gerar contrato.';
  END IF;

  SELECT d.property_code INTO v_property FROM public.deals d WHERE d.id = p_deal_id;
  v_property := NULLIF(v_property, '');  -- property_code default e '' (string vazia); FK exige NULL ou id real

  BEGIN
    INSERT INTO public.lease_contracts
      (organization_id, deal_id, property_id, guarantee_analysis_id, status, metadata)
    VALUES (v_org, p_deal_id, v_property, v_guarantee_id, 'rascunho',
            COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT lc.id INTO v_existing FROM public.lease_contracts lc
     WHERE lc.deal_id = p_deal_id
       AND lc.status = ANY (ARRAY['rascunho','enviado','assinado','ativo'])
     LIMIT 1;
    out_contract_id := v_existing; out_created := false; RETURN NEXT; RETURN;
  END;

  INSERT INTO public.internal_notifications
    (organization_id, kind, deal_id, payload, status)
  VALUES
    (v_org, 'new_lease_contract', p_deal_id,
     jsonb_build_object('contract_id', v_new_id, 'guarantee_analysis_id', v_guarantee_id),
     'pending');

  out_contract_id := v_new_id; out_created := true; RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_lease_contract(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_lease_contract(text,jsonb) TO authenticated, service_role;

-- 6) RPC: update_lease_contract_status (lifecycle com transicoes validas)
CREATE OR REPLACE FUNCTION public.update_lease_contract_status(
  p_contract_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL)
  RETURNS TABLE(out_contract_id uuid, out_status text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_signed timestamptz;
  v_active timestamptz;
  v_term timestamptz;
  v_ok boolean := false;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_new_status NOT IN ('rascunho','enviado','assinado','ativo','encerrado','cancelado') THEN
    RAISE EXCEPTION 'status_invalido';
  END IF;
  SELECT lc.id, lc.status, lc.signed_at, lc.activated_at, lc.terminated_at
    INTO v_locked
  FROM public.lease_contracts lc
  WHERE lc.id = p_contract_id AND lc.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contrato_nao_encontrado'; END IF;

  v_ok := CASE
    WHEN v_locked.status = p_new_status THEN true
    WHEN v_locked.status = 'rascunho' AND p_new_status IN ('enviado','cancelado') THEN true
    WHEN v_locked.status = 'enviado'  AND p_new_status IN ('assinado','rascunho','cancelado') THEN true
    WHEN v_locked.status = 'assinado' AND p_new_status IN ('ativo','cancelado') THEN true
    WHEN v_locked.status = 'ativo'    AND p_new_status IN ('encerrado','cancelado') THEN true
    ELSE false
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'transicao_invalida' USING HINT = format('de %s para %s nao e permitida', v_locked.status, p_new_status);
  END IF;

  v_signed := CASE WHEN p_new_status = 'assinado'  AND v_locked.signed_at     IS NULL THEN v_now ELSE v_locked.signed_at     END;
  v_active := CASE WHEN p_new_status = 'ativo'     AND v_locked.activated_at  IS NULL THEN v_now ELSE v_locked.activated_at  END;
  v_term   := CASE WHEN p_new_status IN ('encerrado','cancelado') AND v_locked.terminated_at IS NULL THEN v_now ELSE v_locked.terminated_at END;

  UPDATE public.lease_contracts
     SET status        = p_new_status,
         signed_at     = v_signed,
         activated_at  = v_active,
         terminated_at = v_term,
         metadata      = CASE WHEN p_reason IS NULL THEN metadata
                              ELSE metadata || jsonb_build_object('last_status_reason', p_reason) END,
         updated_at    = v_now
   WHERE id = p_contract_id;

  out_contract_id := p_contract_id; out_status := p_new_status; RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_lease_contract_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_lease_contract_status(uuid,text,text) TO authenticated, service_role;

-- 7) RPC: set_lease_contract_field (escreve em custom_fields_response.<key>)
CREATE OR REPLACE FUNCTION public.set_lease_contract_field(
  p_contract_id uuid,
  p_field_key text,
  p_value jsonb)
  RETURNS TABLE(out_contract_id uuid, out_field_key text, out_value jsonb)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_org_id();
  v_exists boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF NOT (public.is_org_admin() OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_field_key IS NULL OR length(trim(p_field_key)) = 0 THEN
    RAISE EXCEPTION 'field_key_obrigatorio';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lease_contract_field_defs d
    WHERE d.organization_id = v_org AND d.field_key = p_field_key AND d.is_active
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'field_def_nao_encontrado' USING HINT = 'Cadastre o campo em lease_contract_field_defs antes de gravar.';
  END IF;

  PERFORM 1 FROM public.lease_contracts lc
   WHERE lc.id = p_contract_id AND lc.organization_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contrato_nao_encontrado'; END IF;

  UPDATE public.lease_contracts
     SET custom_fields_response = jsonb_set(
           COALESCE(custom_fields_response, '{}'::jsonb),
           ARRAY[p_field_key],
           COALESCE(p_value, 'null'::jsonb),
           true),
         updated_at = now()
   WHERE id = p_contract_id;

  out_contract_id := p_contract_id; out_field_key := p_field_key; out_value := p_value;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_lease_contract_field(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lease_contract_field(uuid,text,jsonb) TO authenticated, service_role;

-- 8) Seed dos field_defs default (4 secoes)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = '11111111-1111-1111-1111-111111111111') THEN
    INSERT INTO public.lease_contract_field_defs
      (organization_id, section, field_key, label, field_type, options, position, is_default)
    VALUES
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_nome','Nome completo','text','[]'::jsonb,1,true),
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_cpf','CPF','text','[]'::jsonb,2,true),
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_rg','RG','text','[]'::jsonb,3,true),
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_estado_civil','Estado civil','single_select',
        '["Solteiro(a)","Casado(a)","Divorciado(a)","Viuvo(a)","Uniao estavel"]'::jsonb,4,true),
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_profissao','Profissao','text','[]'::jsonb,5,true),
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_email','E-mail','text','[]'::jsonb,6,true),
      ('11111111-1111-1111-1111-111111111111','dados_cliente','cliente_telefone','Telefone','text','[]'::jsonb,7,true),
      ('11111111-1111-1111-1111-111111111111','dados_imobiliaria','imob_razao_social','Razao social da imobiliaria','text','[]'::jsonb,1,true),
      ('11111111-1111-1111-1111-111111111111','dados_imobiliaria','imob_cnpj','CNPJ','text','[]'::jsonb,2,true),
      ('11111111-1111-1111-1111-111111111111','dados_imobiliaria','imob_creci','CRECI','text','[]'::jsonb,3,true),
      ('11111111-1111-1111-1111-111111111111','dados_imobiliaria','locador_nome','Nome do locador (proprietario)','text','[]'::jsonb,4,true),
      ('11111111-1111-1111-1111-111111111111','dados_imobiliaria','locador_cpf_cnpj','CPF/CNPJ do locador','text','[]'::jsonb,5,true),
      ('11111111-1111-1111-1111-111111111111','dados_imobiliaria','locador_telefone','Telefone do locador','text','[]'::jsonb,6,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_logradouro','Logradouro (rua/avenida)','text','[]'::jsonb,1,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_numero','Numero','text','[]'::jsonb,2,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_complemento','Complemento','text','[]'::jsonb,3,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_bairro','Bairro','text','[]'::jsonb,4,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_cidade','Cidade','text','[]'::jsonb,5,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_uf','UF','single_select',
        '["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]'::jsonb,6,true),
      ('11111111-1111-1111-1111-111111111111','endereco_imovel','endereco_cep','CEP','text','[]'::jsonb,7,true),
      ('11111111-1111-1111-1111-111111111111','garantia','garantia_tipo','Tipo de garantia','multi_select',
        '["fiador","caucao","seguro_fianca","titulo_capitalizacao"]'::jsonb,1,true),
      ('11111111-1111-1111-1111-111111111111','garantia','garantia_provider','Seguradora/Emissora (se aplicavel)','text','[]'::jsonb,2,true),
      ('11111111-1111-1111-1111-111111111111','garantia','garantia_observacoes','Observacoes da garantia','text','[]'::jsonb,3,true)
    ON CONFLICT (organization_id, field_key) DO NOTHING;
  END IF;
END
$do$;

COMMIT;