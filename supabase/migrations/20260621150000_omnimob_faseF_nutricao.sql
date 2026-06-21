-- ============================================================================
-- Fase F — Funil de Nutrição e Resgate (§4.5)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- Funil SEPARADO onde "etapas = motivos de perda". Recebe perdidos da IA E do
-- corretor. Cada card carrega cadência (followup_ladders). Só admin cria motivos
-- novos (motivo novo = etapa nova) — garantido pela RLS de escrita (admin) já
-- existente em funnel_stages. Reativação (lead responde → volta à IA etapa 2)
-- fica para quando o inbound detectar deal de nutrição (gancho no webhook, fase
-- posterior); aqui criamos a estrutura + o "pouso" do perdido.
-- ============================================================================
DO $do$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_funnel text := 'fun-nutricao-mcmv';
  r record;
BEGIN
  -- 1) Funil de nutrição (separado; não-IA, operado pela cadência de resgate).
  INSERT INTO public.funnels (id, name, description, icon, color, stages, position, organization_id, is_default, context_tags, is_ai_funnel)
  VALUES (v_funnel, 'Funil de Nutrição e Resgate',
          'Recebe leads perdidos (da IA e do corretor). Etapas = motivos de perda. Cadência de resgate por motivo.',
          'Sprout', 'hsl(var(--primary))', '[]'::jsonb, 3, v_org, false, '["nutricao","resgate","mcmv"]'::jsonb, false)
  ON CONFLICT (id) DO NOTHING;

  -- 2) Etapas = motivos de perda. (stage_id, nome, posição, cadência sugerida)
  FOR r IN
    SELECT * FROM (VALUES
      ('nut-credito-reprovado','Crédito reprovado',        1,'ladder-longa'),
      ('nut-sem-resposta',     'Sem resposta (sumiu)',     2,'ladder-media'),
      ('nut-sem-interesse',    'Sem interesse no momento', 3,'ladder-longa'),
      ('nut-concorrente',      'Comprou com concorrente',  4,'ladder-longa'),
      ('nut-fora-perfil',      'Fora do perfil/região',    5,'ladder-longa')
    ) AS t(stage_id,nome,pos,ladder)
  LOOP
    INSERT INTO public.funnel_stages
      (organization_id, funnel_id, stage_id, position, purpose, context_tags, ai_autonomy_mode)
    VALUES
      (v_org, v_funnel, r.stage_id, r.pos,
       'Motivo de perda: '||r.nome||'. Cadência de resgate: '||r.ladder||'.',
       jsonb_build_object('ladder', r.ladder, 'motivo', r.nome),
       'suggest_only')
    ON CONFLICT (funnel_id, stage_id) DO UPDATE
      SET purpose=EXCLUDED.purpose, context_tags=EXCLUDED.context_tags, updated_at=now();
  END LOOP;

  -- 3) Reflete as etapas no array stages (jsonb) do funil (p/ a UI Kanban).
  UPDATE public.funnels f
     SET stages = (
       SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', fs.stage_id, 'name', split_part(fs.purpose,': ',2),
                'probability', 0, 'touchpoints', '[]'::jsonb, 'maxDaysInStage', 30)
              ORDER BY fs.position), '[]'::jsonb)
       FROM public.funnel_stages fs WHERE fs.funnel_id = v_funnel
     ), updated_at = now()
   WHERE f.id = v_funnel;

  RAISE NOTICE 'Funil de nutrição criado com 5 etapas-motivo';
END
$do$;

-- ---- 4. move_deal_to_nurture_internal: cria card no funil de nutrição -------
-- Mapeia o motivo (lost_substage) → etapa do funil de nutrição. Cria card-espelho
-- (mirror_deal_id = deal de origem) preservando histórico, na etapa = motivo.
-- Idempotente: não duplica se já há card de nutrição p/ o mesmo deal de origem.
-- Mapa de motivo: heurística por palavra-chave; default = sem-resposta.
CREATE OR REPLACE FUNCTION public.move_deal_to_nurture_internal(
  p_origin_deal_id text,
  p_motivo text DEFAULT NULL
)
RETURNS TABLE(nurture_deal_id text, stage_id text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org uuid;
  v_deal record;
  v_stage text;
  v_new_id text;
  v_existing text;
  v_motivo text := lower(COALESCE(p_motivo, ''));
BEGIN
  SELECT d.organization_id, d.lead_id, d.lead_name, d.property, d.property_code, d.value, d.status_reason, d.lost_substage
    INTO v_deal
  FROM public.deals d WHERE d.id = p_origin_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_origem_nao_encontrado'; END IF;
  v_org := v_deal.organization_id;

  PERFORM pg_advisory_xact_lock(hashtext('omnimob_nurture_' || p_origin_deal_id));

  -- Idempotência: já há card de nutrição espelhando este deal?
  SELECT d.id INTO v_existing
  FROM public.deals d
  WHERE d.organization_id = v_org
    AND d.funnel_id = 'fun-nutricao-mcmv'
    AND d.mirror_deal_id = p_origin_deal_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    nurture_deal_id := v_existing;
    SELECT d.stage_id INTO stage_id FROM public.deals d WHERE d.id = v_existing;
    created := false;
    RETURN NEXT; RETURN;
  END IF;

  -- Mapeia motivo → etapa (heurística por palavra-chave; usa lost_substage se p_motivo nulo).
  IF v_motivo = '' THEN v_motivo := lower(COALESCE(v_deal.lost_substage, v_deal.status_reason, '')); END IF;
  v_stage := CASE
    WHEN v_motivo LIKE '%reprov%' OR v_motivo LIKE '%credito%' OR v_motivo LIKE '%crédito%' OR v_motivo LIKE '%score%' THEN 'nut-credito-reprovado'
    WHEN v_motivo LIKE '%interesse%' THEN 'nut-sem-interesse'
    WHEN v_motivo LIKE '%concorrente%' OR v_motivo LIKE '%comprou%' THEN 'nut-concorrente'
    WHEN v_motivo LIKE '%perfil%' OR v_motivo LIKE '%regi%' THEN 'nut-fora-perfil'
    ELSE 'nut-sem-resposta'
  END;

  v_new_id := 'nutdeal-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.deals
    (id, funnel_id, stage_id, lead_id, lead_name, property, property_code, value,
     status, organization_id, mirror_deal_id, status_reason)
  VALUES
    (v_new_id, 'fun-nutricao-mcmv', v_stage, v_deal.lead_id, v_deal.lead_name,
     v_deal.property, v_deal.property_code, v_deal.value, 'open', v_org,
     p_origin_deal_id, COALESCE(p_motivo, v_deal.status_reason, 'perdido'));

  nurture_deal_id := v_new_id;
  stage_id := v_stage;
  created := true;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.move_deal_to_nurture_internal(text, text) FROM anon, authenticated, public;

-- ---- 5. Plug no set_deal_lost_internal: perdido → nutrição (best-effort) ----
-- Após marcar lost, cria o card de nutrição. Best-effort: falha na nutrição NÃO
-- impede o registro da perda (loga warning). Idempotente pela função acima.
CREATE OR REPLACE FUNCTION public.set_deal_lost_internal(
  p_deal_id text, p_reason text DEFAULT NULL, p_lost_substage text DEFAULT NULL, p_actor_id uuid DEFAULT NULL)
RETURNS TABLE(deal_id text, from_status text, to_status text, changed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_locked record;
  v_now timestamptz := now();
BEGIN
  SELECT id, status, organization_id, funnel_id INTO v_locked
  FROM public.deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_nao_encontrado'; END IF;
  IF v_locked.organization_id IS NULL THEN RAISE EXCEPTION 'deal_sem_organizacao'; END IF;

  UPDATE public.deals
     SET status = 'lost',
         status_reason = COALESCE(p_reason, status_reason),
         lost_substage = COALESCE(p_lost_substage, lost_substage),
         status_changed_at = v_now, won_date = NULL, updated_at = v_now
   WHERE id = p_deal_id;

  IF v_locked.status IS DISTINCT FROM 'lost' THEN
    INSERT INTO public.deal_status_events
      (deal_id, organization_id, from_status, to_status, reason, lost_substage, changed_by, changed_at)
    VALUES
      (p_deal_id, v_locked.organization_id, v_locked.status, 'lost', p_reason, p_lost_substage, p_actor_id, v_now);
  END IF;

  -- §4.4/4.5: perdido entra no Funil de Nutrição. NÃO cria nutrição a partir do
  -- próprio funil de nutrição (evita loop). Best-effort.
  IF v_locked.funnel_id IS DISTINCT FROM 'fun-nutricao-mcmv' THEN
    BEGIN
      PERFORM public.move_deal_to_nurture_internal(p_deal_id, COALESCE(p_lost_substage, p_reason));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'falha ao mover deal % p/ nutrição: %', p_deal_id, SQLERRM;
    END;
  END IF;

  deal_id := p_deal_id;
  from_status := v_locked.status;
  to_status := 'lost';
  changed_at := v_now;
  RETURN NEXT;
END;
$fn$;
