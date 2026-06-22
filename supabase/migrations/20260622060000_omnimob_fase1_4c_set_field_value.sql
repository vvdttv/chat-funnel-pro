-- ====================================================================
-- Migration 20260622060000_omnimob_fase1_4c_set_field_value.sql
-- Fase 1.4c — RPCs de UPSERT de deal_field_values (IA + humano).
--
-- set_deal_field_value (authenticated): humano (corretor dono / admin)
--   preenche campos owner ∈ {corretor, ambos}. Recusa campos owner='ia'.
--   source = admin|corretor; updated_by = auth.uid().
--
-- set_deal_field_value_internal (service_role): a IA grava o dado factual
--   coletado da conversa (source='ia'). NUNCA sobrescreve valor preenchido
--   por humano (ON CONFLICT DO UPDATE só quando a linha existente é source='ia').
--
-- Ambas casam o critério por id (preferencial) ou por (org,funnel,stage,key)
-- da etapa ATUAL do deal, e derivam o owner do critério.
-- ====================================================================
BEGIN;

-- ---- set_deal_field_value (HUMANO) ----
CREATE OR REPLACE FUNCTION public.set_deal_field_value(
  p_deal_id text,
  p_field_key text,
  p_value jsonb,
  p_criterion_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(out_id uuid, out_deal_id text, out_field_key text, out_value jsonb, out_owner text, out_source text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $SDFV$
DECLARE
  v_org uuid := public.current_org_id();
  v_is_admin boolean := public.is_org_admin();
  v_deal record;
  v_crit record;
  v_source text;
  v_owner text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;

  SELECT d.id, d.funnel_id, d.stage_id, d.assigned_to, d.organization_id
    INTO v_deal
  FROM public.deals d
  WHERE d.id = p_deal_id AND d.organization_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;

  IF NOT v_is_admin AND v_deal.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;

  -- Resolve o critério: por id (preferencial) ou por key na etapa atual do deal.
  IF p_criterion_id IS NOT NULL THEN
    SELECT c.id, c.key, c.owner INTO v_crit
    FROM public.stage_qualification_criteria c
    WHERE c.id = p_criterion_id AND c.organization_id = v_org;
  ELSE
    SELECT c.id, c.key, c.owner INTO v_crit
    FROM public.stage_qualification_criteria c
    WHERE c.organization_id = v_org
      AND c.funnel_id = v_deal.funnel_id
      AND c.stage_id  = v_deal.stage_id
      AND c.key = p_field_key;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'criterio_nao_encontrado'; END IF;

  -- Humano não edita campo da IA (separação por owner).
  IF v_crit.owner = 'ia' THEN
    RAISE EXCEPTION 'campo_da_ia_nao_editavel';
  END IF;

  v_owner  := v_crit.owner;
  v_source := CASE WHEN v_is_admin THEN 'admin' ELSE 'corretor' END;

  INSERT INTO public.deal_field_values
    (organization_id, deal_id, criterion_id, field_key, value, owner, source, updated_by)
  VALUES
    (v_org, p_deal_id, v_crit.id, v_crit.key, COALESCE(p_value, 'null'::jsonb), v_owner, v_source, auth.uid())
  ON CONFLICT (deal_id, field_key) DO UPDATE
    SET value        = EXCLUDED.value,
        criterion_id = EXCLUDED.criterion_id,
        owner        = EXCLUDED.owner,
        source       = EXCLUDED.source,
        updated_by   = EXCLUDED.updated_by,
        updated_at   = now();

  SELECT v.id, v.deal_id, v.field_key, v.value, v.owner, v.source
    INTO out_id, out_deal_id, out_field_key, out_value, out_owner, out_source
  FROM public.deal_field_values v
  WHERE v.deal_id = p_deal_id AND v.field_key = v_crit.key;
  RETURN NEXT;
END;
$SDFV$;
REVOKE ALL ON FUNCTION public.set_deal_field_value(text,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_deal_field_value(text,text,jsonb,uuid) TO authenticated;

-- ---- set_deal_field_value_internal (IA / service_role) ----
CREATE OR REPLACE FUNCTION public.set_deal_field_value_internal(
  p_deal_id text,
  p_field_key text,
  p_value jsonb,
  p_org uuid,
  p_criterion_id uuid DEFAULT NULL::uuid,
  p_owner text DEFAULT 'ia'
) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $SDFVI$
DECLARE
  v_deal record;
  v_crit record;
  v_owner text := COALESCE(p_owner, 'ia');
  v_crit_id uuid := p_criterion_id;
  v_key text := p_field_key;
BEGIN
  IF p_org IS NULL THEN RAISE EXCEPTION 'org_obrigatoria'; END IF;

  SELECT d.id, d.funnel_id, d.stage_id, d.organization_id
    INTO v_deal
  FROM public.deals d
  WHERE d.id = p_deal_id AND d.organization_id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;

  -- Resolve critério p/ derivar owner/key canônico (best match na etapa atual).
  IF v_crit_id IS NOT NULL THEN
    SELECT c.id, c.key, c.owner INTO v_crit
    FROM public.stage_qualification_criteria c
    WHERE c.id = v_crit_id AND c.organization_id = p_org;
  ELSE
    SELECT c.id, c.key, c.owner INTO v_crit
    FROM public.stage_qualification_criteria c
    WHERE c.organization_id = p_org
      AND c.funnel_id = v_deal.funnel_id
      AND c.stage_id  = v_deal.stage_id
      AND c.key = p_field_key;
  END IF;
  IF FOUND THEN
    v_crit_id := v_crit.id;
    v_key     := v_crit.key;
    v_owner   := v_crit.owner;
  END IF;

  INSERT INTO public.deal_field_values
    (organization_id, deal_id, criterion_id, field_key, value, owner, source, updated_by)
  VALUES
    (p_org, p_deal_id, v_crit_id, v_key, COALESCE(p_value, 'null'::jsonb), v_owner, 'ia', NULL)
  ON CONFLICT (deal_id, field_key) DO UPDATE
    SET value        = EXCLUDED.value,
        criterion_id = COALESCE(EXCLUDED.criterion_id, public.deal_field_values.criterion_id),
        owner        = EXCLUDED.owner,
        updated_at   = now()
    -- NUNCA sobrescreve dado preenchido por humano: só atualiza se a linha é da IA.
    WHERE public.deal_field_values.source = 'ia';
END;
$SDFVI$;
REVOKE ALL ON FUNCTION public.set_deal_field_value_internal(text,text,jsonb,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_deal_field_value_internal(text,text,jsonb,uuid,uuid,text) TO service_role;

COMMIT;
