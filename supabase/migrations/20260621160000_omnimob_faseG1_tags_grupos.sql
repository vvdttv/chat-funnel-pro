-- ============================================================================
-- Fase G-1 — Tags em grupos + obrigatoriedade por etapa + motivos recup/definit
-- Omnimob v3. Idempotente. Não destrutivo. (§4.7 + conceito CRM Enermac Mod8)
--
-- Traz o conceito de GRUPOS DE TAGS com regra de obrigatoriedade:
--   selection_mode: single (uma) | multi (várias)
--   requirement: required_to_advance | optional | situational
-- + temperatura obrigatória por etapa + vínculo grupo↔etapa.
-- + classifica motivos de perda em recuperável (→nutrição) vs definitivo (encerra).
-- Motor de sugestão da IA = Fase G-2 (com a Fase I). Automações N1/N2/N3 = adiado.
-- ============================================================================

-- ---- 1. Grupos de tags ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tag_groups (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  selection_mode  text NOT NULL DEFAULT 'single',   -- single | multi
  description     text NOT NULL DEFAULT '',
  position        int  NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_groups_org_code_key UNIQUE (organization_id, code),
  CONSTRAINT tag_groups_sel_chk CHECK (selection_mode IN ('single','multi'))
);
ALTER TABLE public.tag_groups ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tag_groups' AND policyname='omni_tag_groups_select') THEN
    CREATE POLICY omni_tag_groups_select ON public.tag_groups FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
    CREATE POLICY omni_tag_groups_write ON public.tag_groups TO authenticated
      USING (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())))
      WITH CHECK (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())));
  END IF;
END $p$;

-- ---- 2. Estende deal_tags: pertence a um grupo + critérios mensuráveis -------
ALTER TABLE public.deal_tags
  ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.tag_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',   -- approved | pending (sugestão IA)
  ADD COLUMN IF NOT EXISTS position int NOT NULL DEFAULT 0;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deal_tags_status_chk') THEN
    ALTER TABLE public.deal_tags ADD CONSTRAINT deal_tags_status_chk CHECK (status IN ('approved','pending'));
  END IF;
END $c$;

-- ---- 3. Vínculo grupo↔etapa com obrigatoriedade -----------------------------
CREATE TABLE IF NOT EXISTS public.stage_tag_requirements (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_id       text NOT NULL,
  stage_id        text NOT NULL,
  group_id        bigint NOT NULL REFERENCES public.tag_groups(id) ON DELETE CASCADE,
  requirement     text NOT NULL DEFAULT 'optional',  -- required_to_advance | optional | situational
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT str_uniq UNIQUE (organization_id, funnel_id, stage_id, group_id),
  CONSTRAINT str_req_chk CHECK (requirement IN ('required_to_advance','optional','situational'))
);
ALTER TABLE public.stage_tag_requirements ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stage_tag_requirements' AND policyname='omni_str_select') THEN
    CREATE POLICY omni_str_select ON public.stage_tag_requirements FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
    CREATE POLICY omni_str_write ON public.stage_tag_requirements TO authenticated
      USING (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())))
      WITH CHECK (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())));
  END IF;
END $p$;

-- ---- 4. Seed dos grupos + tags (org MCMV) -----------------------------------
DO $do$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  g_temp bigint; g_obj bigint; g_dec bigint; g_marco bigint;
BEGIN
  -- Grupos
  INSERT INTO public.tag_groups (organization_id, code, name, selection_mode, description, position)
  VALUES
    (v_org,'temperatura','Temperatura','single','Quão quente está o lead. Obrigatória por etapa.',1),
    (v_org,'objecoes','Objeções','multi','Objeções identificadas. Marcar todas.',2),
    (v_org,'tipo_decisao','Tipo de decisão','single','Quem decide a compra.',3),
    (v_org,'marco','Marcos / Situacional','multi','Marcos de progresso e estados temporários.',4)
  ON CONFLICT (organization_id, code) DO UPDATE SET name=EXCLUDED.name, updated_at=now();

  SELECT id INTO g_temp  FROM public.tag_groups WHERE organization_id=v_org AND code='temperatura';
  SELECT id INTO g_obj   FROM public.tag_groups WHERE organization_id=v_org AND code='objecoes';
  SELECT id INTO g_dec   FROM public.tag_groups WHERE organization_id=v_org AND code='tipo_decisao';
  SELECT id INTO g_marco FROM public.tag_groups WHERE organization_id=v_org AND code='marco';

  -- Temperatura (frio/morno/quente/fervendo) com critérios mensuráveis.
  -- Reaproveita as seeds Quente/Morno/Frio (atualiza grupo); adiciona Fervendo.
  UPDATE public.deal_tags SET group_id=g_temp, position=1, criteria='{"regra":"sem resposta >24h ou só curiosidade"}'::jsonb WHERE organization_id=v_org AND name='Frio';
  UPDATE public.deal_tags SET group_id=g_temp, position=2, criteria='{"regra":"respondeu mas sem urgência; objeções abertas"}'::jsonb WHERE organization_id=v_org AND name='Morno';
  UPDATE public.deal_tags SET group_id=g_temp, position=3, criteria='{"regra":"respondeu <2h, pediu valores/condições"}'::jsonb WHERE organization_id=v_org AND name='Quente';
  INSERT INTO public.deal_tags (organization_id, name, color, group_id, position, criteria, status)
  VALUES (v_org,'Fervendo','#dc2626',g_temp,4,'{"regra":"pediu para agendar/fechar; enviou documento"}'::jsonb,'approved')
  ON CONFLICT (organization_id, name) DO UPDATE SET group_id=EXCLUDED.group_id, criteria=EXCLUDED.criteria;
  -- Prioridade/Recusa: realoca (Recusa→objeção; Prioridade→marco)
  UPDATE public.deal_tags SET group_id=g_obj WHERE organization_id=v_org AND name='Recusa';
  UPDATE public.deal_tags SET group_id=g_marco WHERE organization_id=v_org AND name='Prioridade';

  -- Objeções (múltipla) — contexto MCMV
  INSERT INTO public.deal_tags (organization_id, name, color, group_id, position, status) VALUES
    (v_org,'Objeção: preço/parcela','#f59e0b',g_obj,1,'approved'),
    (v_org,'Objeção: entrada','#f59e0b',g_obj,2,'approved'),
    (v_org,'Objeção: documentação','#f59e0b',g_obj,3,'approved'),
    (v_org,'Objeção: cônjuge/família','#f59e0b',g_obj,4,'approved'),
    (v_org,'Objeção: insegurança/medo','#f59e0b',g_obj,5,'approved')
  ON CONFLICT (organization_id, name) DO UPDATE SET group_id=EXCLUDED.group_id;

  -- Tipo de decisão (única)
  INSERT INTO public.deal_tags (organization_id, name, color, group_id, position, status) VALUES
    (v_org,'Decide sozinho','#3b82f6',g_dec,1,'approved'),
    (v_org,'Decide com cônjuge','#3b82f6',g_dec,2,'approved'),
    (v_org,'Decide com família','#3b82f6',g_dec,3,'approved')
  ON CONFLICT (organization_id, name) DO UPDATE SET group_id=EXCLUDED.group_id;

  -- 5. Temperatura OBRIGATÓRIA em todas as etapas do funil IA (§4.7)
  INSERT INTO public.stage_tag_requirements (organization_id, funnel_id, stage_id, group_id, requirement)
  SELECT v_org, fs.funnel_id, fs.stage_id, g_temp, 'required_to_advance'
  FROM public.funnel_stages fs WHERE fs.funnel_id='fun-ia-mcmv'
  ON CONFLICT (organization_id, funnel_id, stage_id, group_id) DO NOTHING;

  -- Objeções e tipo de decisão: obrigatórios a partir de ia-atendimento (etapa 2)
  INSERT INTO public.stage_tag_requirements (organization_id, funnel_id, stage_id, group_id, requirement)
  VALUES
    (v_org,'fun-ia-mcmv','ia-atendimento',g_dec,'required_to_advance'),
    (v_org,'fun-ia-mcmv','ia-atendimento',g_obj,'optional')
  ON CONFLICT (organization_id, funnel_id, stage_id, group_id) DO NOTHING;

  RAISE NOTICE 'Tags em grupos + obrigatoriedade por etapa seedadas';
END $do$;

-- ---- 6. Motivos de perda: recuperável (→nutrição) vs definitivo (encerra) ----
-- Conceito CRM Enermac Mod8: só recuperáveis roteiam p/ o funil de recuperação.
CREATE TABLE IF NOT EXISTS public.loss_reasons (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  label           text NOT NULL,
  kind            text NOT NULL DEFAULT 'recoverable',   -- recoverable | definitive
  nurture_stage_id text,            -- etapa do funil de nutrição (se recuperável)
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loss_reasons_org_code_key UNIQUE (organization_id, code),
  CONSTRAINT loss_reasons_kind_chk CHECK (kind IN ('recoverable','definitive'))
);
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='loss_reasons' AND policyname='omni_loss_reasons_select') THEN
    CREATE POLICY omni_loss_reasons_select ON public.loss_reasons FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
    CREATE POLICY omni_loss_reasons_write ON public.loss_reasons TO authenticated
      USING (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())))
      WITH CHECK (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())));
  END IF;
END $p$;

-- Seed dos motivos MCMV (code casa com o mapeamento de move_deal_to_nurture_internal)
INSERT INTO public.loss_reasons (organization_id, code, label, kind, nurture_stage_id) VALUES
  ('11111111-1111-1111-1111-111111111111','credito_reprovado','Crédito reprovado','recoverable','nut-credito-reprovado'),
  ('11111111-1111-1111-1111-111111111111','sem_resposta','Sem resposta (sumiu)','recoverable','nut-sem-resposta'),
  ('11111111-1111-1111-1111-111111111111','sem_interesse','Sem interesse no momento','recoverable','nut-sem-interesse'),
  ('11111111-1111-1111-1111-111111111111','concorrente','Comprou com concorrente','definitive',NULL),
  ('11111111-1111-1111-1111-111111111111','fora_perfil','Fora do perfil/região','definitive',NULL),
  ('11111111-1111-1111-1111-111111111111','curiosidade','Apenas curiosidade','definitive',NULL)
ON CONFLICT (organization_id, code) DO UPDATE SET label=EXCLUDED.label, kind=EXCLUDED.kind, nurture_stage_id=EXCLUDED.nurture_stage_id;

-- ---- 7. Ajusta set_deal_lost_internal: só recuperável vai p/ nutrição --------
CREATE OR REPLACE FUNCTION public.set_deal_lost_internal(
  p_deal_id text, p_reason text DEFAULT NULL, p_lost_substage text DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS TABLE(deal_id text, from_status text, to_status text, changed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_locked record;
  v_now timestamptz := now();
  v_kind text;
  v_motivo text := lower(COALESCE(p_lost_substage, p_reason, ''));
BEGIN
  SELECT id, status, organization_id, funnel_id INTO v_locked
  FROM public.deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;
  IF v_locked.organization_id IS NULL THEN RAISE EXCEPTION 'deal_sem_organizacao'; END IF;

  UPDATE public.deals
     SET status='lost', status_reason=COALESCE(p_reason,status_reason),
         lost_substage=COALESCE(p_lost_substage,lost_substage),
         status_changed_at=v_now, won_date=NULL, updated_at=v_now
   WHERE id = p_deal_id;

  IF v_locked.status IS DISTINCT FROM 'lost' THEN
    INSERT INTO public.deal_status_events
      (deal_id, organization_id, from_status, to_status, reason, lost_substage, changed_by, changed_at)
    VALUES (p_deal_id, v_locked.organization_id, v_locked.status, 'lost', p_reason, p_lost_substage, p_actor_id, v_now);
  END IF;

  -- Classifica o motivo: só RECUPERÁVEL vai p/ nutrição. Definitivo encerra.
  -- Heurística: casa por palavra-chave com loss_reasons.kind. Default recoverable
  -- (na dúvida, nutre — mais seguro que descartar um lead com retorno possível).
  SELECT lr.kind INTO v_kind
  FROM public.loss_reasons lr
  WHERE lr.organization_id = v_locked.organization_id AND lr.is_active
    AND (v_motivo LIKE '%'||lr.code||'%'
         OR v_motivo LIKE '%reprov%' AND lr.code='credito_reprovado'
         OR v_motivo LIKE '%concorrente%' AND lr.code='concorrente'
         OR v_motivo LIKE '%interesse%' AND lr.code='sem_interesse'
         OR v_motivo LIKE '%perfil%' AND lr.code='fora_perfil')
  ORDER BY length(lr.code) DESC LIMIT 1;
  v_kind := COALESCE(v_kind, 'recoverable');

  IF v_locked.funnel_id IS DISTINCT FROM 'fun-nutricao-mcmv' AND v_kind = 'recoverable' THEN
    BEGIN
      PERFORM public.move_deal_to_nurture_internal(p_deal_id, COALESCE(p_lost_substage, p_reason));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'falha ao mover deal % p/ nutrição: %', p_deal_id, SQLERRM;
    END;
  END IF;

  deal_id := p_deal_id; from_status := v_locked.status; to_status := 'lost'; changed_at := v_now;
  RETURN NEXT;
END;
$fn$;
